import { extractText, extractImages, getDocumentProxy } from 'unpdf';
import type { PDFDocumentProxy } from 'unpdf/pdfjs';
import type { FileSchema, ColumnSchema } from './file-processing.server';

export interface PDFExtractResult {
  text: string;
  tables: any[];
  images: PDFImageData[];
  metadata: PDFMetadata;
  pages: PDFPageData[];
}

export interface PDFImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  channels: 1 | 3 | 4;
  key: string;
  pageNumber: number;
}

export interface PDFMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creationDate?: Date;
  modificationDate?: Date;
  totalPages: number;
}

export interface PDFPageData {
  pageNumber: number;
  text: string;
  tables: any[];
  imageCount: number;
}

export interface PDFTable {
  headers: string[];
  rows: string[][];
  pageNumber: number;
  confidence: number;
}

export class PDFProcessingService {
  private static readonly MAX_SAMPLE_ROWS = 100;

  /**
   * Main entry point for processing PDF files
   */
  static async processPDF(file: File): Promise<{
    data: any[];
    schema: FileSchema;
    extractedContent: PDFExtractResult;
  }> {
    const buffer = await this.fileToBuffer(file);
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    
    // Extract all content from PDF
    const extractedContent = await this.extractAllContent(pdf);
    
    // Convert extracted tables to tabular data
    const { data, schema } = this.convertTablesToData(extractedContent);
    
    return {
      data,
      schema,
      extractedContent
    };
  }

  /**
   * Convert File to ArrayBuffer
   */
  private static async fileToBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Extract all content from PDF (text, tables, images, metadata)
   */
  private static async extractAllContent(pdf: PDFDocumentProxy): Promise<PDFExtractResult> {
    const totalPages = pdf.numPages;
    
    // Extract metadata
    const metadata = await this.extractMetadata(pdf);
    
    // Extract text from all pages
    const { text: fullText } = await extractText(pdf, { mergePages: true });
    
    // Process each page
    const pages: PDFPageData[] = [];
    const allTables: any[] = [];
    const allImages: PDFImageData[] = [];
    
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      // Extract text for this page
      const { text: pageText } = await extractText(pdf, { mergePages: false });
      
      // Extract tables from page text (using coordinate analysis)
      const pageTables = await this.extractTablesFromPage(pdf, pageNum, pageText);
      allTables.push(...pageTables);
      
      // Extract images from page
      try {
        const pageImages = await this.extractImagesFromPage(pdf, pageNum);
        allImages.push(...pageImages);
        
        pages.push({
          pageNumber: pageNum,
          text: pageText,
          tables: pageTables,
          imageCount: pageImages.length
        });
      } catch (error) {
        console.warn(`Failed to extract images from page ${pageNum}:`, error);
        pages.push({
          pageNumber: pageNum,
          text: pageText,
          tables: pageTables,
          imageCount: 0
        });
      }
    }
    
