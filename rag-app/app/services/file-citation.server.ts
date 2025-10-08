import { z } from 'zod';
import type { DataFile } from '~/atoms/chat-atoms';

export interface Citation {
  id: string;
  fileId: string;
  filename: string;
  tableName: string;
  lineNumbers?: [number, number]; // Start and end line/row numbers
  columnNames?: string[];
  queryUsed?: string;
  confidence: number; // 0-1, how confident we are this source was used
  timestamp: Date;
}

export interface CitationContext {
  query: string;
  response: string;
  citations: Citation[];
  filesUsed: string[];
  totalRowsAnalyzed: number;
}

export class FileCitationService {
  private static citationCache = new Map<string, CitationContext>();
  
  /**
   * Track which files and data were used in generating a response
   */
  static trackCitations(
    query: string,
    filesAccessed: Array<{
      file: DataFile;
      rowsAccessed?: number[];
      columnsAccessed?: string[];
      sqlQuery?: string;
    }>,
    response: string
  ): CitationContext {
    const citations: Citation[] = [];
    const filesUsed = new Set<string>();
    let totalRows = 0;
    
    for (const access of filesAccessed) {
      const citation: Citation = {
        id: this.generateCitationId(),
        fileId: access.file.id,
        filename: access.file.filename,
        tableName: access.file.tableName,
        confidence: this.calculateConfidence(query, response, access),
        timestamp: new Date()
      };
      
      if (access.rowsAccessed && access.rowsAccessed.length > 0) {
        citation.lineNumbers = [
          Math.min(...access.rowsAccessed),
          Math.max(...access.rowsAccessed)
        ];
        totalRows += access.rowsAccessed.length;
      }
      
      if (access.columnsAccessed && access.columnsAccessed.length > 0) {
        citation.columnNames = access.columnsAccessed;
      }
      
      if (access.sqlQuery) {
        citation.queryUsed = access.sqlQuery;
      }
      
      citations.push(citation);
      filesUsed.add(access.file.filename);
    }
    
    const context: CitationContext = {
      query,
      response,
      citations,
      filesUsed: Array.from(filesUsed),
      totalRowsAnalyzed: totalRows
    };
    
    // Cache for later retrieval
    const cacheKey = `${query}-${Date.now()}`;
    this.citationCache.set(cacheKey, context);
    
    // Limit cache size
    if (this.citationCache.size > 100) {
      const firstKey = this.citationCache.keys().next().value;
      this.citationCache.delete(firstKey);
    }
    
    return context;
  }
  
