import { createSupabaseAdmin } from '~/utils/supabase.server';

export interface ChunkMetadata {
  page_name?: string;
  block_type?: string;
  importance_score?: number;
  heading_level?: number;
  is_list?: boolean;
  has_code?: boolean;
  language?: string;
}

export interface DocumentChunk {
  text: string;
  metadata: ChunkMetadata;
  start_char: number;
  end_char: number;
  chunk_index: number;
}

export class DocumentChunkingService {
  private readonly supabase = createSupabaseAdmin();
  
  // Configuration for chunking
  private readonly DEFAULT_CHUNK_SIZE = 1000; // characters
  private readonly DEFAULT_CHUNK_OVERLAP = 200; // characters
  private readonly MIN_CHUNK_SIZE = 100;
  private readonly MAX_CHUNK_SIZE = 2000;

  /**
   * Main entry point for chunking a document
   */
  async chunkDocument(
    content: string,
    options: {
      chunkSize?: number;
      overlap?: number;
      preserveParagraphs?: boolean;
      preserveCodeBlocks?: boolean;
    } = {}
  ): Promise<DocumentChunk[]> {
    const {
      chunkSize = this.DEFAULT_CHUNK_SIZE,
      overlap = this.DEFAULT_CHUNK_OVERLAP,
      preserveParagraphs = true,
      preserveCodeBlocks = true
    } = options;

    // Clean and normalize the content
    const normalizedContent = this.normalizeContent(content);

    // Extract structured elements
    const structuredElements = this.extractStructuredElements(normalizedContent);

    // Chunk based on strategy
    let chunks: DocumentChunk[];
    if (preserveCodeBlocks && structuredElements.codeBlocks.length > 0) {
      chunks = this.chunkWithCodePreservation(normalizedContent, structuredElements, chunkSize, overlap);
    } else if (preserveParagraphs) {
      chunks = this.chunkByParagraphs(normalizedContent, chunkSize, overlap);
    } else {
      chunks = this.chunkBySize(normalizedContent, chunkSize, overlap);
    }

    // Add metadata to each chunk
    return chunks.map((chunk, index) => ({
      ...chunk,
      chunk_index: index,
      metadata: {
        ...chunk.metadata,
        ...this.extractChunkMetadata(chunk.text)
      }
    }));
  }

