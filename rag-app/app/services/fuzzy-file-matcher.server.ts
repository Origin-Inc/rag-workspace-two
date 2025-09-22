import type { DataFile } from '~/stores/chat-store';

export interface FileMatchResult {
  file: DataFile;
  score: number;
  confidence: number;
  matchType: 'exact' | 'fuzzy' | 'semantic' | 'temporal' | 'partial';
  matchedTokens: string[];
  reason: string;
}

export interface MatchOptions {
  confidenceThreshold?: number;
  maxResults?: number;
  includeSemanticMatch?: boolean;
  includeTemporalMatch?: boolean;
}

export class FuzzyFileMatcher {
  // Semantic mappings for common data types
  private static readonly SEMANTIC_MAPPINGS: Record<string, string[]> = {
    'sales': ['revenue', 'price', 'quantity', 'customer', 'order', 'product', 'amount', 'total'],
    'movies': ['title', 'rating', 'genre', 'release', 'director', 'actor', 'film', 'cinema'],
    'financial': ['amount', 'balance', 'transaction', 'account', 'payment', 'invoice', 'budget'],
    'people': ['name', 'age', 'email', 'phone', 'address', 'person', 'user', 'contact'],
    'customer': ['client', 'buyer', 'consumer', 'purchaser', 'account', 'contact'],
    'product': ['item', 'sku', 'merchandise', 'goods', 'article', 'commodity'],
    'time': ['date', 'year', 'month', 'day', 'timestamp', 'period', 'duration'],
    'location': ['address', 'city', 'country', 'state', 'region', 'zip', 'postal'],
    'car': ['vehicle', 'auto', 'automobile', 'model', 'manufacturer', 'engine'],
    'economic': ['gdp', 'inflation', 'economy', 'indicator', 'growth', 'rate'],
  };
  
  // Common file type indicators
  private static readonly FILE_INDICATORS = [
    'file', 'table', 'data', 'dataset', 'csv', 'excel', 'spreadsheet', 'sheet'
  ];
  
  // Temporal keywords
  private static readonly TEMPORAL_KEYWORDS = {
    recent: 24 * 60 * 60 * 1000, // 24 hours
    yesterday: 24 * 60 * 60 * 1000,
    latest: 0, // Most recent
    newest: 0,
    oldest: Infinity,
    last: 7 * 24 * 60 * 60 * 1000, // Last week
  };

  /**
   * Main entry point for matching files to a natural language query
   */
  static matchFiles(
    query: string,
    availableFiles: DataFile[],
    options: MatchOptions = {}
  ): FileMatchResult[] {
    const {
      confidenceThreshold = 0.3,
      maxResults = 10,
      includeSemanticMatch = true,
      includeTemporalMatch = true,
    } = options;
    
    const results: FileMatchResult[] = [];
    const normalizedQuery = query.toLowerCase();
    
    for (const file of availableFiles) {
      const matchResult = this.calculateFileMatch(
        normalizedQuery,
        file,
        includeSemanticMatch,
        includeTemporalMatch
      );
      
      if (matchResult.confidence >= confidenceThreshold) {
        results.push(matchResult);
      }
    }
    
    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    
    return results.slice(0, maxResults);
  }
  
