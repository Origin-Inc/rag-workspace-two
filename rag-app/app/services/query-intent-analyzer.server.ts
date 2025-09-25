/**
 * Query Intent Analyzer
 * Detects user intent from natural language queries to provide appropriate responses
 */

export type FormatPreference = 'full' | 'table-only' | 'narrative-only' | 'specific-answer' | 'quick';

export type QueryType = 'summary' | 'analysis' | 'extraction' | 'calculation' | 'exploration' | 'comparison';

export interface SpecificRequest {
  metric?: string;
  column?: string;
  operation?: string;
  value?: string | number;
}

export interface QueryIntent {
  formatPreference: FormatPreference;
  queryType: QueryType;
  expectedDepth: 'brief' | 'standard' | 'detailed';
  specificRequests: SpecificRequest[];
  confidence: number;
  explicitFormatRequest: boolean;
  keywords: string[];
}

export class QueryIntentAnalyzer {
  // Format signal patterns
  private readonly formatSignals = {
    tableOnly: [
      /^(just|only|simply).*(table|data|numbers|stats)/i,
      /^table\s+(summary|of|for)/i,
      /show.*table/i,
      /^give me.*(table|data)/i
    ],
    narrativeOnly: [
      /^(explain|describe|tell).*(story|meaning|about)/i,
      /^what does.*mean/i,
      /in (words|plain|simple)/i,
      /^narrate/i
    ],
    specificMetric: [
      /^(what is|what's|show me|get).*(average|total|count|sum|mean|median|max|min)/i,
      /^how (many|much)/i,
      /^(average|total|count|sum) of/i
    ],
    quick: [
      /(quick|brief|short|simple|tl;?dr)/i,
      /^quickly/i,
      /in a nutshell/i
    ],
    detailed: [
      /(detailed|comprehensive|full|complete|thorough|everything|all)/i,
      /deep dive/i,
      /in detail/i
    ]
  };

  // Query type patterns
  private readonly queryTypePatterns = {
    summary: [
      /(summarize|summary|overview|describe|about)/i,
      /^what('s| is) (in |this)/i,
      /tell me about/i
    ],
    analysis: [
      /(analyze|analysis|compare|trend|pattern|correlation|relationship)/i,
      /how.*relate/i,
      /what.*trend/i
    ],
    extraction: [
      /(show|list|get|find|extract|display|view)/i,
      /^(select|filter|where)/i,
      /give me all/i
    ],
    calculation: [
      /(calculate|compute|average|total|sum|count|mean|median|aggregate)/i,
      /^how (many|much)/i,
      /percentage of/i
    ],
    exploration: [
      /(explore|investigate|look into|dig into)/i,
      /what.*interesting/i,
      /anything.*notable/i
    ],
    comparison: [
      /(compare|versus|vs|difference|between|contrast)/i,
      /which.*better/i,
      /how.*differ/i
    ]
  };

  /**
   * Analyze a query to determine user intent
   */
  public analyzeIntent(query: string): QueryIntent {
    const lowerQuery = query.toLowerCase().trim();
    
    // Detect format preference
    const formatPreference = this.detectFormatPreference(lowerQuery);
    const explicitFormatRequest = this.hasExplicitFormatRequest(lowerQuery);
    
    // Detect query type
    const queryType = this.detectQueryType(lowerQuery);
    
    // Detect expected depth
    const expectedDepth = this.detectExpectedDepth(lowerQuery, formatPreference);
    
    // Extract specific requests
    const specificRequests = this.extractSpecificRequests(lowerQuery);
    
    // Extract keywords for context
    const keywords = this.extractKeywords(lowerQuery);
    
    // Calculate confidence based on pattern matches
    const confidence = this.calculateConfidence(lowerQuery, queryType, formatPreference);
    
    return {
      formatPreference,
      queryType,
      expectedDepth,
      specificRequests,
      confidence,
      explicitFormatRequest,
      keywords
    };
  }

  /**
   * Detect format preference from query
   */
  private detectFormatPreference(query: string): FormatPreference {
    // Check for explicit format requests first
    for (const pattern of this.formatSignals.tableOnly) {
      if (pattern.test(query)) {
        return 'table-only';
      }
    }
    
    for (const pattern of this.formatSignals.narrativeOnly) {
      if (pattern.test(query)) {
        return 'narrative-only';
      }
    }
    
    for (const pattern of this.formatSignals.specificMetric) {
      if (pattern.test(query)) {
        return 'specific-answer';
      }
    }
    
    for (const pattern of this.formatSignals.quick) {
      if (pattern.test(query)) {
        return 'quick';
      }
    }
    
    // Default to full multi-format response
    return 'full';
  }

  /**
   * Check if query has explicit format request
   */
  private hasExplicitFormatRequest(query: string): boolean {
    const explicitTerms = /^(just|only|simply|specifically)/i;
    return explicitTerms.test(query);
  }

  /**
   * Detect the type of query
   */
  private detectQueryType(query: string): QueryType {
    const typeScores: Record<QueryType, number> = {
      summary: 0,
      analysis: 0,
      extraction: 0,
      calculation: 0,
      exploration: 0,
      comparison: 0
    };
    
    // Score each type based on pattern matches
    for (const [type, patterns] of Object.entries(this.queryTypePatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(query)) {
          typeScores[type as QueryType] += 1;
        }
      }
    }
    
    // Return type with highest score, defaulting to summary
    let maxScore = 0;
    let detectedType: QueryType = 'summary';
    
    for (const [type, score] of Object.entries(typeScores)) {
      if (score > maxScore) {
        maxScore = score;
        detectedType = type as QueryType;
      }
    }
    
    return detectedType;
  }

  /**
   * Detect expected depth of response
   */
  private detectExpectedDepth(query: string, format: FormatPreference): 'brief' | 'standard' | 'detailed' {
    if (format === 'quick' || format === 'specific-answer') {
      return 'brief';
    }
    
    for (const pattern of this.formatSignals.detailed) {
      if (pattern.test(query)) {
        return 'detailed';
      }
    }
    
    for (const pattern of this.formatSignals.quick) {
      if (pattern.test(query)) {
        return 'brief';
      }
    }
    
    return 'standard';
  }

  /**
   * Extract specific metric/column requests
   */
  private extractSpecificRequests(query: string): SpecificRequest[] {
    const requests: SpecificRequest[] = [];
    
    // Extract metric operations
    const metricPattern = /(average|total|sum|count|mean|median|max|min|percentage)\s+(?:of\s+)?([a-zA-Z_]+)?/gi;
    const metricMatches = query.matchAll(metricPattern);
    
    for (const match of metricMatches) {
      requests.push({
        operation: match[1].toLowerCase(),
        column: match[2]?.toLowerCase()
      });
    }
    
    // Extract column references
    const columnPattern = /(?:column|field|attribute)\s+["']?([a-zA-Z_]+)["']?/gi;
    const columnMatches = query.matchAll(columnPattern);
    
    for (const match of columnMatches) {
      requests.push({
        column: match[1].toLowerCase()
      });
    }
    
    // Extract specific values
    const valuePattern = /(?:equals?|=|is)\s+["']?([0-9.]+|[a-zA-Z]+)["']?/gi;
    const valueMatches = query.matchAll(valuePattern);
    
    for (const match of valueMatches) {
      const value = isNaN(Number(match[1])) ? match[1] : Number(match[1]);
      requests.push({ value });
    }
    
    return requests;
  }

  /**
   * Extract important keywords for context
   */
  private extractKeywords(query: string): string[] {
    const keywords: string[] = [];
    
    // Common important terms in data queries
    const importantTerms = [
      'revenue', 'sales', 'profit', 'cost', 'customer', 'product',
      'date', 'time', 'month', 'year', 'quarter', 'week',
      'performance', 'metric', 'kpi', 'growth', 'trend',
      'top', 'bottom', 'best', 'worst', 'highest', 'lowest'
    ];
    
    for (const term of importantTerms) {
      if (query.toLowerCase().includes(term)) {
        keywords.push(term);
      }
    }
    
    // Extract quoted terms
    const quotedPattern = /["']([^"']+)["']/g;
    const quotedMatches = query.matchAll(quotedPattern);
    
    for (const match of quotedMatches) {
      keywords.push(match[1]);
    }
    
    return [...new Set(keywords)]; // Remove duplicates
  }

  /**
   * Calculate confidence score for the analysis
   */
  private calculateConfidence(query: string, queryType: QueryType, formatPref: FormatPreference): number {
    let confidence = 0.5; // Base confidence
    
    // Increase confidence for explicit format requests
    if (this.hasExplicitFormatRequest(query)) {
      confidence += 0.2;
    }
    
    // Increase confidence if query type is clearly detected
    const typePatterns = this.queryTypePatterns[queryType];
    let typeMatches = 0;
    for (const pattern of typePatterns) {
      if (pattern.test(query)) {
        typeMatches++;
      }
    }
    
    if (typeMatches > 0) {
      confidence += Math.min(0.3, typeMatches * 0.1);
    }
    
    // Decrease confidence for ambiguous queries
    if (query.split(' ').length < 3) {
      confidence -= 0.1;
    }
    
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Check if query is asking for help or examples
   */
  public isHelpQuery(query: string): boolean {
    const helpPatterns = [
      /^(help|how|what can)/i,
      /^(show|give).*example/i,
      /how (do|can) i/i,
      /what (queries|questions)/i
    ];
    
    return helpPatterns.some(pattern => pattern.test(query.toLowerCase()));
  }

  /**
   * Determine if query needs access to actual data
   */
  public needsDataAccess(intent: QueryIntent): boolean {
    // Specific answers and calculations always need data
    if (intent.formatPreference === 'specific-answer') return true;
    if (intent.queryType === 'calculation') return true;
    if (intent.queryType === 'extraction') return true;
    
    // Analysis and comparison usually need data
    if (intent.queryType === 'analysis') return true;
    if (intent.queryType === 'comparison') return true;
    
    // Summary might not always need full data access
    if (intent.queryType === 'summary' && intent.formatPreference === 'narrative-only') {
      return false;
    }
    
    return true;
  }
}

// Export singleton instance
export const queryIntentAnalyzer = new QueryIntentAnalyzer();