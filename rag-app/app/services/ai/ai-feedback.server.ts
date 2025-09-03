/**
 * Natural Language Feedback System
 * Provides human-friendly explanations for AI actions and errors
 */

import { openai, isOpenAIConfigured } from '../openai.server';
import type { ParsedBlockCommand } from './block-commands.server';
import type { ExecutionResult, BlockChange } from './block-manipulator.server';
import type { Block } from '~/components/editor/EnhancedBlockEditor';

export interface FeedbackOptions {
  verbose?: boolean;
  includeConfidence?: boolean;
  suggestAlternatives?: boolean;
}

export class AIFeedbackService {
  private static instance: AIFeedbackService;

  private constructor() {}

  static getInstance(): AIFeedbackService {
    if (!AIFeedbackService.instance) {
      AIFeedbackService.instance = new AIFeedbackService();
    }
    return AIFeedbackService.instance;
  }

  /**
   * Generate success message for completed action
   */
  async generateSuccessMessage(
    command: ParsedBlockCommand,
    result: ExecutionResult,
    options: FeedbackOptions = {}
  ): Promise<string> {
    const changeCount = result.changes.length;
    const actionVerb = this.getActionVerb(command.action, true);
    
    let message = '';
    
    switch (command.action) {
      case 'create':
        const blockType = command.parameters.newType || 'block';
        message = `Successfully added a new ${blockType}`;
        break;
        
      case 'delete':
        message = `Removed ${changeCount} block${changeCount > 1 ? 's' : ''}`;
        break;
        
      case 'transform':
        const targetType = command.parameters.newType;
        message = `Transformed ${changeCount} block${changeCount > 1 ? 's' : ''} to ${targetType}`;
        break;
        
      case 'move':
        const position = command.parameters.position || 'new position';
        message = `Moved ${changeCount} block${changeCount > 1 ? 's' : ''} ${position}`;
        break;
        
      case 'edit':
        message = `Updated content in ${changeCount} block${changeCount > 1 ? 's' : ''}`;
        break;
        
      case 'duplicate':
        message = `Created ${changeCount} duplicate${changeCount > 1 ? 's' : ''}`;
        break;
        
      case 'merge':
        message = `Merged ${changeCount} blocks into one`;
        break;
        
      case 'split':
        message = `Split block into ${changeCount} parts`;
        break;
        
      default:
        message = `${actionVerb} ${changeCount} block${changeCount > 1 ? 's' : ''}`;
    }
    
    if (options.includeConfidence && command.confidence < 1) {
      const confidence = Math.round(command.confidence * 100);
      message += ` (${confidence}% confidence)`;
    }
    
    return message;
  }

