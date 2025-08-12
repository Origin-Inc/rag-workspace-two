import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

// Configuration with proper error handling
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.warn('OPENAI_API_KEY not configured - AI features will be disabled');
}

// Initialize OpenAI client with retry configuration
export const openai = apiKey ? new OpenAI({
  apiKey,
  organization: process.env.OPENAI_ORGANIZATION,
  maxRetries: 3,
  timeout: 30000, // 30 seconds
}) : null;

// Enhanced system prompts for intelligent database parsing
export const SYSTEM_PROMPTS = {
  DATABASE_PARSER: `You are an intelligent database schema designer. When users request database creation, analyze the context and suggest appropriate columns with the right data types.

CONTEXT UNDERSTANDING:
- Project/Task tracking → Task Name, Status, Assignee, Due Date, Priority, Progress, Dependencies
- Expense/Budget tracking → Date, Description, Amount, Category, Payment Method, Receipt, Notes
- Contact/CRM → Name, Email, Phone, Company, Status, Last Contact, Notes
- Inventory → Product Name, SKU, Quantity, Price, Category, Supplier, Reorder Level
- Event planning → Event Name, Date, Location, Attendees, Budget, Status, Notes

COLUMN TYPE SELECTION:
- Use 'text' for names, descriptions, notes
- Use 'number' for quantities, counts
- Use 'currency' for money values
- Use 'date' for dates without time
- Use 'datetime' for timestamps
- Use 'select' for status/category with fixed options
- Use 'multi_select' for tags or multiple categories
- Use 'checkbox' for boolean flags
- Use 'email' for email addresses
- Use 'url' for links
- Use 'phone' for phone numbers
- Use 'percent' for progress or percentages
- Use 'rating' for scores or ratings
- Use 'user' for assignees or owners
- Use 'formula' for calculated values
- Use 'created_time'/'updated_time' for audit fields

FORMULA UNDERSTANDING:
When users describe calculations in natural language, convert to formula syntax:
- "days until due date" → DAYS_UNTIL([Due Date])
- "total from price and quantity" → [Price] * [Quantity]
- "percentage complete" → ([Completed Tasks] / [Total Tasks]) * 100
- "days since last contact" → DAYS_SINCE([Last Contact])

Always suggest sensible defaults and include audit columns (created/updated time) for data tracking.`,

  COMMAND_INTERPRETER: `You are a command interpreter for a Notion-like workspace application. Parse natural language commands into structured actions.

SUPPORTED ACTIONS:
1. Database Creation - Create new database blocks with intelligent column suggestions
2. Column Operations - Add, modify, or remove columns from existing databases
3. Formula Creation - Create calculated columns with complex formulas
4. Data Operations - Filter, sort, or query existing data
5. View Management - Create and manage different database views

IMPORTANT RULES:
- Always validate that required fields are present
- Suggest helpful defaults when information is missing
- Provide clear explanations for any ambiguities
- Consider the user's context and previous actions
- Generate preview-friendly output that clearly shows what will happen`,
};

/**
 * Retry wrapper for OpenAI API calls with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on certain errors
      if (error && typeof error === 'object' && 'status' in error) {
        const statusError = error as any;
        if (statusError.status === 401 || statusError.status === 403) {
          throw error; // Authentication errors shouldn't be retried
        }
        if (statusError.status === 400) {
          throw error; // Bad request errors shouldn't be retried
        }
      }
      
      // Calculate delay with exponential backoff
      const delay = initialDelay * Math.pow(2, i);
      console.warn(`OpenAI API call failed (attempt ${i + 1}/${maxRetries}), retrying in ${delay}ms...`, error);
      
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

/**
 * Enhanced completion with streaming support
 */
export async function createChatCompletion(
  messages: ChatCompletionMessageParam[],
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    functions?: any[];
    functionCall?: 'auto' | 'none' | { name: string };
    stream?: boolean;
  } = {}
) {
  if (!openai) {
    throw new Error('OpenAI API is not configured');
  }

  const {
    model = 'gpt-4-turbo-preview',
    temperature = 0.3,
    maxTokens = 2000,
    functions,
    functionCall = 'auto',
    stream = false,
  } = options;

  return retryWithBackoff(async () => {
    const params: any = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    };

    if (functions && functions.length > 0) {
      params.functions = functions;
      params.function_call = functionCall;
    }

    if (stream) {
      params.stream = true;
    }

    return await openai.chat.completions.create(params);
  });
}

