import { DebugLogger } from '~/utils/debug-logger';

interface ChunkOptions {
  maxTokens?: number;
  overlap?: number;
  preserveStructure?: boolean;
  metadata?: Record<string, any>;
}

interface TextChunk {
  text: string;
  metadata: Record<string, any>;
  index: number;
}

export class SemanticChunker {
  private readonly logger = new DebugLogger('SemanticChunker');
  
  // Default configuration based on 2025 best practices
  private readonly DEFAULT_MAX_TOKENS = 512;
  private readonly DEFAULT_OVERLAP = 50;
  private readonly MIN_CHUNK_SIZE = 100;
  
  /**
   * Chunk text semantically, preserving context and structure
   * Based on 2025 RAG best practices: semantic boundaries > fixed size
   */
  chunk(text: string, options: ChunkOptions = {}): TextChunk[] {
    const {
      maxTokens = this.DEFAULT_MAX_TOKENS,
      overlap = this.DEFAULT_OVERLAP,
      preserveStructure = true,
      metadata = {}
    } = options;
    
    this.logger.info('Starting semantic chunking', {
      textLength: text.length,
      maxTokens,
      overlap,
      preserveStructure
    });
    
    // Step 1: Split into semantic units
    const semanticUnits = preserveStructure 
      ? this.splitBySemanticBoundaries(text)
      : this.splitBySentences(text);
    
    // Step 2: Group units into optimal chunks
    const chunks = this.groupIntoChunks(semanticUnits, maxTokens, overlap);
    
    // Step 3: Add context to each chunk
    const contextualChunks = this.addContextToChunks(chunks, metadata);
    
    this.logger.info('Chunking completed', {
      inputLength: text.length,
      chunkCount: contextualChunks.length,
      avgChunkSize: Math.round(
        contextualChunks.reduce((sum, c) => sum + c.text.length, 0) / contextualChunks.length
      )
    });
    
    return contextualChunks;
  }
  
  /**
   * Split text by semantic boundaries (headers, paragraphs, lists)
   */
  private splitBySemanticBoundaries(text: string): string[] {
    const units: string[] = [];
    
    // Split by markdown headers and paragraphs
    const lines = text.split('\n');
    let currentUnit = '';
    let inCodeBlock = false;
    let inList = false;
    
    for (const line of lines) {
      // Handle code blocks
      if (line.startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        if (currentUnit.trim()) {
          units.push(currentUnit.trim());
          currentUnit = '';
        }
        currentUnit = line;
        continue;
      }
      
      if (inCodeBlock) {
        currentUnit += '\n' + line;
        continue;
      }
      
      // Handle headers - always start new unit
      if (line.match(/^#{1,6}\s/)) {
        if (currentUnit.trim()) {
          units.push(currentUnit.trim());
        }
        currentUnit = line;
        continue;
      }
      
      // Handle lists
      const isListItem = line.match(/^[\s]*[-*•]\s/) || line.match(/^[\s]*\d+\.\s/);
      if (isListItem) {
        if (!inList && currentUnit.trim()) {
          units.push(currentUnit.trim());
          currentUnit = '';
        }
        inList = true;
        currentUnit += (currentUnit ? '\n' : '') + line;
        continue;
      } else if (inList && line.trim() === '') {
        // End of list
        if (currentUnit.trim()) {
          units.push(currentUnit.trim());
        }
        currentUnit = '';
        inList = false;
        continue;
      }
      
      // Handle paragraphs - double newline starts new unit
      if (line.trim() === '') {
        if (currentUnit.trim() && !inList) {
          units.push(currentUnit.trim());
          currentUnit = '';
        }
      } else {
        currentUnit += (currentUnit ? '\n' : '') + line;
      }
    }
    
    // Add remaining content
    if (currentUnit.trim()) {
      units.push(currentUnit.trim());
    }
    
    return units;
  }
  
  /**
   * Simple sentence-based splitting as fallback
   */
  private splitBySentences(text: string): string[] {
    // Split by sentence endings, keeping the delimiter
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    return sentences.map(s => s.trim()).filter(Boolean);
  }
  
  /**
   * Group semantic units into chunks of appropriate size
   */
  private groupIntoChunks(
    units: string[], 
    maxTokens: number, 
    overlap: number
  ): string[][] {
    const chunks: string[][] = [];
    let currentChunk: string[] = [];
    let currentTokens = 0;
    
    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      const unitTokens = this.estimateTokens(unit);
      
      // If single unit is too large, split it
      if (unitTokens > maxTokens) {
        // Save current chunk if exists
        if (currentChunk.length > 0) {
          chunks.push([...currentChunk]);
          currentChunk = [];
          currentTokens = 0;
        }
        
        // Split large unit
        const splitUnits = this.splitLargeUnit(unit, maxTokens);
        for (const splitUnit of splitUnits) {
          chunks.push([splitUnit]);
        }
        continue;
      }
      
      // Check if adding this unit exceeds limit
      if (currentTokens + unitTokens > maxTokens) {
        // Save current chunk
        if (currentChunk.length > 0) {
          chunks.push([...currentChunk]);
        }
        
        // Start new chunk with overlap
        currentChunk = [];
        currentTokens = 0;
        
        // Add overlap from previous chunk if exists
        if (overlap > 0 && chunks.length > 0 && i > 0) {
          let overlapTokens = 0;
          for (let j = i - 1; j >= 0 && overlapTokens < overlap; j--) {
            const overlapUnit = units[j];
            const overlapUnitTokens = this.estimateTokens(overlapUnit);
            if (overlapTokens + overlapUnitTokens <= overlap) {
              currentChunk.unshift(overlapUnit);
              overlapTokens += overlapUnitTokens;
              currentTokens += overlapUnitTokens;
            }
          }
        }
      }
      
      // Add unit to current chunk
      currentChunk.push(unit);
      currentTokens += unitTokens;
    }
    
    // Add remaining chunk
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }
    
