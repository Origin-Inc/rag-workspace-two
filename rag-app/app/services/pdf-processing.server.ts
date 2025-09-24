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
    console.log(`[PDF] Starting PDF processing for: ${file.name}`);
    console.log(`[PDF] File size: ${file.size} bytes, Type: ${file.type}`);
    const startTime = Date.now();
    
    try {
      // Convert file to buffer
      const buffer = await this.fileToBuffer(file);
      console.log(`[PDF] Buffer created, creating PDF proxy...`);
      
      // Create PDF document proxy
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      console.log(`[PDF] PDF proxy created, pages: ${pdf.numPages}`);
      
      // Extract all content from PDF
      console.log(`[PDF] Starting content extraction...`);
      const extractedContent = await this.extractAllContent(pdf);
      console.log(`[PDF] Content extraction complete:`);
      console.log(`[PDF] - Text length: ${extractedContent.text?.length || 0} characters`);
      console.log(`[PDF] - Tables found: ${extractedContent.tables?.length || 0}`);
      console.log(`[PDF] - Images found: ${extractedContent.images?.length || 0}`);
      console.log(`[PDF] - Pages processed: ${extractedContent.pages?.length || 0}`);
      
      // Convert extracted tables to tabular data
      console.log(`[PDF] Converting tables to data format...`);
      const { data, schema } = this.convertTablesToData(extractedContent);
      console.log(`[PDF] Data conversion complete:`);
      console.log(`[PDF] - Rows: ${data.length}`);
      console.log(`[PDF] - Columns: ${schema.columns.length}`);
      
      const duration = Date.now() - startTime;
      console.log(`[PDF] Total processing time: ${duration}ms`);
      
      return {
        data,
        schema,
        extractedContent
      };
    } catch (error) {
      console.error(`[PDF] Failed to process PDF:`, error);
      console.error(`[PDF] Error details:`, error instanceof Error ? error.stack : error);
      throw error;
    }
  }

  /**
   * Convert File to ArrayBuffer
   */
  private static async fileToBuffer(file: File): Promise<ArrayBuffer> {
    console.log(`[PDF] Converting file to buffer: ${file.name} (${file.size} bytes)`);
    console.log(`[PDF] File type: ${file.type}`);
    console.log(`[PDF] File object methods available:`, Object.getOwnPropertyNames(Object.getPrototypeOf(file)));
    
    try {
      // Check if arrayBuffer method exists
      if (typeof file.arrayBuffer !== 'function') {
        console.error(`[PDF] File.arrayBuffer() method not available`);
        throw new Error('File.arrayBuffer() method not available in this environment');
      }
      
      // Use the File object's built-in arrayBuffer() method (available in Node.js)
      const startTime = Date.now();
      const buffer = await file.arrayBuffer();
      const duration = Date.now() - startTime;
      
      console.log(`[PDF] Successfully converted to buffer: ${buffer.byteLength} bytes in ${duration}ms`);
      return buffer;
    } catch (error) {
      console.error(`[PDF] Failed to convert file to buffer:`, error);
      console.error(`[PDF] Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
      throw new Error(`Failed to read PDF file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract all content from PDF (text, tables, images, metadata)
   */
  private static async extractAllContent(pdf: PDFDocumentProxy): Promise<PDFExtractResult> {
    const totalPages = pdf.numPages;
    console.log(`[PDF] Extracting content from ${totalPages} pages...`);
    
    // Extract metadata
    console.log(`[PDF] Extracting metadata...`);
    const metadata = await this.extractMetadata(pdf);
    console.log(`[PDF] Metadata extracted:`, {
      title: metadata.title || 'N/A',
      author: metadata.author || 'N/A',
      totalPages: metadata.totalPages
    });
    
    // Extract text from all pages
    console.log(`[PDF] Extracting full text...`);
    const fullTextResult = await extractText(pdf, { mergePages: true });
    const fullText = fullTextResult.text || '';
    console.log(`[PDF] Full text extracted: ${fullText?.length || 0} characters`);
    
    // Process each page
    const pages: PDFPageData[] = [];
    const allTables: any[] = [];
    const allImages: PDFImageData[] = [];
    
    // Extract text for all pages as an array
    const allPagesResult = await extractText(pdf, { mergePages: false });
    const allPagesText = allPagesResult.text || [];
    console.log(`[PDF] Extracted text from ${allPagesText.length} pages`);
    
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      console.log(`[PDF] Processing page ${pageNum}/${totalPages}...`);
      
      // Get text for this specific page (0-indexed array)
      let pageText = '';
      try {
        // Pages are 0-indexed in the array but 1-indexed in PDF
        pageText = allPagesText[pageNum - 1] || '';
        console.log(`[PDF] Page ${pageNum} text: ${pageText?.length || 0} characters`);
        console.log(`[PDF] Page ${pageNum} text type: ${typeof pageText}`);
      } catch (error) {
        console.error(`[PDF] Failed to get text for page ${pageNum}:`, error);
        pageText = '';
      }
      
      // Ensure pageText is a string before processing tables
      if (typeof pageText !== 'string') {
        console.warn(`[PDF] Page ${pageNum} text is not a string, converting:`, typeof pageText);
        pageText = String(pageText || '');
      }
      
      // Extract tables from page text (using coordinate analysis)
      const pageTables = await this.extractTablesFromPage(pdf, pageNum, pageText);
      if (pageTables.length > 0) {
        console.log(`[PDF] Page ${pageNum} tables found: ${pageTables.length}`);
        pageTables.forEach((table, idx) => {
          console.log(`[PDF]   Table ${idx + 1}: ${table.headers.length} columns, ${table.rows.length} rows, confidence: ${table.confidence}`);
        });
      }
      allTables.push(...pageTables);
      
      // Extract images from page
      try {
        const pageImages = await this.extractImagesFromPage(pdf, pageNum);
        if (pageImages.length > 0) {
          console.log(`[PDF] Page ${pageNum} images found: ${pageImages.length}`);
        }
        allImages.push(...pageImages);
        
        pages.push({
          pageNumber: pageNum,
          text: pageText,
          tables: pageTables,
          imageCount: pageImages.length
        });
      } catch (error) {
        console.warn(`[PDF] Failed to extract images from page ${pageNum}:`, error);
        pages.push({
          pageNumber: pageNum,
          text: pageText,
          tables: pageTables,
          imageCount: 0
        });
      }
    }
    
    console.log(`[PDF] Content extraction summary:`);
    console.log(`[PDF] - Total pages: ${pages.length}`);
    console.log(`[PDF] - Total tables: ${allTables.length}`);
    console.log(`[PDF] - Total images: ${allImages.length}`);
    
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
    
    console.log(`[PDF] Extracting tables from page ${pageNumber}, text length: ${pageText?.length || 0}`);
    
    // Ensure pageText is a valid string
    if (!pageText || typeof pageText !== 'string') {
      console.warn(`[PDF] Invalid pageText for table extraction on page ${pageNumber}:`, typeof pageText);
      return tables;
    }
    
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