/**
 * Parse natural language into database schema
 */
export async function parseDatabaseCommand(command: string): Promise<{
  databaseName: string;
  description: string;
  columns: Array<{
    name: string;
    type: string;
    required?: boolean;
    defaultValue?: any;
    options?: string[];
    formula?: string;
  }>;
  confidence: number;
}> {
  if (!openai) {
    throw new Error('OpenAI API is not configured');
  }

  const response = await createChatCompletion([
    { role: 'system', content: SYSTEM_PROMPTS.DATABASE_PARSER },
    { role: 'user', content: command }
  ], {
    functions: [{
      name: 'create_database_schema',
      description: 'Create a database schema based on the user request',
      parameters: {
        type: 'object',
        properties: {
          databaseName: {
            type: 'string',
            description: 'Name for the database'
          },
          description: {
            type: 'string',
            description: 'Description of what this database tracks'
          },
          columns: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                type: { 
                  type: 'string',
                  enum: ['text', 'number', 'date', 'datetime', 'select', 'multi_select', 
                         'checkbox', 'url', 'email', 'phone', 'currency', 'percent', 
                         'rating', 'user', 'formula', 'created_time', 'updated_time']
                },
                required: { type: 'boolean' },
                defaultValue: { type: 'string' },
                options: { 
                  type: 'array',
                  items: { type: 'string' }
                },
                formula: { type: 'string' }
              },
              required: ['name', 'type']
            }
          },
          confidence: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: 'Confidence score for this interpretation'
          }
        },
        required: ['databaseName', 'columns', 'confidence']
      }
    }],
    functionCall: { name: 'create_database_schema' }
  });

  if (response && response.choices && response.choices[0]) {
    const message = response.choices[0].message;
    if (message && message.function_call) {
      const result = JSON.parse(message.function_call.arguments);
      return result;
    }
  }

  throw new Error('Failed to parse database command');
}

/**
 * Generate SQL-like formula from natural language
 */
export async function parseFormulaCommand(
  description: string,
  availableColumns: string[]
): Promise<{
  formula: string;
  explanation: string;
  dependencies: string[];
}> {
  if (!openai) {
    throw new Error('OpenAI API is not configured');
  }

  const response = await createChatCompletion([
    {
      role: 'system',
      content: `Convert natural language formula descriptions into formula syntax.
      Available columns: ${availableColumns.join(', ')}
      
      Formula syntax examples:
      - Basic math: [Column1] + [Column2]
      - Conditionals: IF([Status] = "Done", 100, 0)
      - Date functions: DAYS_UNTIL([Due Date]), DAYS_SINCE([Created])
      - Text functions: CONCAT([First Name], " ", [Last Name])
      - Aggregations: SUM([Amount]), AVG([Score]), COUNT([Items])`
    },
    { role: 'user', content: description }
  ], {
    temperature: 0.2, // Lower temperature for more consistent formula generation
  });

  const formulaText = (response && response.choices && response.choices[0] && response.choices[0].message) 
    ? response.choices[0].message.content || ''
    : '';
  
  // Extract formula and dependencies
  const dependencies = availableColumns.filter(col => 
    formulaText.includes(`[${col}]`)
  );

  return {
    formula: formulaText.trim(),
    explanation: `Formula to ${description}`,
    dependencies
  };
}

/**
 * Check if OpenAI is properly configured
 */
export function isOpenAIConfigured(): boolean {
  return !!apiKey && !!openai;
}

/**
 * Validate OpenAI API key
 */
export async function validateAPIKey(): Promise<boolean> {
  if (!openai) return false;
  
  try {
    // Make a minimal API call to validate the key
    await openai.models.list();
    return true;
  } catch (error) {
    console.error('Invalid OpenAI API key:', error);
    return false;
  }
}