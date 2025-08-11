import { z } from 'zod';
import type { DatabaseColumnType } from './database-block';

// Base action schema
const BaseActionSchema = z.object({
  id: z.string().uuid().optional(),
  timestamp: z.string().datetime().optional(),
  workspaceId: z.string().uuid(),
  userId: z.string().uuid()
});

// Column schema for database creation
export const ColumnSchema = z.object({
  name: z.string().min(1, 'Column name is required'),
  type: z.enum([
    'text', 'number', 'date', 'datetime', 'select', 'multi_select',
    'checkbox', 'url', 'email', 'phone', 'currency', 'percent',
    'rating', 'user', 'file', 'formula', 'rollup', 'lookup',
    'created_time', 'updated_time', 'created_by', 'updated_by'
  ] as const),
  isRequired: z.boolean().optional().default(false),
  isUnique: z.boolean().optional().default(false),
  defaultValue: z.any().optional(),
  formula: z.string().optional(), // For formula columns
  options: z.array(z.string()).optional(), // For select columns
  validation: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    regex: z.string().optional(),
    customMessage: z.string().optional()
  }).optional()
});

// Create Database Block Action
export const CreateDatabaseBlockActionSchema = BaseActionSchema.extend({
  type: z.literal('create_database'),
  name: z.string().min(1, 'Database name is required'),
  description: z.string().optional(),
  columns: z.array(ColumnSchema).min(1, 'At least one column is required'),
  suggestedColumns: z.boolean().optional().default(true),
  initialRows: z.array(z.record(z.any())).optional()
});

// Add Column Action
export const AddColumnActionSchema = BaseActionSchema.extend({
  type: z.literal('add_column'),
  databaseBlockId: z.string().uuid(),
  column: ColumnSchema
});

// Create Formula Column Action
export const CreateFormulaColumnActionSchema = BaseActionSchema.extend({
  type: z.literal('create_formula'),
  databaseBlockId: z.string().uuid(),
  columnName: z.string().min(1),
  formula: z.string().min(1, 'Formula expression is required'),
  description: z.string().optional(), // Natural language description
  dependencies: z.array(z.string()).optional() // Column names this formula depends on
});

// Create Block Action (generic)
export const CreateBlockActionSchema = BaseActionSchema.extend({
  type: z.literal('create_block'),
  blockType: z.enum(['text', 'heading', 'list', 'code', 'image', 'divider']),
  content: z.string().optional(),
  properties: z.record(z.any()).optional(),
  pageId: z.string().uuid(),
  position: z.number().optional()
});

// Update Block Action
export const UpdateBlockActionSchema = BaseActionSchema.extend({
  type: z.literal('update_block'),
  blockId: z.string().uuid(),
  updates: z.record(z.any()),
  preserveHistory: z.boolean().optional().default(true)
});

// Delete Block Action
export const DeleteBlockActionSchema = BaseActionSchema.extend({
  type: z.literal('delete_block'),
  blockId: z.string().uuid(),
  softDelete: z.boolean().optional().default(true)
});

// Move Block Action
export const MoveBlockActionSchema = BaseActionSchema.extend({
  type: z.literal('move_block'),
  blockId: z.string().uuid(),
  targetPageId: z.string().uuid().optional(),
  targetPosition: z.number(),
  preserveData: z.boolean().optional().default(true)
});

// Query Data Action
export const QueryDataActionSchema = BaseActionSchema.extend({
  type: z.literal('query_data'),
  query: z.string().min(1),
  context: z.enum(['workspace', 'page', 'database']).optional(),
  contextId: z.string().uuid().optional(),
  includeMetadata: z.boolean().optional().default(false)
});

// Combined Action Schema
export const ActionSchema = z.discriminatedUnion('type', [
  CreateDatabaseBlockActionSchema,
  AddColumnActionSchema,
  CreateFormulaColumnActionSchema,
  CreateBlockActionSchema,
  UpdateBlockActionSchema,
  DeleteBlockActionSchema,
  MoveBlockActionSchema,
  QueryDataActionSchema
]);