  /**
   * Generate a unique citation ID
   */
  private static generateCitationId(): string {
    return `cite_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Calculate confidence score for a citation
   */
  private static calculateConfidence(
    query: string,
    response: string,
    access: {
      file: DataFile;
      rowsAccessed?: number[];
      columnsAccessed?: string[];
      sqlQuery?: string;
    }
  ): number {
    let confidence = 0.5; // Base confidence
    
    // Higher confidence if file is mentioned in query
    const queryLower = query.toLowerCase();
    const filenameLower = access.file.filename.toLowerCase();
    if (queryLower.includes(filenameLower.replace(/\.[^/.]+$/, ''))) {
      confidence += 0.2;
    }
    
    // Higher confidence if data from file appears in response
    if (access.columnsAccessed) {
      const responseLower = response.toLowerCase();
      const mentionedColumns = access.columnsAccessed.filter(col =>
        responseLower.includes(col.toLowerCase())
      );
      confidence += Math.min(0.2, mentionedColumns.length * 0.05);
    }
    
    // Higher confidence if SQL query was used
    if (access.sqlQuery) {
      confidence += 0.1;
    }
    
    // Higher confidence based on number of rows accessed
    if (access.rowsAccessed && access.rowsAccessed.length > 0) {
      confidence += Math.min(0.1, access.rowsAccessed.length / 100);
    }
    
    return Math.min(1, confidence);
  }
  
  /**
   * Format citations for display in chat response
   */
  static formatCitationsForDisplay(
    citations: Citation[],
    format: 'inline' | 'footnote' | 'endnote' = 'inline'
  ): string {
    if (citations.length === 0) return '';
    
    switch (format) {
      case 'inline':
        return this.formatInlineCitations(citations);
      case 'footnote':
        return this.formatFootnoteCitations(citations);
      case 'endnote':
        return this.formatEndnoteCitations(citations);
      default:
        return '';
    }
  }
  
  /**
   * Format inline citations [1]
   */
  private static formatInlineCitations(citations: Citation[]): string {
    return citations
      .map((cite, index) => `[${index + 1}]`)
      .join(' ');
  }
  
  /**
   * Format footnote citations
   */
  private static formatFootnoteCitations(citations: Citation[]): string {
    return citations
      .map((cite, index) => 
        `[${index + 1}] ${cite.filename}` +
        (cite.lineNumbers ? ` (rows ${cite.lineNumbers[0]}-${cite.lineNumbers[1]})` : '') +
        (cite.columnNames ? ` - ${cite.columnNames.join(', ')}` : '')
      )
      .join('\n');
  }
  
  /**
   * Format endnote citations with full details
   */
  private static formatEndnoteCitations(citations: Citation[]): string {
    const header = '\n\n---\n**Sources:**\n';
    const notes = citations
      .map((cite, index) => {
        const parts = [`${index + 1}. **${cite.filename}**`];
        
        if (cite.tableName) {
          parts.push(`   Table: ${cite.tableName}`);
        }
        
        if (cite.lineNumbers) {
          parts.push(`   Rows: ${cite.lineNumbers[0]}-${cite.lineNumbers[1]}`);
        }
        
        if (cite.columnNames && cite.columnNames.length > 0) {
          parts.push(`   Columns: ${cite.columnNames.join(', ')}`);
        }
        
        if (cite.queryUsed) {
          parts.push(`   Query: \`${cite.queryUsed}\``);
        }
        
        parts.push(`   Confidence: ${(cite.confidence * 100).toFixed(0)}%`);
        
        return parts.join('\n');
      })
      .join('\n\n');
    
    return header + notes;
  }
  
  /**
   * Generate attribution statement for legal/compliance
   */
  static generateAttributionStatement(
    citations: Citation[],
    includeTimestamp: boolean = true
  ): string {
    if (citations.length === 0) {
      return 'No external data sources were used for this response.';
    }
    
    const uniqueFiles = [...new Set(citations.map(c => c.filename))];
    const statement = `This response was generated using data from: ${uniqueFiles.join(', ')}.`;
    
    if (includeTimestamp) {
      return `${statement} Generated on ${new Date().toLocaleString()}.`;
    }
    
    return statement;
  }
  
  /**
   * Extract citations from a SQL query
   */
  static extractCitationsFromSQL(
    sqlQuery: string,
    availableFiles: DataFile[]
  ): Partial<Citation>[] {
    const citations: Partial<Citation>[] = [];
    const queryLower = sqlQuery.toLowerCase();
    
    // Extract table names from FROM clause
    const fromMatch = queryLower.match(/from\s+(\w+)/g);
    if (fromMatch) {
      for (const match of fromMatch) {
        const tableName = match.replace(/from\s+/i, '');
        const file = availableFiles.find(f => 
          f.tableName.toLowerCase() === tableName
        );
        
        if (file) {
          citations.push({
            fileId: file.id,
            filename: file.filename,
            tableName: file.tableName,
            queryUsed: sqlQuery
          });
        }
      }
    }
    
    // Extract table names from JOIN clauses
    const joinMatch = queryLower.match(/join\s+(\w+)/g);
    if (joinMatch) {
      for (const match of joinMatch) {
        const tableName = match.replace(/join\s+/i, '');
        const file = availableFiles.find(f => 
          f.tableName.toLowerCase() === tableName
        );
        
        if (file && !citations.find(c => c.fileId === file.id)) {
          citations.push({
            fileId: file.id,
            filename: file.filename,
            tableName: file.tableName,
            queryUsed: sqlQuery
          });
        }
      }
    }
    
    return citations;
  }
  
  /**
   * Create a shareable citation link
   */
  static createCitationLink(citation: Citation): string {
    // Encode citation data in URL-safe format
    const data = {
      f: citation.filename,
      t: citation.tableName,
      r: citation.lineNumbers,
      c: citation.columnNames,
      q: citation.queryUsed
    };
    
    const encoded = btoa(JSON.stringify(data));
    return `/cite/${encoded}`;
  }
  
  /**
   * Validate citation integrity
   */
  static validateCitation(
    citation: Citation,
    actualFile: DataFile
  ): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    
    // Check file match
    if (citation.fileId !== actualFile.id) {
      errors.push('File ID mismatch');
    }
    
    if (citation.filename !== actualFile.filename) {
      errors.push('Filename mismatch');
    }
    
    // Check row range
    if (citation.lineNumbers) {
      const [start, end] = citation.lineNumbers;
      if (start < 0 || end >= actualFile.rowCount) {
        errors.push(`Row range ${start}-${end} exceeds file bounds (0-${actualFile.rowCount - 1})`);
      }
    }
    
    // Check column names
    if (citation.columnNames && actualFile.schema?.columns) {
      const validColumns = new Set(actualFile.schema.columns.map(c => c.name));
      const invalidColumns = citation.columnNames.filter(c => !validColumns.has(c));
      
      if (invalidColumns.length > 0) {
        errors.push(`Invalid columns: ${invalidColumns.join(', ')}`);
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// Export schemas for validation
export const CitationSchema = z.object({
  id: z.string(),
  fileId: z.string(),
  filename: z.string(),
  tableName: z.string(),
  lineNumbers: z.tuple([z.number(), z.number()]).optional(),
  columnNames: z.array(z.string()).optional(),
  queryUsed: z.string().optional(),
  confidence: z.number().min(0).max(1),
  timestamp: z.date()
});

export const CitationContextSchema = z.object({
  query: z.string(),
  response: z.string(),
  citations: z.array(CitationSchema),
  filesUsed: z.array(z.string()),
  totalRowsAnalyzed: z.number()
});