    return chunks;
  }
  
  /**
   * Split a large unit into smaller chunks
   */
  private splitLargeUnit(text: string, maxTokens: number): string[] {
    const words = text.split(' ');
    const chunks: string[] = [];
    let currentChunk = '';
    let currentTokens = 0;
    
    for (const word of words) {
      const wordTokens = this.estimateTokens(word);
      
      if (currentTokens + wordTokens > maxTokens) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = word;
        currentTokens = wordTokens;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + word;
        currentTokens += wordTokens;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }
  
  /**
   * Add contextual information to chunks
   * This is crucial for RAG quality - chunks need context
   */
  private addContextToChunks(
    chunks: string[][], 
    globalMetadata: Record<string, any>
  ): TextChunk[] {
    return chunks.map((chunkUnits, index) => {
      const text = chunkUnits.join('\n\n');
      
      // Extract local context from chunk
      const localContext: Record<string, any> = {
        chunkIndex: index,
        totalChunks: chunks.length,
        position: this.getChunkPosition(index, chunks.length),
      };
      
      // Check for headers in chunk
      const headers = text.match(/^#{1,6}\s.+$/gm);
      if (headers && headers.length > 0) {
        localContext.headers = headers.map(h => h.replace(/^#+\s/, ''));
      }
      
      // Check for special content types
      if (text.includes('```')) {
        localContext.hasCode = true;
      }
      if (text.match(/^[\s]*[-*•]\s/m) || text.match(/^[\s]*\d+\.\s/m)) {
        localContext.hasList = true;
      }
      if (text.match(/^\|.+\|$/m)) {
        localContext.hasTable = true;
      }
      
      return {
        text,
        metadata: {
          ...globalMetadata,
          ...localContext,
        },
        index,
      };
    });
  }
  
  /**
   * Get semantic position of chunk (beginning, middle, end)
   */
  private getChunkPosition(index: number, total: number): string {
    if (total === 1) return 'single';
    if (index === 0) return 'beginning';
    if (index === total - 1) return 'end';
    return 'middle';
  }
  
  /**
   * Estimate token count (rough approximation)
   * In production, use tiktoken or actual tokenizer
   */
  private estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    // This is a simplification; in production use proper tokenization
    return Math.ceil(text.length / 4);
  }
}