  /**
   * Normalize content for consistent processing
   */
  private normalizeContent(content: string): string {
    return content
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\t/g, '  ') // Convert tabs to spaces
      .trim();
  }

  /**
   * Extract structured elements from content
   */
  private extractStructuredElements(content: string): {
    headings: Array<{ text: string; level: number; position: number }>;
    codeBlocks: Array<{ code: string; language: string; position: number; length: number }>;
    lists: Array<{ items: string[]; position: number }>;
  } {
    const headings: Array<{ text: string; level: number; position: number }> = [];
    const codeBlocks: Array<{ code: string; language: string; position: number; length: number }> = [];
    const lists: Array<{ items: string[]; position: number }> = [];

    // Extract markdown headings
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    let match;
    while ((match = headingRegex.exec(content)) !== null) {
      headings.push({
        text: match[2],
        level: match[1].length,
        position: match.index
      });
    }

    // Extract code blocks
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    while ((match = codeBlockRegex.exec(content)) !== null) {
      codeBlocks.push({
        code: match[2],
        language: match[1] || 'plaintext',
        position: match.index,
        length: match[0].length
      });
    }

    // Extract lists
    const listRegex = /^[\s]*[-*+]\s+.+$/gm;
    const listMatches = content.match(listRegex);
    if (listMatches) {
      let currentList: string[] = [];
      let listStartPos = -1;
      
      listMatches.forEach((item, index) => {
        const itemPos = content.indexOf(item);
        if (listStartPos === -1) {
          listStartPos = itemPos;
        }
        currentList.push(item);
        
        // Check if next item is not consecutive
        if (index === listMatches.length - 1 || 
            content.indexOf(listMatches[index + 1]) - itemPos > item.length + 2) {
          lists.push({
            items: [...currentList],
            position: listStartPos
          });
          currentList = [];
          listStartPos = -1;
        }
      });
    }

    return { headings, codeBlocks, lists };
  }

  /**
   * Chunk content while preserving code blocks
   */
  private chunkWithCodePreservation(
    content: string,
    structuredElements: ReturnType<typeof this.extractStructuredElements>,
    chunkSize: number,
    overlap: number
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    let currentPosition = 0;

    // Sort code blocks by position
    const sortedCodeBlocks = [...structuredElements.codeBlocks].sort((a, b) => a.position - b.position);

    for (const codeBlock of sortedCodeBlocks) {
      // Chunk content before the code block
      if (currentPosition < codeBlock.position) {
        const textBeforeCode = content.substring(currentPosition, codeBlock.position);
        const textChunks = this.chunkBySize(textBeforeCode, chunkSize, overlap);
        
        chunks.push(...textChunks.map(chunk => ({
          ...chunk,
          start_char: chunk.start_char + currentPosition,
          end_char: chunk.end_char + currentPosition,
          chunk_index: 0 // Will be updated later
        })));
      }

      // Add the code block as a single chunk
      chunks.push({
        text: content.substring(codeBlock.position, codeBlock.position + codeBlock.length),
        metadata: {
          has_code: true,
          language: codeBlock.language,
          block_type: 'code'
        },
        start_char: codeBlock.position,
        end_char: codeBlock.position + codeBlock.length,
        chunk_index: 0 // Will be updated later
      });

      currentPosition = codeBlock.position + codeBlock.length;
    }

    // Chunk remaining content after last code block
    if (currentPosition < content.length) {
      const remainingText = content.substring(currentPosition);
      const textChunks = this.chunkBySize(remainingText, chunkSize, overlap);
      
      chunks.push(...textChunks.map(chunk => ({
        ...chunk,
        start_char: chunk.start_char + currentPosition,
        end_char: chunk.end_char + currentPosition,
        chunk_index: 0 // Will be updated later
      })));
    }

    return chunks;
  }

  /**
   * Chunk content by paragraphs
   */
  private chunkByParagraphs(content: string, chunkSize: number, overlap: number): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const paragraphs = content.split(/\n\n+/);
    
    let currentChunk = '';
    let currentStart = 0;
    let paragraphStart = 0;

    for (const paragraph of paragraphs) {
      const paragraphLength = paragraph.length;
      
      // If adding this paragraph would exceed chunk size
      if (currentChunk && (currentChunk.length + paragraphLength + 2) > chunkSize) {
        // Save current chunk
        chunks.push({
          text: currentChunk.trim(),
          metadata: {},
          start_char: currentStart,
          end_char: paragraphStart - 2,
          chunk_index: 0
        });

        // Start new chunk with overlap
        if (overlap > 0 && currentChunk.length > overlap) {
          const overlapText = currentChunk.substring(currentChunk.length - overlap);
          currentChunk = overlapText + '\n\n' + paragraph;
          currentStart = paragraphStart - overlap;
        } else {
          currentChunk = paragraph;
          currentStart = paragraphStart;
        }
      } else {
        // Add paragraph to current chunk
        currentChunk = currentChunk ? currentChunk + '\n\n' + paragraph : paragraph;
      }

      paragraphStart += paragraphLength + 2; // Account for \n\n
    }

    // Add final chunk if exists
    if (currentChunk) {
      chunks.push({
        text: currentChunk.trim(),
        metadata: {},
        start_char: currentStart,
        end_char: content.length,
        chunk_index: 0
      });
    }

    return chunks;
  }

  /**
   * Simple size-based chunking
   */
  private chunkBySize(content: string, chunkSize: number, overlap: number): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    let start = 0;

    while (start < content.length) {
      let end = Math.min(start + chunkSize, content.length);
      
      // Try to break at sentence or word boundary
      if (end < content.length) {
        const lastPeriod = content.lastIndexOf('.', end);
        const lastSpace = content.lastIndexOf(' ', end);
        
        if (lastPeriod > start + this.MIN_CHUNK_SIZE && lastPeriod > end - 50) {
          end = lastPeriod + 1;
        } else if (lastSpace > start + this.MIN_CHUNK_SIZE) {
          end = lastSpace;
        }
      }

      chunks.push({
        text: content.substring(start, end).trim(),
        metadata: {},
        start_char: start,
        end_char: end,
        chunk_index: 0
      });

      // Move start position with overlap
      start = end - overlap;
      if (start < 0) start = end;
    }

    return chunks;
  }

  /**
   * Extract metadata from a chunk of text
   */
  private extractChunkMetadata(text: string): ChunkMetadata {
    const metadata: ChunkMetadata = {};

    // Check for headings
    const headingMatch = text.match(/^(#{1,6})\s+/);
    if (headingMatch) {
      metadata.heading_level = headingMatch[1].length;
      metadata.block_type = 'heading';
    }

    // Check for lists
    if (/^[\s]*[-*+]\s+/.test(text)) {
      metadata.is_list = true;
      metadata.block_type = 'list';
    }

    // Check for code
    if (text.includes('```') || /^\s{4,}/.test(text)) {
      metadata.has_code = true;
      if (!metadata.block_type) {
        metadata.block_type = 'code';
      }
    }

    // Calculate importance score
    metadata.importance_score = this.calculateImportanceScore(text, metadata);

    return metadata;
  }

  /**
   * Calculate importance score for a chunk
   */
  private calculateImportanceScore(text: string, metadata: ChunkMetadata): number {
    let score = 0.5; // Base score

    // Headers are important
    if (metadata.heading_level) {
      score += (0.4 - (metadata.heading_level - 1) * 0.05);
    }

    // Lists are moderately important
    if (metadata.is_list) {
      score += 0.1;
    }

    // Code blocks are important
    if (metadata.has_code) {
      score += 0.2;
    }

    // Keywords that indicate importance
    const importantKeywords = [
      'important', 'critical', 'key', 'essential', 
      'must', 'required', 'note', 'warning', 'caution'
    ];
    
    const lowerText = text.toLowerCase();
    for (const keyword of importantKeywords) {
      if (lowerText.includes(keyword)) {
        score += 0.15;
        break;
      }
    }

    // Longer content might be more important
    if (text.length > 500) {
      score += 0.1;
    }

    // Cap at 1.0
    return Math.min(score, 1.0);
  }

  /**
   * Store chunks in the database
   */
  async storeChunks(
    documentId: string,
    chunks: DocumentChunk[]
  ): Promise<void> {
    const chunkRecords = chunks.map(chunk => ({
      document_id: documentId,
      chunk_text: chunk.text,
      chunk_index: chunk.chunk_index,
      start_char: chunk.start_char,
      end_char: chunk.end_char,
      metadata: chunk.metadata
    }));

    const { error } = await this.supabase
      .from('document_chunks')
      .insert(chunkRecords);

    if (error) {
      throw new Error(`Failed to store chunks: ${error.message}`);
    }
  }
}

export const documentChunkingService = new DocumentChunkingService();