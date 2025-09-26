import type { DataFile } from '~/stores/chat-store';

export interface QueryAnalysis {
  intent: 'query-data' | 'general-chat' | 'unclear' | 'greeting' | 'help-request' | 'command';
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
  private static readonly GREETING_PATTERNS = /^(hi|hello|hey|good morning|good afternoon|good evening|greetings)/i;
  
  // Help request patterns
  private static readonly HELP_PATTERNS = /^(help|what can you do|how do i|how to|can you help|what are you capable)/i;
  
  // Data query indicators
  private static readonly DATA_QUERY_INDICATORS = [
    'show', 'display', 'analyze', 'summarize', 'query', 'find', 'get',
    'calculate', 'average', 'sum', 'count', 'group', 'filter',
    'from', 'where', 'select', 'data', 'table', 'file', 'csv',
    'what', 'explain', 'describe', 'tell', 'about', 'contain', 'specific',
    'content', 'information', 'details', 'overview', 'insights', 'pdf'
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
        confidence: 0.9,
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
    
    // Analyze for data query intent
    const dataQueryScore = this.calculateDataQueryScore(normalizedQuery);
    const mentionsFile = this.checkForFileReference(normalizedQuery, availableFiles);
    
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
    
    for (const word of words) {
      if (this.DATA_QUERY_INDICATORS.includes(word)) {
        score += 0.2;
      }
    }
    
    // Check for semantic query patterns (questions about content)
    if (/what.*about|what.*contain|explain.*file|describe.*file|tell.*about/i.test(query)) {
      score += 0.5;
    }
    
    // Check for SQL-like patterns
    if (/select|from|where|group by|order by/i.test(query)) {
      score += 0.4;
    }
    
    // Check for aggregation keywords
    if (/sum|average|mean|median|count|total|maximum|minimum/i.test(query)) {
      score += 0.3;
    }
    
    // Check for document analysis keywords
    if (/summarize|analyze|overview|insight|understand|review/i.test(query)) {
      score += 0.4;
    }
    
    // Check if mentions file extensions
    if (/\.pdf|\.csv|\.xlsx?|\.txt/i.test(query)) {
      score += 0.3;
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
      const filename = file.filename.toLowerCase();
      const tableName = file.tableName.toLowerCase();
      
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