// Action Preview Schema
export const ActionPreviewSchema = z.object({
  actionId: z.string().uuid(),
  type: z.string(),
  title: z.string(),
  description: z.string(),
  impact: z.object({
    creates: z.array(z.string()).optional(),
    updates: z.array(z.string()).optional(),
    deletes: z.array(z.string()).optional(),
    affects: z.number().optional()
  }),
  preview: z.object({
    before: z.any().optional(),
    after: z.any(),
    changes: z.array(z.object({
      field: z.string(),
      from: z.any(),
      to: z.any()
    })).optional()
  }),
  warnings: z.array(z.string()).optional(),
  requiresConfirmation: z.boolean().default(true),
  estimatedDuration: z.number().optional(), // in milliseconds
  reversible: z.boolean().default(true)
});

// Command Parse Result
export const CommandParseResultSchema = z.object({
  command: z.string(),
  intent: z.string(),
  confidence: z.number().min(0).max(1),
  actions: z.array(ActionSchema),
  suggestions: z.array(z.object({
    text: z.string(),
    reason: z.string()
  })).optional(),
  ambiguities: z.array(z.object({
    field: z.string(),
    options: z.array(z.any()),
    selected: z.any().optional()
  })).optional()
});

// Undo Operation Schema
export const UndoOperationSchema = z.object({
  actionLogId: z.string().uuid(),
  originalAction: ActionSchema,
  undoAction: ActionSchema,
  affectedResources: z.array(z.object({
    type: z.string(),
    id: z.string(),
    name: z.string().optional()
  })),
  canUndo: z.boolean(),
  undoWarnings: z.array(z.string()).optional()
});

// Types exported from schemas
export type Column = z.infer<typeof ColumnSchema>;

// Helper function to create a column with defaults
export function createColumn(partial: Partial<Column> & { name: string; type: Column['type'] }): Column {
  return {
    isRequired: false,
    isUnique: false,
    ...partial
  };
}
export type CreateDatabaseBlockAction = z.infer<typeof CreateDatabaseBlockActionSchema>;
export type AddColumnAction = z.infer<typeof AddColumnActionSchema>;
export type CreateFormulaColumnAction = z.infer<typeof CreateFormulaColumnActionSchema>;
export type CreateBlockAction = z.infer<typeof CreateBlockActionSchema>;
export type UpdateBlockAction = z.infer<typeof UpdateBlockActionSchema>;
export type DeleteBlockAction = z.infer<typeof DeleteBlockActionSchema>;
export type MoveBlockAction = z.infer<typeof MoveBlockActionSchema>;
export type QueryDataAction = z.infer<typeof QueryDataActionSchema>;
export type Action = z.infer<typeof ActionSchema>;
export type ActionPreview = z.infer<typeof ActionPreviewSchema>;
export type CommandParseResult = z.infer<typeof CommandParseResultSchema>;
export type UndoOperation = z.infer<typeof UndoOperationSchema>;

// Validation helpers
export function validateAction(action: unknown): Action {
  return ActionSchema.parse(action);
}

export function validateActionPreview(preview: unknown): ActionPreview {
  return ActionPreviewSchema.parse(preview);
}

export function validateCommandParseResult(result: unknown): CommandParseResult {
  return CommandParseResultSchema.parse(result);
}

// Column type suggestions based on name patterns
export function suggestColumnType(columnName: string): DatabaseColumnType {
  const name = columnName.toLowerCase();
  
  if (name.includes('email')) return 'email';
  if (name.includes('phone') || name.includes('tel')) return 'phone';
  if (name.includes('url') || name.includes('link')) return 'url';
  if (name.includes('date') || name.includes('deadline') || name.includes('due')) return 'date';
  if (name.includes('time') || name.includes('created') || name.includes('updated')) return 'datetime';
  if (name.includes('price') || name.includes('cost') || name.includes('amount') || name.includes('budget')) return 'currency';
  if (name.includes('percent') || name.includes('progress') || name.includes('completion')) return 'percent';
  if (name.includes('rating') || name.includes('score')) return 'rating';
  if (name.includes('status') || name.includes('priority') || name.includes('category') || name.includes('type')) return 'select';
  if (name.includes('assignee') || name.includes('owner') || name.includes('user') || name.includes('member')) return 'user';
  if (name.includes('done') || name.includes('complete') || name.includes('check')) return 'checkbox';
  if (name.includes('file') || name.includes('attachment') || name.includes('document')) return 'file';
  if (name.includes('number') || name.includes('count') || name.includes('quantity')) return 'number';
  
  return 'text'; // Default to text
}

