import { DatabaseColumn } from '~/types/database-block';

export interface SmartDefault {
  type: 'clipboard' | 'schema' | 'question' | 'chart';
  confidence: number;
  suggestion: any;
  reason: string;
}

export class SmartDefaultsService {
  private static clipboardCheckInterval: NodeJS.Timeout | null = null;
  
  /**
   * Start monitoring clipboard for CSV data
   */
  static startClipboardMonitoring(callback: (data: string) => void) {
    if (this.clipboardCheckInterval) {
      clearInterval(this.clipboardCheckInterval);
    }
    
    let lastClipboard = '';
    
    this.clipboardCheckInterval = setInterval(async () => {
      try {
        const clipboardText = await navigator.clipboard.readText();
        
        if (clipboardText !== lastClipboard && this.looksLikeCSV(clipboardText)) {
          lastClipboard = clipboardText;
          callback(clipboardText);
        }
      } catch (error) {
        // Clipboard access denied or not available
        console.debug('Clipboard access not available');
      }
    }, 2000); // Check every 2 seconds
    
    return () => {
      if (this.clipboardCheckInterval) {
        clearInterval(this.clipboardCheckInterval);
        this.clipboardCheckInterval = null;
      }
    };
  }
  
  /**
   * Check if text looks like CSV data
   */
  static looksLikeCSV(text: string): boolean {
    if (!text || text.length < 10) return false;
    
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return false;
    
    // Check for consistent delimiters
    const hasCommas = lines[0].includes(',');
    const hasTabs = lines[0].includes('\t');
    const hasPipes = lines[0].includes('|');
    
    if (!hasCommas && !hasTabs && !hasPipes) return false;
    
    // Check for consistent column count
    const delimiter = hasCommas ? ',' : hasTabs ? '\t' : '|';
    const firstLineColumns = lines[0].split(delimiter).length;
    
    return lines.slice(0, Math.min(5, lines.length)).every(line => {
      const columnCount = line.split(delimiter).length;
      return Math.abs(columnCount - firstLineColumns) <= 1; // Allow small variation
    });
  }
  
  /**
   * Parse CSV data and detect column types
   */
  static parseCSV(text: string): { columns: DatabaseColumn[]; rows: any[] } {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) throw new Error('Invalid CSV data');
    
    // Detect delimiter
    const delimiter = text.includes('\t') ? '\t' : text.includes('|') ? '|' : ',';
    
    // Parse headers
    const headers = this.parseCSVLine(lines[0], delimiter);
    