  /**
   * Generate error message with helpful explanation
   */
  async generateErrorMessage(
    command: ParsedBlockCommand,
    error: string,
    options: FeedbackOptions = {}
  ): Promise<string> {
    if (!isOpenAIConfigured()) {
      return this.generateFallbackError(command, error, options);
    }
    
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: `You are a helpful assistant explaining why a block manipulation command failed.
Be concise and friendly. Suggest alternatives if possible.
The user tried to: ${command.naturalLanguage}
The error was: ${error}`
          },
          {
            role: 'user',
            content: 'Explain this error in simple terms and suggest what to do instead.'
          }
        ],
        temperature: 0.7,
        max_tokens: 150
      });
      
      return response.choices[0].message.content || this.generateFallbackError(command, error, options);
    } catch {
      return this.generateFallbackError(command, error, options);
    }
  }

  /**
   * Generate fallback error message without AI
   */
  private generateFallbackError(
    command: ParsedBlockCommand,
    error: string,
    options: FeedbackOptions = {}
  ): string {
    let message = `Couldn't ${this.getActionVerb(command.action, false)} the block`;
    
    // Add specific error context
    if (error.includes('not found')) {
      message += '. The block you referenced doesn\'t exist';
    } else if (error.includes('permission')) {
      message += '. You don\'t have permission for this action';
    } else if (error.includes('invalid')) {
      message += '. The command format wasn\'t recognized';
    } else if (error.includes('empty')) {
      message += '. No content was provided';
    } else {
      message += `. ${error}`;
    }
    
    if (options.suggestAlternatives) {
      message += this.getSuggestions(command);
    }
    
    return message;
  }

  /**
   * Request clarification when confidence is low
   */
  async requestClarification(
    command: ParsedBlockCommand,
    blocks: Block[]
  ): Promise<{
    message: string;
    suggestions: string[];
    originalCommand: string;
  }> {
    const confidence = Math.round(command.confidence * 100);
    
    let message = `I'm ${confidence}% sure you want to ${this.getActionVerb(command.action, false)}`;
    
    // Add context about what will be affected
    if (command.target.blockIds && command.target.blockIds.length > 0) {
      const count = command.target.blockIds.length;
      message += ` ${count} block${count > 1 ? 's' : ''}`;
    }
    
    // Generate alternative interpretations
    const suggestions = await this.generateAlternativeSuggestions(command, blocks);
    
    return {
      message,
      suggestions,
      originalCommand: command.naturalLanguage
    };
  }

  /**
   * Generate alternative command suggestions
   */
  private async generateAlternativeSuggestions(
    command: ParsedBlockCommand,
    blocks: Block[]
  ): Promise<string[]> {
    const suggestions: string[] = [];
    
    // Suggest based on action type
    switch (command.action) {
      case 'create':
        suggestions.push(
          `Add a ${command.parameters.newType || 'paragraph'} at the end`,
          `Insert a ${command.parameters.newType || 'paragraph'} after the selected block`,
          `Create a new ${command.parameters.newType || 'paragraph'} before this one`
        );
        break;
        
      case 'transform':
        suggestions.push(
          `Convert the selected block to ${command.parameters.newType}`,
          `Transform all ${command.target.reference} blocks to ${command.parameters.newType}`,
          `Change this block type to ${command.parameters.newType}`
        );
        break;
        
      case 'move':
        suggestions.push(
          'Move this block to the top',
          'Move the selected block after the next one',
          'Reorder blocks by dragging them'
        );
        break;
        
      default:
        suggestions.push(
          'Try being more specific about which block',
          'Select a block first, then describe the action',
          'Use position words like "first", "last", or "after"'
        );
    }
    
    return suggestions.slice(0, 3);
  }

  /**
   * Generate progress update for long-running operations
   */
  generateProgressUpdate(
    action: string,
    current: number,
    total: number
  ): string {
    const percentage = Math.round((current / total) * 100);
    return `${this.getActionVerb(action, true)} blocks... ${percentage}% complete (${current}/${total})`;
  }

  /**
   * Explain what will happen before execution
   */
  async explainPreview(
    command: ParsedBlockCommand,
    changes: BlockChange[]
  ): Promise<string> {
    const changesByType = this.groupChangesByType(changes);
    const parts: string[] = [];
    
    if (changesByType.create > 0) {
      parts.push(`add ${changesByType.create} new block${changesByType.create > 1 ? 's' : ''}`);
    }
    
    if (changesByType.update > 0) {
      parts.push(`modify ${changesByType.update} block${changesByType.update > 1 ? 's' : ''}`);
    }
    
    if (changesByType.delete > 0) {
      parts.push(`remove ${changesByType.delete} block${changesByType.delete > 1 ? 's' : ''}`);
    }
    
    if (changesByType.move > 0) {
      parts.push(`move ${changesByType.move} block${changesByType.move > 1 ? 's' : ''}`);
    }
    
    if (changesByType.transform > 0) {
      parts.push(`transform ${changesByType.transform} block${changesByType.transform > 1 ? 's' : ''}`);
    }
    
    let message = 'This will ';
    if (parts.length === 1) {
      message += parts[0];
    } else if (parts.length === 2) {
      message += `${parts[0]} and ${parts[1]}`;
    } else {
      const last = parts.pop();
      message += `${parts.join(', ')}, and ${last}`;
    }
    
    return message + '.';
  }

  /**
   * Get human-friendly action verb
   */
  private getActionVerb(action: string, past: boolean): string {
    const verbs: Record<string, { present: string; past: string }> = {
      create: { present: 'create', past: 'Created' },
      delete: { present: 'delete', past: 'Deleted' },
      edit: { present: 'edit', past: 'Edited' },
      transform: { present: 'transform', past: 'Transformed' },
      move: { present: 'move', past: 'Moved' },
      duplicate: { present: 'duplicate', past: 'Duplicated' },
      merge: { present: 'merge', past: 'Merged' },
      split: { present: 'split', past: 'Split' },
      style: { present: 'style', past: 'Styled' }
    };
    
    const verb = verbs[action] || { present: action, past: action };
    return past ? verb.past : verb.present;
  }

  /**
   * Group changes by type for summary
   */
  private groupChangesByType(changes: BlockChange[]): Record<string, number> {
    return changes.reduce((acc, change) => {
      acc[change.type] = (acc[change.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * Get suggestions for common issues
   */
  private getSuggestions(command: ParsedBlockCommand): string {
    const suggestions: string[] = [];
    
    if (command.confidence < 0.5) {
      suggestions.push('Try being more specific');
    }
    
    if (!command.target.blockIds || command.target.blockIds.length === 0) {
      suggestions.push('Select a block first');
    }
    
    if (command.action === 'transform' && !command.parameters.newType) {
      suggestions.push('Specify the target block type');
    }
    
    if (suggestions.length > 0) {
      return '. ' + suggestions.join(' or ') + '.';
    }
    
    return '';
  }

  /**
   * Generate contextual help based on block type
   */
  async getContextualHelp(blockType: string): Promise<string[]> {
    const helpByType: Record<string, string[]> = {
      paragraph: [
        'Make it shorter',
        'Convert to bullet points',
        'Translate to Spanish',
        'Make it more formal'
      ],
      heading: [
        'Change heading level',
        'Add emoji',
        'Make it a question',
        'Capitalize properly'
      ],
      list: [
        'Convert to numbered list',
        'Sort alphabetically',
        'Convert to table',
        'Add checkboxes'
      ],
      table: [
        'Add a column',
        'Sort by first column',
        'Create a chart from this',
        'Export as CSV'
      ],
      code: [
        'Add comments',
        'Format code',
        'Add syntax highlighting',
        'Convert to different language'
      ],
      chart: [
        'Change to bar chart',
        'Update colors',
        'Add data labels',
        'Export as image'
      ],
      image: [
        'Add caption',
        'Resize image',
        'Add alt text',
        'Apply filter'
      ]
    };
    
    return helpByType[blockType] || [
      'Edit content',
      'Duplicate block',
      'Move up',
      'Delete block'
    ];
  }
}

export const aiFeedbackService = AIFeedbackService.getInstance();