  /**
   * Calculate comprehensive match score for a single file
   */
  private static calculateFileMatch(
    query: string,
    file: DataFile,
    includeSemanticMatch: boolean,
    includeTemporalMatch: boolean
  ): FileMatchResult {
    let totalScore = 0;
    let matchType: FileMatchResult['matchType'] = 'partial';
    const matchedTokens: string[] = [];
    const reasons: string[] = [];
    
    // 1. Exact match check (weight: 1.0)
    const exactScore = this.calculateExactMatch(query, file, matchedTokens);
    if (exactScore > 0.8) {
      totalScore = exactScore;
      matchType = 'exact';
      reasons.push('Exact filename match');
    }
    
    // 2. Fuzzy match using Levenshtein distance (weight: 0.8)
    const fuzzyScore = this.calculateFuzzyMatch(query, file, matchedTokens);
    if (fuzzyScore > totalScore) {
      totalScore = fuzzyScore;
      matchType = 'fuzzy';
      reasons.push('Similar filename');
    }
    
    // 3. Token-based matching (weight: 0.6)
    const tokenScore = this.calculateTokenMatch(query, file, matchedTokens);
    if (tokenScore > 0.4 && tokenScore * 0.6 > totalScore) {
      totalScore = tokenScore * 0.6;
      if (matchType === 'partial') matchType = 'fuzzy';
      reasons.push('Matching keywords');
    }
    
    // 4. Semantic matching based on column names (weight: 0.5)
    if (includeSemanticMatch) {
      const semanticScore = this.calculateSemanticMatch(query, file, matchedTokens);
      if (semanticScore > 0.3 && semanticScore * 0.5 > totalScore) {
        totalScore = semanticScore * 0.5;
        matchType = 'semantic';
        reasons.push('Related data type');
      }
    }
    
    // 5. Temporal matching (weight: 0.4)
    if (includeTemporalMatch) {
      const temporalScore = this.calculateTemporalMatch(query, file);
      if (temporalScore > 0 && temporalScore * 0.4 > totalScore) {
        totalScore = temporalScore * 0.4;
        matchType = 'temporal';
        reasons.push('Time-based match');
      }
    }
    
    // Normalize confidence to 0-1 range
    const confidence = Math.min(1, totalScore);
    
    return {
      file,
      score: totalScore,
      confidence,
      matchType,
      matchedTokens: [...new Set(matchedTokens)],
      reason: reasons.join(', '),
    };
  }
  
  /**
   * Calculate exact match score
   */
  private static calculateExactMatch(
    query: string,
    file: DataFile,
    matchedTokens: string[]
  ): number {
    const filename = file.filename.toLowerCase();
    const filenameNoExt = filename.replace(/\.[^/.]+$/, '');
    const tableName = file.tableName.toLowerCase();
    
    // Check for exact filename match
    if (query.includes(filename)) {
      matchedTokens.push(filename);
      return 1.0;
    }
    
    // Check for filename without extension
    if (query.includes(filenameNoExt)) {
      matchedTokens.push(filenameNoExt);
      return 0.95;
    }
    
    // Check for table name match
    if (query.includes(tableName)) {
      matchedTokens.push(tableName);
      return 0.9;
    }
    
    return 0;
  }
  
  /**
   * Calculate fuzzy match using Levenshtein distance
   */
  private static calculateFuzzyMatch(
    query: string,
    file: DataFile,
    matchedTokens: string[]
  ): number {
    const queryTokens = this.tokenize(query);
    const filenameTokens = this.tokenize(file.filename);
    const tableTokens = this.tokenize(file.tableName);
    
    let bestScore = 0;
    
    // Compare query tokens with filename tokens
    for (const qToken of queryTokens) {
      for (const fToken of filenameTokens) {
        const distance = this.levenshteinDistance(qToken, fToken);
        const maxLen = Math.max(qToken.length, fToken.length);
        const similarity = 1 - (distance / maxLen);
        
        if (similarity > 0.7) {
          matchedTokens.push(fToken);
          bestScore = Math.max(bestScore, similarity * 0.8);
        }
      }
      
      // Compare with table tokens
      for (const tToken of tableTokens) {
        const distance = this.levenshteinDistance(qToken, tToken);
        const maxLen = Math.max(qToken.length, tToken.length);
        const similarity = 1 - (distance / maxLen);
        
        if (similarity > 0.7) {
          matchedTokens.push(tToken);
          bestScore = Math.max(bestScore, similarity * 0.7);
        }
      }
    }
    
    return bestScore;
  }
  
