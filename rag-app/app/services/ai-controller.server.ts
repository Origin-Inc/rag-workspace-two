import { 
  openai, 
  createChatCompletion, 
  parseDatabaseCommand,
  parseFormulaCommand,
  isOpenAIConfigured,
  SYSTEM_PROMPTS 
} from './openai.server';
import { createSupabaseAdmin } from '~/utils/supabase.server';
import {
  type Action,
  type ActionPreview,
  type CommandParseResult,
  type Column,
  ActionSchema,
  CommandParseResultSchema,
  getSuggestedColumns,
  suggestColumnType
} from '~/types/ai-actions';
import { DebugLogger } from '~/utils/debug-logger';

// Check if OpenAI is configured
if (!isOpenAIConfigured()) {
  console.warn('OpenAI API not configured - AI features will be limited');
}

export class AIControllerService {
  public readonly supabase = createSupabaseAdmin();
  private logger = new DebugLogger('AIControllerService');

  /**
   * Parse natural language command into structured actions
   */
  async parseCommand(
    command: string,
    workspaceId: string,
    userId: string
  ): Promise<CommandParseResult> {
    this.logger.trace('parseCommand', [command, workspaceId, userId]);
    
    try {
      // Create the system prompt with context
      const systemPrompt = this.createSystemPrompt();
      this.logger.debug('System prompt created', { promptLength: systemPrompt.length });
      
      // Check if OpenAI is available
      if (!isOpenAIConfigured()) {
        this.logger.error('OpenAI not configured');
        throw new Error('AI features are not configured. Please set up your OpenAI API key.');
      }
      this.logger.debug('OpenAI is configured');

      // Call OpenAI with enhanced error handling
      this.logger.info('Calling OpenAI API');
      const completion = await this.logger.timeOperation(
        'OpenAI API Call',
        () => createChatCompletion(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: command }
          ],
          {
            functions: this.getActionSchemas(),
            functionCall: 'auto',
            temperature: 0.3,
            maxTokens: 2000
          }
        )
      );

      const message = completion.choices[0]?.message;
      this.logger.debug('OpenAI response received', { 
        hasMessage: !!message,
        hasFunctionCall: !!(message?.function_call),
        functionName: message?.function_call?.name
      });
      
      // Parse the function call into actions
      const actions: Action[] = [];
      if (message && message.function_call) {
        try {
          const functionName = message.function_call.name;
          const functionArgs = JSON.parse(message.function_call.arguments);
          
          // Map function call to action
          const action = this.mapFunctionToAction(
            functionName,
            functionArgs,
            workspaceId,
            userId
          );
          
          if (action) {
            actions.push(action);
          }
        } catch (parseError) {
          console.error('Error parsing function call:', parseError);
          // Continue with empty actions array
        }
      }

      // Extract intent and confidence
      const intent = this.extractIntent(command, actions);
      const confidence = this.calculateConfidence(command, actions);

      const result: CommandParseResult = {
        command,
        intent,
        confidence,
        actions,
        suggestions: this.generateSuggestions(command, actions)
      };

      this.logger.info('Command parsed successfully', {
        intent,
        confidence,
        actionCount: actions.length
      });

