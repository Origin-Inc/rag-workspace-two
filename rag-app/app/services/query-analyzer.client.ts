import type { DataFile } from '~/atoms/chat-atoms';

export interface QueryAnalysis {
  intent: 'query-data' | 'general-chat' | 'unclear' | 'greeting' | 'help-request' | 'command' | 'conversational' | 'off-topic';
  confidence: number;
  clarificationNeeded: boolean;
  clarificationMessage?: string;
  suggestions?: string[];
  mentionsFile?: boolean;
  fileReference?: string;
}

export class QueryAnalyzer {
  // Common typos and gibberish patterns
  private static readonly GIBBERISH_PATTERNS = /^[a-z]{8,}$|^[qwerty]+$|^[asdf]+$|^[zxcv]+$/i;
  
  // Greeting patterns
  private static readonly GREETING_PATTERNS = /^(hi|hello|hey|good morning|good afternoon|good evening|greetings|howdy|sup|yo)\b/i;
  
  // Help request patterns
  private static readonly HELP_PATTERNS = /^(help|what can you do|how do i|how to|can you help|what are you capable)/i;
  
  // Conversational patterns (non-data related)
  private static readonly CONVERSATIONAL_PATTERNS = [
    /how are you/i,
    /how('s| is) (it going|your day|everything)/i,
    /what('s| is) (up|new|happening)/i,
    /nice to (meet|see) you/i,
    /thank you|thanks/i,
    /you('re| are) (great|awesome|helpful)/i,
    /have a (good|nice|great) (day|evening|morning)/i
  ];
  
  // Off-topic patterns (clearly not about data)
  private static readonly OFF_TOPIC_PATTERNS = [
    /weather|temperature|forecast|rain|snow|sunny|cloudy/i,
    /news|politics|sports|entertainment/i,
    /recipe|cooking|food(?! data)/i,
    /joke|funny|humor/i,
    /meaning of life|philosophy/i,
    /time|date|calendar(?! data)/i,
    /directions|location|map(?! data)/i
  ];
  
  // Data query indicators (more specific to avoid false positives)
  private static readonly DATA_QUERY_INDICATORS = [
    'show', 'display', 'analyze', 'summarize', 'query', 'find', 'get',
    'calculate', 'average', 'sum', 'count', 'group', 'filter',
    'from', 'where', 'select', 'data', 'table', 'file', 'csv',
    'explain', 'describe', 'tell', 'contain', 'specific',
    'content', 'information', 'details', 'overview', 'insights', 'pdf',
    'notion', 'coda', 'document', 'page', 'deep', 'detailed', 'depth'
  ];
  
  // File content query patterns - NEW
  private static readonly FILE_CONTENT_PATTERNS = [
    /summarize\s+(the|this|my)?\s*(file|document|pdf|csv|data)/i,
    /what.*\s+(in|about|does|is)\s+(the|this|my)?\s*(file|document|pdf|csv|data)/i,
    /explain\s+(the|this|my)?\s*(file|document|pdf|csv|data)/i,
    /show\s+me?\s*(the|this)?\s*(content|data|information)\s*(of|from|in)?\s*(the|this|my)?\s*(file|document)/i,
    /analyze\s+(the|this|my)?\s*(file|document|pdf|csv|data)/i,
    /tell\s+me?\s*(about|what)?\s*(the|this|my)?\s*(file|document|pdf|csv|data)/i,
    /give\s+me?\s*(a|an)?\s*(summary|overview|details)\s*(of|about|from)?\s*(the|this|my)?\s*(file|document)/i,
    /what\s+can\s+you\s+tell\s+me\s+about\s+(the|this|my)?\s*(file|document|pdf|csv|data)/i,
    /describe\s+(the|this|my)?\s*(file|document|pdf|csv|data)/i,
    /(notion|coda)\s+file/i,  // Specific mention of "notion file" or "coda file"
    /the\s+file/i,  // Simple "the file" when files are present
    /my\s+(document|file|pdf|csv|data)/i  // "my document", "my file", etc.
  ];
  
  // Vague request patterns
  private static readonly VAGUE_PATTERNS = [
    /^(do it|do that|can you do that|do this for me|help me with this)$/i,
    /^(continue|go on|proceed|next)$/i,
    /^(yes|no|okay|sure|fine)$/i
  ];

  /**
   * Analyze a query to determine user intent and whether clarification is needed
   */
  static analyzeQuery(query: string, availableFiles: DataFile[] = []): QueryAnalysis {
    const normalizedQuery = query.trim().toLowerCase();
    
    // Check for empty or very short queries
    if (normalizedQuery.length < 3) {
      return {
        intent: 'unclear',
        confidence: 0,
        clarificationNeeded: true,
        clarificationMessage: "I didn't quite catch that. Could you tell me more about what you'd like to do?",
        suggestions: availableFiles.length > 0 
          ? ["Query data from files", "Ask a general question", "Get help"]
          : ["Ask a question", "Get help", "Upload data files"]
      };
    }
    
    // Check for gibberish or typos
    if (this.isLikelyGibberish(normalizedQuery)) {
      return {
        intent: 'unclear',
        confidence: 0,
        clarificationNeeded: true,
        clarificationMessage: `It looks like you might have mistyped — could you clarify what you meant by "${query}"?`,
        suggestions: [
          "Query your data",
          "Ask a question",
          "Get help with commands"
        ]
      };
    }
    
    // Check for greetings
    if (this.GREETING_PATTERNS.test(normalizedQuery)) {
      return {
        intent: 'greeting',
        confidence: 0.95,
        clarificationNeeded: false
      };
    }
    
    // Check for conversational patterns
    const isConversational = this.CONVERSATIONAL_PATTERNS.some(pattern => pattern.test(normalizedQuery));
    if (isConversational) {
      return {
        intent: 'conversational',
        confidence: 0.9,
        clarificationNeeded: false
      };
    }
    
    // Check for off-topic queries
    const isOffTopic = this.OFF_TOPIC_PATTERNS.some(pattern => pattern.test(normalizedQuery));
    if (isOffTopic) {
      return {
        intent: 'off-topic',
        confidence: 0.85,
        clarificationNeeded: false
      };
    }
    
    // Check for help requests
    if (this.HELP_PATTERNS.test(normalizedQuery)) {
      return {
        intent: 'help-request',
        confidence: 0.9,
        clarificationNeeded: false
      };
    }
    
    // Check for vague requests
    const isVague = this.VAGUE_PATTERNS.some(pattern => pattern.test(normalizedQuery));
    if (isVague) {
      return {
        intent: 'unclear',
        confidence: 0.2,
        clarificationNeeded: true,
        clarificationMessage: "Could you clarify what exactly you'd like me to do?",
        suggestions: this.generateContextualSuggestions(query, availableFiles)
      };
    }
    
    // Check for explicit file content requests using enhanced patterns
    const isExplicitFileQuery = this.FILE_CONTENT_PATTERNS.some(pattern => pattern.test(normalizedQuery));
    
    // Also check for contextual file queries when files are available
    const isContextualFileQuery = availableFiles.length > 0 && (
      /^(summarize|explain|analyze|describe|show)\s+(it|this|that)$/i.test(normalizedQuery) ||
      /^what.*\s+(it|this|that)\s+(contains?|says?|is about)$/i.test(normalizedQuery) ||
      /^(the|this|my)\s+file$/i.test(normalizedQuery)
    );
    
    // Analyze for data query intent
    const dataQueryScore = this.calculateDataQueryScore(normalizedQuery);
    const mentionsFile = this.checkForFileReference(normalizedQuery, availableFiles);
    
    // If explicitly asking about file content, treat as data query
    if ((isExplicitFileQuery || isContextualFileQuery) && availableFiles.length > 0) {
      return {
        intent: 'query-data',
        confidence: 0.95,
        clarificationNeeded: false,
        mentionsFile: true,
        fileReference: mentionsFile.reference || availableFiles[0].filename
      };
    }
    
    if (dataQueryScore > 0.6 || mentionsFile.mentioned) {
      return {
        intent: 'query-data',
        confidence: dataQueryScore,
        clarificationNeeded: false,
        mentionsFile: mentionsFile.mentioned,
        fileReference: mentionsFile.reference
      };
    }
    
    // Check if it's a partial or ambiguous data query
    if (dataQueryScore > 0.3) {
      return {
        intent: 'query-data',
        confidence: dataQueryScore,
        clarificationNeeded: true,
        clarificationMessage: "I'm not sure what you'd like to analyze. Could you be more specific?",
        suggestions: [
          "Show me all the data",
          "Summarize the [specific file name]",
          "Calculate averages",
          "Find specific values"
        ]
      };
    }
    
    // Default to general chat
    return {
      intent: 'general-chat',
      confidence: 0.5,
      clarificationNeeded: false
    };
  }
  
  /**
   * Check if the query is likely gibberish or a typo
   */
  private static isLikelyGibberish(query: string): boolean {
    // Check for keyboard mashing patterns
    if (this.GIBBERISH_PATTERNS.test(query)) {
      return true;
    }
    
    // Check for excessive consonants
    const consonantRatio = (query.match(/[bcdfghjklmnpqrstvwxyz]/gi) || []).length / query.length;
    if (consonantRatio > 0.85 && query.length > 5) {
      return true;
    }
    
    // Check for repeated characters
    if (/(.)\1{4,}/.test(query)) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Calculate how likely the query is asking for data analysis
   */
  private static calculateDataQueryScore(query: string): number {
    let score = 0;
    const words = query.toLowerCase().split(/\s+/);
    
    // Must have context about files to be a data query
    const hasFileContext = /file|data|csv|pdf|excel|document|table|database/i.test(query);
    if (!hasFileContext) {
      // Check for strong data indicators without file context
      for (const word of words) {
        if (['analyze', 'summarize', 'calculate', 'average', 'sum', 'count'].includes(word)) {
          score += 0.15;
        }
      }
    } else {
      // Has file context, weight indicators higher
      for (const word of words) {
        if (this.DATA_QUERY_INDICATORS.includes(word)) {
          score += 0.25;
        }
      }
    }
    
    // Check for semantic query patterns WITH file references
    if (/what.*(in|about).*(file|data|document|pdf|csv)/i.test(query)) {
      score += 0.6;
    } else if (/summarize.*file|give.*detail.*file|explain.*file/i.test(query)) {
      score += 0.8;
    } else if (/what.*about|what.*contain/i.test(query) && hasFileContext) {
      score += 0.4;
    }
    
    // Check for SQL-like patterns
    if (/select|from|where|group by|order by/i.test(query)) {
      score += 0.5;
    }
    
    // Check for aggregation keywords with data context
    if (/sum|average|mean|median|count|total|maximum|minimum/i.test(query) && hasFileContext) {
      score += 0.4;
    }
    
    // Check for document analysis keywords WITH file mention
    if (/summarize|analyze|overview|insight|understand|review/i.test(query) && hasFileContext) {
      score += 0.5;
    }
    
    // Check if mentions file extensions explicitly
    if (/\.pdf|\.csv|\.xlsx?|\.txt/i.test(query)) {
      score += 0.4;
    }
    
    // Penalize if it looks off-topic
    if (this.OFF_TOPIC_PATTERNS.some(p => p.test(query))) {
      score = Math.max(0, score - 0.5);
    }
    
    return Math.min(1, score);
  }
  
  /**
   * Check if the query mentions a file
   */
  private static checkForFileReference(
    query: string, 
    availableFiles: DataFile[]
  ): { mentioned: boolean; reference?: string } {
    const queryLower = query.toLowerCase();
    
    for (const file of availableFiles) {
      const filename = file.filename?.toLowerCase() || '';
      const tableName = file.tableName?.toLowerCase() || '';
      
      if (queryLower.includes(filename) || queryLower.includes(tableName)) {
        return { mentioned: true, reference: file.filename };
      }
      
      // Check for partial matches
      const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
      if (queryLower.includes(nameWithoutExt)) {
        return { mentioned: true, reference: file.filename };
      }
    }
    
    return { mentioned: false };
  }
  
  /**
   * Generate contextual suggestions based on available data and query
   */
  private static generateContextualSuggestions(
    query: string, 
    availableFiles: DataFile[]
  ): string[] {
    const suggestions: string[] = [];
    
    if (availableFiles.length > 0) {
      suggestions.push("Query data from your files");
      suggestions.push(`Summarize ${availableFiles[0].filename}`);
      suggestions.push("Show me recent data");
    } else {
      suggestions.push("Upload a data file");
    }
    
    suggestions.push("Ask a general question");
    suggestions.push("Get help with available commands");
    
    return suggestions.slice(0, 4); // Limit to 4 suggestions
  }
  
  /**
   * Generate a clarification prompt based on analysis
   */
  static generateClarificationPrompt(analysis: QueryAnalysis): {
    message: string;
    suggestions: string[];
  } {
    if (!analysis.clarificationNeeded) {
      return { message: '', suggestions: [] };
    }
    
    return {
      message: analysis.clarificationMessage || "Could you clarify what you'd like to do?",
      suggestions: analysis.suggestions || []
    };
  }
}