    return {
      text: fullText,
      tables: allTables,
      images: allImages,
      metadata,
      pages
    };
  }

  /**
   * Extract metadata from PDF
   */
  private static async extractMetadata(pdf: PDFDocumentProxy): Promise<PDFMetadata> {
    const metadata = await pdf.getMetadata();
    const info = metadata.info as any;
    
    return {
      title: info?.Title,
      author: info?.Author,
      subject: info?.Subject,
      keywords: info?.Keywords,
      creator: info?.Creator,
      producer: info?.Producer,
      creationDate: info?.CreationDate ? new Date(info.CreationDate) : undefined,
      modificationDate: info?.ModDate ? new Date(info.ModDate) : undefined,
      totalPages: pdf.numPages
    };
  }

  /**
   * Extract tables from a page using text analysis
   * This is a simplified implementation - could be enhanced with ML models
   */
  private static async extractTablesFromPage(
    pdf: PDFDocumentProxy,
    pageNumber: number,
    pageText: string
  ): Promise<PDFTable[]> {
    const tables: PDFTable[] = [];
    
    // Simple heuristic: Look for patterns that suggest tabular data
    // This is a basic implementation that looks for consistent delimiters
    const lines = pageText.split('\n').filter(line => line.trim());
    
    let currentTable: string[][] = [];
    let isInTable = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check if line contains consistent delimiters (tabs, multiple spaces, or pipes)
      const hasTabDelimiter = line.includes('\t');
      const hasPipeDelimiter = line.includes('|');
      const hasMultipleSpaces = /\s{2,}/.test(line);
      
      if (hasTabDelimiter || hasPipeDelimiter || hasMultipleSpaces) {
        // Parse the line as table row
        let cells: string[];
        
        if (hasPipeDelimiter) {
          cells = line.split('|').map(cell => cell.trim()).filter(cell => cell);
        } else if (hasTabDelimiter) {
          cells = line.split('\t').map(cell => cell.trim());
        } else {
          cells = line.split(/\s{2,}/).map(cell => cell.trim());
        }
        
        if (cells.length > 1) {
          currentTable.push(cells);
          isInTable = true;
        }
      } else if (isInTable && currentTable.length > 1) {
        // End of table detected
        const [headers, ...rows] = currentTable;
        
        tables.push({
          headers,
          rows,
          pageNumber,
          confidence: this.calculateTableConfidence(currentTable)
        });
        
        currentTable = [];
        isInTable = false;
      } else if (isInTable) {
        // Single line in potential table
        currentTable = [];
        isInTable = false;
      }
    }
    
    // Handle table at end of page
    if (isInTable && currentTable.length > 1) {
      const [headers, ...rows] = currentTable;
      tables.push({
        headers,
        rows,
        pageNumber,
        confidence: this.calculateTableConfidence(currentTable)
      });
    }
    
    return tables;
  }

  /**
   * Calculate confidence score for detected table
   */
  private static calculateTableConfidence(tableData: string[][]): number {
    if (tableData.length < 2) return 0;
    
    // Check column count consistency
    const columnCounts = tableData.map(row => row.length);
    const mostCommonCount = this.mode(columnCounts);
    const consistency = columnCounts.filter(count => count === mostCommonCount).length / columnCounts.length;
    
    // Check if first row looks like headers
    const firstRow = tableData[0];
    const hasHeaders = firstRow.every(cell => 
      cell.length < 50 && // Headers are usually short
      /^[A-Z]/.test(cell) // Often start with capital letter
    );
    
    // Calculate confidence
    let confidence = consistency * 0.7;
    if (hasHeaders) confidence += 0.3;
    
    return Math.min(1, confidence);
  }

  /**
   * Find the most common value in an array
   */
  private static mode(arr: number[]): number {
    const frequency: Record<number, number> = {};
    let maxFreq = 0;
    let mode = arr[0];
    
    for (const num of arr) {
      frequency[num] = (frequency[num] || 0) + 1;
      if (frequency[num] > maxFreq) {
        maxFreq = frequency[num];
        mode = num;
      }
    }
    
    return mode;
  }

  /**
   * Extract images from a specific page
   */
  private static async extractImagesFromPage(
    pdf: PDFDocumentProxy,
    pageNumber: number
  ): Promise<PDFImageData[]> {
    try {
      const images = await extractImages(pdf, pageNumber);
      
      return images.map(img => ({
        ...img,
        pageNumber
      }));
    } catch (error) {
      console.warn(`Failed to extract images from page ${pageNumber}:`, error);
      return [];
    }
  }

  /**
   * Convert extracted tables to a format compatible with our data pipeline
   */
  private static convertTablesToData(extractedContent: PDFExtractResult): {
    data: any[];
    schema: FileSchema;
  } {
    const allData: any[] = [];
    const columnSet = new Set<string>();
    
    // Merge all tables into a single dataset
    for (const table of extractedContent.tables) {
      if (table.confidence < 0.5) continue; // Skip low-confidence tables
      
      const { headers, rows } = table;
      
      // Add headers to column set
      headers.forEach(header => columnSet.add(header));
      
      // Convert rows to objects
      for (const row of rows) {
        const rowData: Record<string, any> = {};
        headers.forEach((header, index) => {
          rowData[header] = row[index] || null;
        });
        
        // Add page reference
        rowData['_pdf_page'] = table.pageNumber;
        
        allData.push(rowData);
      }
    }
    
    // If no tables found, create a simple text-based data structure
    if (allData.length === 0 && extractedContent.text) {
      // Split text into chunks for analysis
      const chunks = this.chunkText(extractedContent.text, 500);
      
      chunks.forEach((chunk, index) => {
        allData.push({
          chunk_id: index + 1,
          text: chunk,
          page_numbers: this.findPageNumbers(chunk, extractedContent.pages),
          char_count: chunk.length,
          word_count: chunk.split(/\s+/).filter(w => w).length
        });
      });
      
      columnSet.add('chunk_id');
      columnSet.add('text');
      columnSet.add('page_numbers');
      columnSet.add('char_count');
      columnSet.add('word_count');
    }
    
    // Build schema
    const columns: ColumnSchema[] = Array.from(columnSet).map(columnName => ({
      name: columnName,
      type: this.inferColumnType(allData, columnName),
      nullable: this.isColumnNullable(allData, columnName),
      sampleValues: this.getSampleValues(allData, columnName, 5)
    }));
    
    return {
      data: allData,
      schema: {
        columns,
        rowCount: allData.length,
        sampleData: allData.slice(0, 10)
      }
    };
  }

  /**
   * Chunk text into smaller pieces
   */
  private static chunkText(text: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    
    let currentChunk = '';
    
    for (const sentence of sentences) {
      if ((currentChunk + sentence).length <= chunkSize) {
        currentChunk += sentence;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = sentence;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }

  /**
   * Find which pages a text chunk appears in
   */
  private static findPageNumbers(chunk: string, pages: PDFPageData[]): string {
    const pageNumbers: number[] = [];
    const chunkLower = chunk.toLowerCase();
    
    for (const page of pages) {
      if (page.text.toLowerCase().includes(chunkLower)) {
        pageNumbers.push(page.pageNumber);
      }
    }
    
    return pageNumbers.join(', ');
  }

  /**
   * Infer column type from data
   */
  private static inferColumnType(data: any[], columnName: string): ColumnSchema['type'] {
    const values = data
      .map(row => row[columnName])
      .filter(val => val !== null && val !== undefined);
    
    if (values.length === 0) return 'string';
    
    // Check if all values are numbers
    if (values.every(val => !isNaN(Number(val)))) {
      return 'number';
    }
    
    // Check if all values are booleans
    if (values.every(val => 
      typeof val === 'boolean' || 
      ['true', 'false'].includes(String(val).toLowerCase())
    )) {
      return 'boolean';
    }
    
    return 'string';
  }

  /**
   * Check if column has null values
   */
  private static isColumnNullable(data: any[], columnName: string): boolean {
    return data.some(row => 
      row[columnName] === null || 
      row[columnName] === undefined || 
      row[columnName] === ''
    );
  }

  /**
   * Get sample values for a column
   */
  private static getSampleValues(data: any[], columnName: string, count: number): any[] {
    return data
      .map(row => row[columnName])
      .filter(val => val !== null && val !== undefined)
      .slice(0, count);
  }
}