// Intelligent column suggestions for different contexts
export function getSuggestedColumns(context: string): Column[] {
  const lowerContext = context.toLowerCase();
  
  if (lowerContext.includes('project') || lowerContext.includes('task')) {
    return [
      createColumn({ name: 'Task Name', type: 'text', isRequired: true }),
      createColumn({ name: 'Status', type: 'select', options: ['Not Started', 'In Progress', 'Completed', 'Blocked'] }),
      createColumn({ name: 'Assignee', type: 'user' }),
      createColumn({ name: 'Due Date', type: 'date' }),
      createColumn({ name: 'Priority', type: 'select', options: ['Low', 'Medium', 'High', 'Critical'] }),
      createColumn({ name: 'Description', type: 'text' }),
      createColumn({ name: 'Progress', type: 'percent' }),
      createColumn({ name: 'Days Until Due', type: 'formula', formula: 'DAYS_UNTIL([Due Date])' })
    ];
  }
  
  if (lowerContext.includes('expense') || lowerContext.includes('budget')) {
    return [
      createColumn({ name: 'Date', type: 'date', isRequired: true }),
      createColumn({ name: 'Description', type: 'text', isRequired: true }),
      createColumn({ name: 'Amount', type: 'currency', isRequired: true }),
      createColumn({ name: 'Category', type: 'select', options: ['Food', 'Transport', 'Entertainment', 'Utilities', 'Other'] }),
      createColumn({ name: 'Payment Method', type: 'select', options: ['Cash', 'Credit Card', 'Debit Card', 'Bank Transfer'] }),
      createColumn({ name: 'Receipt', type: 'file' }),
      createColumn({ name: 'Notes', type: 'text' }),
      createColumn({ name: 'Running Total', type: 'formula', formula: 'SUM([Amount])' })
    ];
  }
  
  if (lowerContext.includes('contact') || lowerContext.includes('customer') || lowerContext.includes('client')) {
    return [
      createColumn({ name: 'Name', type: 'text', isRequired: true }),
      createColumn({ name: 'Email', type: 'email' }),
      createColumn({ name: 'Phone', type: 'phone' }),
      createColumn({ name: 'Company', type: 'text' }),
      createColumn({ name: 'Status', type: 'select', options: ['Lead', 'Prospect', 'Customer', 'Inactive'] }),
      createColumn({ name: 'Last Contact', type: 'date' }),
      createColumn({ name: 'Notes', type: 'text' }),
      createColumn({ name: 'Days Since Contact', type: 'formula', formula: 'DAYS_SINCE([Last Contact])' })
    ];
  }
  
  if (lowerContext.includes('inventory') || lowerContext.includes('product')) {
    return [
      createColumn({ name: 'Product Name', type: 'text', isRequired: true }),
      createColumn({ name: 'SKU', type: 'text', isUnique: true }),
      createColumn({ name: 'Quantity', type: 'number' }),
      createColumn({ name: 'Price', type: 'currency' }),
      createColumn({ name: 'Category', type: 'select' }),
      createColumn({ name: 'Supplier', type: 'text' }),
      createColumn({ name: 'Reorder Level', type: 'number' }),
      createColumn({ name: 'Total Value', type: 'formula', formula: '[Quantity] * [Price]' }),
      createColumn({ name: 'Last Updated', type: 'updated_time' })
    ];
  }
  
  // Default columns for generic database
  return [
    createColumn({ name: 'Name', type: 'text', isRequired: true }),
    createColumn({ name: 'Description', type: 'text' }),
    createColumn({ name: 'Status', type: 'select' }),
    createColumn({ name: 'Created', type: 'created_time' }),
    createColumn({ name: 'Updated', type: 'updated_time' })
  ];
}