    // Parse rows
    const rows = lines.slice(1).map(line => {
      const values = this.parseCSVLine(line, delimiter);
      const row: any = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || null;
      });
      return row;
    });
    
    // Detect column types
    const columns = headers.map(header => {
      const columnId = header.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const type = this.detectColumnType(header, rows.map(row => row[header]));
      
      return {
        id: columnId,
        name: header,
        type,
        ...(type === 'select' ? { options: this.getUniqueValues(rows.map(row => row[header])) } : {})
      };
    });
    
    return { columns, rows };
  }
  
  /**
   * Parse a single CSV line handling quotes
   */
  private static parseCSVLine(line: string, delimiter: string): string[] {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  }
  
  /**
   * Detect column type from sample values
   */
  static detectColumnType(name: string, values: any[]): string {
    const lowerName = name.toLowerCase();
    const nonNullValues = values.filter(v => v != null && v !== '');
    
    if (nonNullValues.length === 0) return 'text';
    
    // Check by column name patterns
    if (lowerName.includes('email')) return 'email';
    if (lowerName.includes('phone') || lowerName.includes('tel')) return 'phone';
    if (lowerName.includes('url') || lowerName.includes('link')) return 'url';
    if (lowerName.includes('date') || lowerName.includes('time')) return 'date';
    if (lowerName.includes('price') || lowerName.includes('amount') || lowerName.includes('cost')) return 'number';
    if (lowerName.includes('percent') || lowerName.includes('rate')) return 'percent';
    if (lowerName.includes('rating') || lowerName.includes('score')) return 'rating';
    if (lowerName.includes('status') || lowerName.includes('stage') || lowerName.includes('type')) return 'select';
    
    // Check by value patterns
    const allNumbers = nonNullValues.every(v => !isNaN(Number(v)));
    if (allNumbers) return 'number';
    
    const allDates = nonNullValues.every(v => !isNaN(Date.parse(v)));
    if (allDates) return 'date';
    
    const allEmails = nonNullValues.every(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
    if (allEmails) return 'email';
    
    const allUrls = nonNullValues.every(v => /^https?:\/\//.test(v));
    if (allUrls) return 'url';
    
    const uniqueValues = new Set(nonNullValues);
    if (uniqueValues.size <= 10 && nonNullValues.length > uniqueValues.size * 2) {
      return 'select'; // Repeated values suggest categories
    }
    
    return 'text';
  }
  
  /**
   * Get unique values for select options
   */
  private static getUniqueValues(values: any[]): string[] {
    const unique = new Set(values.filter(v => v != null && v !== ''));
    return Array.from(unique).slice(0, 20); // Limit to 20 options
  }
  
  /**
   * Generate AI question suggestions based on schema
   */
  static generateQuestionSuggestions(columns: DatabaseColumn[]): string[] {
    const questions: string[] = [];
    
    // Analyze column types
    const hasNumbers = columns.some(c => c.type === 'number');
    const hasDates = columns.some(c => c.type === 'date');
    const hasCategories = columns.some(c => c.type === 'select');
    const hasRatings = columns.some(c => c.type === 'rating');
    
    if (hasNumbers) {
      const numberColumns = columns.filter(c => c.type === 'number');
      questions.push(`What is the total ${numberColumns[0].name}?`);
      questions.push(`Show me the average ${numberColumns[0].name} by category`);
      if (numberColumns.length > 1) {
        questions.push(`Compare ${numberColumns[0].name} vs ${numberColumns[1].name}`);
      }
    }
    
    if (hasDates) {
      questions.push('Show me the trend over time');
      questions.push('What happened in the last 30 days?');
      questions.push('When is the next important date?');
    }
    
    if (hasCategories) {
      const categoryColumn = columns.find(c => c.type === 'select');
      questions.push(`Break down by ${categoryColumn!.name}`);
      questions.push(`Which ${categoryColumn!.name} is most common?`);
    }
    
    if (hasRatings) {
      questions.push('What is the average rating?');
      questions.push('Show me items with ratings above 4');
    }
    
    // General questions
    questions.push('Summarize this data for me');
    questions.push('What are the key insights?');
    questions.push('Find any anomalies or outliers');
    
    return questions.slice(0, 5); // Return top 5 suggestions
  }
  
  /**
   * Suggest chart type based on data characteristics
   */
  static suggestChartType(columns: DatabaseColumn[], rowCount: number): string {
    const hasTime = columns.some(c => c.type === 'date');
    const hasNumbers = columns.some(c => c.type === 'number');
    const hasCategories = columns.some(c => c.type === 'select');
    
    if (hasTime && hasNumbers) {
      return 'line'; // Time series data
    }
    
    if (hasCategories && hasNumbers) {
      if (rowCount < 10) {
        return 'bar'; // Small categorical data
      } else {
        return 'scatter'; // Large categorical data
      }
    }
    
    if (hasNumbers && columns.filter(c => c.type === 'number').length > 1) {
      return 'scatter'; // Multiple numeric dimensions
    }
    
    if (hasCategories && !hasNumbers) {
      return 'pie'; // Pure categorical data
    }
    
    return 'table'; // Default to table view
  }
  
  /**
   * Calculate smart column widths based on content
   */
  static calculateColumnWidths(columns: DatabaseColumn[], sampleData: any[]): number[] {
    return columns.map(column => {
      // Base width on column type
      let baseWidth = 150;
      
      switch (column.type) {
        case 'checkbox':
          baseWidth = 50;
          break;
        case 'number':
        case 'percent':
        case 'rating':
          baseWidth = 100;
          break;
        case 'date':
          baseWidth = 120;
          break;
        case 'email':
        case 'url':
          baseWidth = 200;
          break;
        case 'text':
          baseWidth = 180;
          break;
      }
      
      // Adjust based on header length
      const headerWidth = column.name.length * 8 + 40; // Approximate pixel width
      
      // Sample content width
      const contentWidths = sampleData.slice(0, 10).map(row => {
        const value = row[column.id];
        if (value == null) return 0;
        return String(value).length * 7; // Approximate pixel width
      });
      
      const maxContentWidth = Math.max(...contentWidths, 0);
      
      // Return optimal width (capped between 50 and 300)
      return Math.min(300, Math.max(50, baseWidth, headerWidth, maxContentWidth));
    });
  }
  
  /**
   * Get all smart defaults for current context
   */
  static async getAllSuggestions(
    columns?: DatabaseColumn[],
    data?: any[]
  ): Promise<SmartDefault[]> {
    const suggestions: SmartDefault[] = [];
    
    // Check clipboard
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (this.looksLikeCSV(clipboardText)) {
        suggestions.push({
          type: 'clipboard',
          confidence: 0.9,
          suggestion: { action: 'import', data: clipboardText },
          reason: 'CSV data detected in clipboard'
        });
      }
    } catch (error) {
      // Clipboard not available
    }
    
    // Schema-based suggestions
    if (columns && columns.length > 0) {
      const questions = this.generateQuestionSuggestions(columns);
      suggestions.push({
        type: 'question',
        confidence: 0.8,
        suggestion: questions,
        reason: 'AI questions based on your data schema'
      });
      
      if (data && data.length > 0) {
        const chartType = this.suggestChartType(columns, data.length);
        suggestions.push({
          type: 'chart',
          confidence: 0.7,
          suggestion: chartType,
          reason: `${chartType} chart recommended for this data type`
        });
      }
    }
    
    return suggestions;
  }
}