  /**
   * Calculate token overlap score
   */
  private static calculateTokenMatch(
    query: string,
    file: DataFile,
    matchedTokens: string[]
  ): number {
    const queryTokens = new Set(this.tokenize(query));
    const fileTokens = new Set([
      ...this.tokenize(file.filename),
      ...this.tokenize(file.tableName),
    ]);
    
    let matchCount = 0;
    for (const qToken of queryTokens) {
      for (const fToken of fileTokens) {
        if (qToken === fToken || 
            (qToken.length > 3 && fToken.includes(qToken)) ||
            (fToken.length > 3 && qToken.includes(fToken))) {
          matchCount++;
          matchedTokens.push(fToken);
        }
      }
    }
    
    // Calculate Jaccard similarity
    const intersection = matchCount;
    const union = queryTokens.size + fileTokens.size - intersection;
    
    return union > 0 ? intersection / union : 0;
  }
  
  /**
   * Calculate semantic match based on column names and data type
   */
  private static calculateSemanticMatch(
    query: string,
    file: DataFile,
    matchedTokens: string[]
  ): number {
    let score = 0;
    const queryLower = query.toLowerCase();
    
    // Check semantic mappings
    for (const [concept, keywords] of Object.entries(this.SEMANTIC_MAPPINGS)) {
      if (queryLower.includes(concept)) {
        // Check if file columns match the semantic concept
        for (const column of file.schema) {
          const columnName = column.name.toLowerCase();
          for (const keyword of keywords) {
            if (columnName.includes(keyword)) {
              score += 0.3;
              matchedTokens.push(concept);
              break;
            }
          }
        }
      }
    }
    
    // Check column names directly in query
    for (const column of file.schema) {
      const columnName = column.name.toLowerCase();
      if (queryLower.includes(columnName)) {
        score += 0.2;
        matchedTokens.push(column.name);
      }
    }
    
    return Math.min(1, score);
  }
  
  /**
   * Calculate temporal match for time-based references
   */
  private static calculateTemporalMatch(query: string, file: DataFile): number {
    const queryLower = query.toLowerCase();
    const fileAge = Date.now() - new Date(file.uploadedAt).getTime();
    
    for (const [keyword, threshold] of Object.entries(this.TEMPORAL_KEYWORDS)) {
      if (queryLower.includes(keyword)) {
        if (keyword === 'latest' || keyword === 'newest') {
          // Score based on how recent the file is (within last 24 hours gets high score)
          return Math.max(0, 1 - (fileAge / (24 * 60 * 60 * 1000)));
        } else if (keyword === 'oldest') {
          // Inverse scoring for oldest files
          return Math.min(1, fileAge / (30 * 24 * 60 * 60 * 1000)); // Normalize to 30 days
        } else if (threshold > 0 && fileAge <= threshold) {
          return 0.8;
        }
      }
    }
    
    return 0;
  }
  
  /**
   * Calculate Levenshtein distance between two strings
   */
  private static levenshteinDistance(s1: string, s2: string): number {
    const m = s1.length;
    const n = s2.length;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (s1[i - 1] === s2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(
            dp[i - 1][j],     // deletion
            dp[i][j - 1],     // insertion
            dp[i - 1][j - 1]  // substitution
          );
        }
      }
    }
    
    return dp[m][n];
  }
  
  /**
   * Tokenize text into meaningful parts
   */
  private static tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, ' ')
      .split(/[\s_-]+/)
      .filter(token => token.length > 2);
  }
  
  /**
   * Generate disambiguation message when multiple files match
   */
  static generateDisambiguationMessage(matches: FileMatchResult[]): string {
    if (matches.length === 0) {
      return "No matching files found. Please check the file name and try again.";
    }
    
    if (matches.length === 1) {
      return `Using file: ${matches[0].file.filename}`;
    }
    
    const topMatches = matches.slice(0, 3);
    const options = topMatches
      .map((m, i) => `${i + 1}. ${m.file.filename} (${Math.round(m.confidence * 100)}% confidence - ${m.reason})`)
      .join('\n');
    
    return `Multiple files matched your query:\n${options}\n\nUsing the best match: ${topMatches[0].file.filename}`;
  }
}