      return CommandParseResultSchema.parse(result);
    } catch (error) {
      this.logger.error('Error parsing command', error);
      throw new Error('Failed to parse command');
    }
  }

  /**
   * Generate preview for actions
   */
  async generatePreview(
    actions: Action[],
    workspaceId: string
  ): Promise<ActionPreview[]> {
    const previews: ActionPreview[] = [];

    for (const action of actions) {
      const preview = await this.generateActionPreview(action, workspaceId);
      previews.push(preview);
    }

    return previews;
  }

  /**
   * Execute confirmed actions
   */
  async executeActions(
    actionLogId: string,
    actions: Action[],
    workspaceId: string,
    userId: string
  ): Promise<{ success: boolean; results: any[] }> {
    const results = [];

    try {
      // Start transaction
      for (const action of actions) {
        const result = await this.executeAction(action, workspaceId, userId);
        results.push(result);
      }

      // Update action log status
      await this.supabase
        .from('action_logs')
        .update({
          status: 'completed',
          executed_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          result: results
        })
        .eq('id', actionLogId);

      return { success: true, results };
    } catch (error) {
      // Update action log with error
      await this.supabase
        .from('action_logs')
        .update({
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        .eq('id', actionLogId);

      throw error;
    }
  }

  /**
   * Store action log with preview
   */
  async storeActionLog(
    command: string,
    parsedResult: CommandParseResult,
    preview: ActionPreview[],
    workspaceId: string,
    userId: string
  ): Promise<string> {
    this.logger.trace('storeActionLog', [command, workspaceId, userId]);
    
    const insertData = {
      workspace_id: workspaceId,
      user_id: userId,
      command,
      parsed_action: parsedResult,
      action_type: parsedResult.actions.length > 0 ? this.getActionType(parsedResult.actions[0]) : null,
      preview,
      preview_shown: false,
      status: 'pending'
    };
    
    this.logger.debug('Attempting to insert action log', insertData);
    
    const { data, error } = await this.logger.timeOperation(
      'Insert action_log to Supabase',
      () => this.supabase
        .from('action_logs')
        .insert(insertData)
        .select('id')
        .single()
    );

    if (error) {
      this.logger.error('Supabase error storing action log', {
        error,
        errorMessage: error.message,
        errorDetails: error.details,
        errorHint: error.hint,
        errorCode: error.code,
        insertData
      });
      
      // Check if it's a database connectivity issue
      if (error.code === 'PGRST000' || error.code === '42P01') {
        this.logger.error('Database table may not exist or is inaccessible');
      }
      
      throw new Error(`Failed to store action log: ${error.message || JSON.stringify(error)}`);
    }

    this.logger.info('Action log stored successfully', { id: data.id });
    return data.id;
  }

  /**
   * Confirm action and mark for execution
   */
  async confirmAction(actionLogId: string): Promise<void> {
    const { error } = await this.supabase
      .from('action_logs')
      .update({
        preview_shown: true,
        confirmed_at: new Date().toISOString(),
        status: 'confirmed'
      })
      .eq('id', actionLogId);

    if (error) {
      throw new Error('Failed to confirm action');
    }
  }

  // Private helper methods

  private createSystemPrompt(): string {
    return SYSTEM_PROMPTS.COMMAND_INTERPRETER;
  }

  private getActionSchemas() {
    return [
      {
        name: 'create_database',
        description: 'Create a new database block with columns',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the database'
            },
            description: {
              type: 'string',
              description: 'Optional description'
            },
            columns: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: { 
                    type: 'string',
                    enum: ['text', 'number', 'date', 'select', 'checkbox', 'currency', 'percent', 'user', 'formula']
                  },
                  formula: { type: 'string' },
                  options: { type: 'array', items: { type: 'string' } },
                  isRequired: { type: 'boolean' }
                },
                required: ['name', 'type']
              }
            }
          },
          required: ['name', 'columns']
        }
      },
      {
        name: 'add_column',
        description: 'Add a column to an existing database',
        parameters: {
          type: 'object',
          properties: {
            databaseBlockId: { type: 'string' },
            columnName: { type: 'string' },
            columnType: { type: 'string' },
            formula: { type: 'string' },
            options: { type: 'array', items: { type: 'string' } }
          },
          required: ['columnName', 'columnType']
        }
      },
      {
        name: 'create_formula',
        description: 'Create a formula column that calculates values',
        parameters: {
          type: 'object',
          properties: {
            columnName: { type: 'string' },
            formula: { type: 'string' },
            description: { type: 'string' }
          },
          required: ['columnName', 'formula']
        }
      }
    ];
  }

  private mapFunctionToAction(
    functionName: string,
    args: any,
    workspaceId: string,
    userId: string
  ): Action | null {
    switch (functionName) {
      case 'create_database': {
        // Enhance columns with intelligent suggestions if needed
        let columns = args.columns || [];
        
        // If no columns provided or minimal columns, add suggestions
        if (columns.length === 0 || args.suggestColumns) {
          const suggestedColumns = getSuggestedColumns(args.name || '');
          columns = [...columns, ...suggestedColumns];
        }

        // Ensure column types are properly set
        columns = columns.map((col: any) => ({
          ...col,
          type: col.type || suggestColumnType(col.name)
        }));

        return {
          type: 'create_database',
          workspaceId,
          userId,
          name: args.name,
          description: args.description,
          columns,
          suggestedColumns: true
        };
      }

      case 'add_column': {
        return {
          type: 'add_column',
          workspaceId,
          userId,
          databaseBlockId: args.databaseBlockId || '', // Will need to resolve this
          column: {
            name: args.columnName,
            type: args.columnType || 'text',
            formula: args.formula,
            options: args.options
          }
        };
      }

      case 'create_formula': {
        return {
          type: 'create_formula',
          workspaceId,
          userId,
          databaseBlockId: '', // Will need to resolve this
          columnName: args.columnName,
          formula: args.formula,
          description: args.description
        };
      }

      default:
        return null;
    }
  }

  private async generateActionPreview(
    action: Action,
    workspaceId: string
  ): Promise<ActionPreview> {
    switch (action.type) {
      case 'create_database': {
        const columns = action.columns || [];
        return {
          actionId: crypto.randomUUID(),
          type: 'create_database',
          title: `Create Database: ${action.name}`,
          description: action.description || `Create a new database with ${columns.length} columns`,
          impact: {
            creates: [`Database "${action.name}" with ${columns.length} columns`],
            affects: 0
          },
          preview: {
            after: {
              name: action.name,
              columns: columns.map(col => ({
                name: col.name,
                type: col.type,
                required: col.isRequired || false
              })),
              sampleRow: this.generateSampleRow(columns)
            }
          },
          requiresConfirmation: true,
          reversible: true
        };
      }

      case 'add_column': {
        return {
          actionId: crypto.randomUUID(),
          type: 'add_column',
          title: `Add Column: ${action.column.name}`,
          description: `Add a new ${action.column.type} column to the database`,
          impact: {
            updates: ['Database structure'],
            affects: 1
          },
          preview: {
            after: {
              column: action.column
            }
          },
          requiresConfirmation: true,
          reversible: true
        };
      }

      case 'create_formula': {
        return {
          actionId: crypto.randomUUID(),
          type: 'create_formula',
          title: `Create Formula: ${action.columnName}`,
          description: `Add formula column that calculates: ${action.formula}`,
          impact: {
            creates: [`Formula column "${action.columnName}"`],
            affects: 0
          },
          preview: {
            after: {
              columnName: action.columnName,
              formula: action.formula,
              sampleCalculation: 'Preview: Result will appear here'
            }
          },
          requiresConfirmation: true,
          reversible: true
        };
      }

      default:
        return {
          actionId: crypto.randomUUID(),
          type: action.type,
          title: 'Unknown Action',
          description: 'This action type is not yet supported',
          impact: {},
          preview: { after: {} },
          requiresConfirmation: true,
          reversible: false
        };
    }
  }

  private generateSampleRow(columns: Column[]): Record<string, any> {
    const sample: Record<string, any> = {};
    
    for (const col of columns) {
      switch (col.type) {
        case 'text':
          sample[col.name] = 'Sample text';
          break;
        case 'number':
          sample[col.name] = 42;
          break;
        case 'date':
          sample[col.name] = new Date().toISOString().split('T')[0];
          break;
        case 'select':
          sample[col.name] = col.options?.[0] || 'Option 1';
          break;
        case 'checkbox':
          sample[col.name] = false;
          break;
        case 'currency':
          sample[col.name] = 100.00;
          break;
        case 'percent':
          sample[col.name] = 75;
          break;
        case 'user':
          sample[col.name] = 'John Doe';
          break;
        case 'formula':
          sample[col.name] = '(calculated)';
          break;
        default:
          sample[col.name] = null;
      }
    }
    
    return sample;
  }

  private async executeAction(
    action: Action,
    workspaceId: string,
    userId: string
  ): Promise<any> {
    switch (action.type) {
      case 'create_database': {
        // For simplicity, we'll create the database block directly
        // In a production app, you'd integrate with the existing page/block system
        
        // Use the newer db_blocks table which is simpler
        const { data: dbBlock, error: dbBlockError } = await this.supabase
          .from('db_blocks')
          .insert({
            block_id: crypto.randomUUID(), // Generate a unique block ID
            name: action.name,
            description: action.description || '',
            schema: action.columns,
            settings: {
              defaultView: 'table',
              allowAddRow: true,
              allowDeleteRow: true
            }
          })
          .select()
          .single();

        if (dbBlockError) {
          this.logger.error('Failed to create database block', dbBlockError);
          throw new Error(`Failed to create database block: ${dbBlockError.message}`);
        }

        // Create initial rows if needed (optional)
        // For now, just return success
        this.logger.info('Database created successfully', { 
          id: dbBlock.id, 
          name: action.name 
        });

        return { 
          success: true, 
          databaseBlockId: dbBlock.id,
          message: `Database "${action.name}" created successfully`
        };
      }

      case 'add_column': {
        // Add a column to an existing database
        const { data: column, error: colError } = await this.supabase
          .from('database_columns')
          .insert({
            database_block_id: action.databaseBlockId,
            column_id: `col_${Date.now()}`,
            name: action.column.name,
            type: action.column.type,
            position: 999, // Add at the end
            is_required: action.column.isRequired || false,
            options: action.column.options ? { 
              choices: action.column.options.map((opt, idx) => ({
                id: String(idx + 1),
                value: opt,
                color: 'blue'
              })) 
            } : {},
            default_value: action.column.defaultValue || null
          })
          .select()
          .single();

        if (colError) {
          this.logger.error('Failed to add column', colError);
          throw new Error(`Failed to add column: ${colError.message}`);
        }

        return { 
          success: true, 
          columnId: column.id,
          message: `Column "${action.column.name}" added successfully`
        };
      }

      case 'create_formula': {
        // Create a formula column
        const { data: formula, error: formulaError } = await this.supabase
          .from('database_columns')
          .insert({
            database_block_id: action.databaseBlockId,
            column_id: `formula_${Date.now()}`,
            name: action.columnName,
            type: 'formula',
            formula_expression: action.formula,
            position: 999,
            is_calculated: true
          })
          .select()
          .single();

        if (formulaError) {
          this.logger.error('Failed to create formula', formulaError);
          throw new Error(`Failed to create formula: ${formulaError.message}`);
        }

        return { 
          success: true, 
          formulaId: formula.id,
          message: `Formula column "${action.columnName}" created successfully`
        };
      }

      case 'create_block': {
        // Create a generic block (text, heading, etc.)
        const { data: block, error: blockError } = await this.supabase
          .from('blocks')
          .insert({
            page_id: action.pageId,
            type: action.blockType,
            content: action.content || {},
            properties: action.properties || {},
            position: action.position || 0
          })
          .select()
          .single();

        if (blockError) {
          this.logger.error('Failed to create block', blockError);
          throw new Error(`Failed to create block: ${blockError.message}`);
        }

        return { 
          success: true, 
          blockId: block.id,
          message: `${action.blockType} block created successfully`
        };
      }

      case 'update_block': {
        // Update an existing block
        const { error: updateError } = await this.supabase
          .from('blocks')
          .update(action.updates)
          .eq('id', action.blockId);

        if (updateError) {
          this.logger.error('Failed to update block', updateError);
          throw new Error(`Failed to update block: ${updateError.message}`);
        }

        return { 
          success: true, 
          message: 'Block updated successfully'
        };
      }

      case 'delete_block': {
        // Delete a block (soft or hard delete)
        if (action.softDelete) {
          const { error: deleteError } = await this.supabase
            .from('blocks')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', action.blockId);

          if (deleteError) {
            this.logger.error('Failed to soft delete block', deleteError);
            throw new Error(`Failed to delete block: ${deleteError.message}`);
          }
        } else {
          const { error: deleteError } = await this.supabase
            .from('blocks')
            .delete()
            .eq('id', action.blockId);

          if (deleteError) {
            this.logger.error('Failed to hard delete block', deleteError);
            throw new Error(`Failed to delete block: ${deleteError.message}`);
          }
        }

        return { 
          success: true, 
          message: 'Block deleted successfully'
        };
      }

      case 'move_block': {
        // Move a block to a different position or page
        const updates: any = { position: action.targetPosition };
        if (action.targetPageId) {
          updates.page_id = action.targetPageId;
        }

        const { error: moveError } = await this.supabase
          .from('blocks')
          .update(updates)
          .eq('id', action.blockId);

        if (moveError) {
          this.logger.error('Failed to move block', moveError);
          throw new Error(`Failed to move block: ${moveError.message}`);
        }

        return { 
          success: true, 
          message: 'Block moved successfully'
        };
      }

      case 'query_data': {
        // Query data from the workspace
        // This would typically integrate with the RAG system
        // For now, return a placeholder
        return { 
          success: true, 
          message: 'Query functionality will be implemented in Task 6 (RAG System)',
          query: action.query,
          results: []
        };
      }

      default:
        throw new Error(`Action type ${action.type} not implemented`);
    }
  }

  private extractIntent(command: string, actions: Action[]): string {
    if (actions.length === 0) return 'unknown';
    
    const action = actions[0];
    switch (action.type) {
      case 'create_database':
        return 'create_database_block';
      case 'add_column':
        return 'modify_database_structure';
      case 'create_formula':
        return 'add_calculation';
      default:
        return 'general_command';
    }
  }

  private calculateConfidence(command: string, actions: Action[]): number {
    if (actions.length === 0) return 0.1;
    
    // Simple confidence calculation based on command clarity
    const keywords = ['create', 'add', 'make', 'build', 'database', 'table', 'column', 'formula'];
    const matches = keywords.filter(kw => command.toLowerCase().includes(kw)).length;
    
    return Math.min(0.9, 0.3 + (matches * 0.15));
  }

  private generateSuggestions(
    command: string,
    actions: Action[]
  ): Array<{ text: string; reason: string }> {
    const suggestions = [];
    
    if (actions.length > 0 && actions[0].type === 'create_database') {
      const db = actions[0];
      if (!db.columns.find(col => col.type === 'formula')) {
        suggestions.push({
          text: 'Consider adding a formula column for calculations',
          reason: 'Formula columns can automatically calculate values based on other columns'
        });
      }
    }
    
    return suggestions;
  }

  private getActionType(action: Action): string {
    return action.type;
  }
}

export const aiControllerService = new AIControllerService();