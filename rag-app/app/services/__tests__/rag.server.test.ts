import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RAGService } from '../rag.server';
import { DocumentChunkingService } from '../document-chunking.server';
import { EmbeddingGenerationService } from '../embedding-generation.server';

// Mock OpenAI
vi.mock('../openai.server', () => ({
  openai: {
    embeddings: {
      create: vi.fn()
    },
    chat: {
      completions: {
        create: vi.fn()
      }
    }
  },
  isOpenAIConfigured: vi.fn().mockReturnValue(true)
}));

// Mock Supabase
vi.mock('~/utils/supabase.server', () => ({
  createSupabaseAdmin: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => Promise.resolve({
          data: [{ passage_id: 'test-passage-1' }],
          error: null
        }))
      })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({
            data: { id: 'test-id' },
            error: null
          }))
        }))
      }))
    })),
    rpc: vi.fn(() => Promise.resolve({
      data: {
        summary: 'Test workspace summary',
        key_pages: ['Page 1', 'Page 2'],
        important_items: [],
        citations: []
      },
      error: null
    }))
  }))
}));

describe('DocumentChunkingService', () => {
  let chunkingService: DocumentChunkingService;

  beforeEach(() => {
    chunkingService = new DocumentChunkingService();
  });

  describe('chunkDocument', () => {
    it('should chunk text by size', async () => {
      const content = 'This is a test document. '.repeat(100);
      const chunks = await chunkingService.chunkDocument(content, {
        chunkSize: 100,
        overlap: 20,
        preserveParagraphs: false
      });

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].text).toBeDefined();
      expect(chunks[0].metadata).toBeDefined();
      expect(chunks[0].chunk_index).toBe(0);
    });

    it('should preserve paragraphs when requested', async () => {
      const content = `First paragraph here.

Second paragraph here.

Third paragraph here.`;

      const chunks = await chunkingService.chunkDocument(content, {
        chunkSize: 50,
        overlap: 10,
        preserveParagraphs: true
      });

      expect(chunks.length).toBeGreaterThanOrEqual(3);
      expect(chunks[0].text).toContain('First paragraph');
    });

    it('should preserve code blocks', async () => {
      const content = `Some text before code.

\`\`\`javascript
function test() {
  return "Hello World";
}
\`\`\`

Some text after code.`;

      const chunks = await chunkingService.chunkDocument(content, {
        chunkSize: 100,
        overlap: 20,
        preserveCodeBlocks: true
      });

      // Find the code block chunk
      const codeChunk = chunks.find(c => c.metadata.has_code);
      expect(codeChunk).toBeDefined();
      expect(codeChunk?.metadata.language).toBe('javascript');
    });

    it('should extract metadata correctly', async () => {
      const content = `# Important Heading

This is important content that must be processed.

- Item 1
- Item 2
- Item 3`;

      const chunks = await chunkingService.chunkDocument(content);

      // Check for heading metadata
      const headingChunk = chunks.find(c => c.metadata.heading_level);
      expect(headingChunk).toBeDefined();
      expect(headingChunk?.metadata.heading_level).toBe(1);

      // Check for list metadata
      const listChunk = chunks.find(c => c.metadata.is_list);
      expect(listChunk).toBeDefined();
    });

    it('should calculate importance scores', async () => {
      const importantContent = 'This is a critical and important section that is required.';
      const normalContent = 'This is just some regular text.';

      const importantChunks = await chunkingService.chunkDocument(importantContent);
      const normalChunks = await chunkingService.chunkDocument(normalContent);

      expect(importantChunks[0].metadata.importance_score).toBeGreaterThan(
        normalChunks[0].metadata.importance_score!
      );
    });
  });
});

describe('RAGService', () => {
  let ragService: RAGService;

  beforeEach(() => {
    vi.clearAllMocks();
    ragService = new RAGService();
  });

  describe('buildAugmentedContext', () => {
    it('should build context from search results', async () => {
      const searchResults = [
        {
          id: '1',
          content: 'First result content',
          similarity: 0.9,
          passage_id: 'passage-1',
          source_block_id: 'block-1',
          metadata: {}
        },
        {
          id: '2',
          content: 'Second result content',
          similarity: 0.8,
          passage_id: 'passage-2',
          source_block_id: 'block-2',
          metadata: {}
        }
      ];

      const context = await ragService.buildAugmentedContext(
        'test query',
        searchResults,
        {
          maxTokens: 1000,
          includeCitations: true
        }
      );

      expect(context.text).toContain('First result content');
      expect(context.text).toContain('Second result content');
      expect(context.citations).toHaveLength(2);
      expect(context.citations[0].passage_id).toBe('passage-1');
    });

    it('should respect token limits', async () => {
      const longContent = 'This is a very long content. '.repeat(100);
      const searchResults = Array.from({ length: 10 }, (_, i) => ({
        id: `${i}`,
        content: longContent,
        similarity: 0.9 - i * 0.01,
        passage_id: `passage-${i}`,
        metadata: {}
      }));

      const context = await ragService.buildAugmentedContext(
        'test query',
        searchResults,
        {
          maxTokens: 500, // Small limit
          includeCitations: true
        }
      );

      // Should have stopped adding results due to token limit
      expect(context.citations.length).toBeLessThan(10);
      expect(context.totalTokens).toBeLessThanOrEqual(500 * 1.2); // Allow some overflow
    });
  });

  describe('generateAnswer', () => {
    it('should generate an answer from context', async () => {
      const { openai } = await import('../openai.server');
      vi.mocked(openai.chat.completions.create).mockResolvedValueOnce({
        choices: [{
          message: {
            content: 'This is the generated answer'
          }
        }],
        usage: {
          total_tokens: 100
        }
      } as any);

      const answer = await ragService.generateAnswer(
        'What is the capital of France?',
        'Paris is the capital of France.',
        {
          temperature: 0.5,
          maxTokens: 500
        }
      );

      expect(answer).toBe('This is the generated answer');
      expect(openai.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4-turbo-preview',
          temperature: 0.5,
          max_tokens: 500
        })
      );
    });
  });

  describe('generateAnswerWithCitations', () => {
    it('should generate answer with citations', async () => {
      const { openai } = await import('../openai.server');
      vi.mocked(openai.chat.completions.create).mockResolvedValueOnce({
        choices: [{
          message: {
            content: 'Based on [passage-1], Paris is the capital of France.'
          }
        }]
      } as any);

      const context = {
        text: '[passage-1] Paris is the capital of France.',
        citations: [{
          passage_id: 'passage-1',
          source_block_id: 'block-1',
          content: 'Paris is the capital of France.'
        }],
        totalTokens: 50
      };

      const result = await ragService.generateAnswerWithCitations(
        'What is the capital of France?',
        context
      );

      expect(result.answer).toContain('Paris');
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0].passage_id).toBe('passage-1');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should handle no citations in answer', async () => {
      const { openai } = await import('../openai.server');
      vi.mocked(openai.chat.completions.create).mockResolvedValueOnce({
        choices: [{
          message: {
            content: 'I cannot find this information in the provided context.'
          }
        }]
      } as any);

      const context = {
        text: 'Some unrelated content',
        citations: [{
          passage_id: 'passage-1',
          source_block_id: 'block-1',
          content: 'Some unrelated content'
        }],
        totalTokens: 50
      };

      const result = await ragService.generateAnswerWithCitations(
        'What is the capital of Mars?',
        context
      );

      expect(result.citations).toHaveLength(0);
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe('generateWorkspaceSummary', () => {
    it('should generate workspace summary', async () => {
      const { openai } = await import('../openai.server');
      vi.mocked(openai.chat.completions.create).mockResolvedValueOnce({
        choices: [{
          message: {
            content: 'Formatted workspace summary'
          }
        }]
      } as any);

      const summary = await ragService.generateWorkspaceSummary(
        'workspace-123',
        'comprehensive'
      );

      expect(summary.summary).toBe('Formatted workspace summary');
      expect(summary.key_pages).toEqual(['Page 1', 'Page 2']);
    });
  });
});

describe('EmbeddingGenerationService', () => {
  let embeddingService: EmbeddingGenerationService;

  beforeEach(() => {
    vi.clearAllMocks();
    embeddingService = new EmbeddingGenerationService();
  });

  describe('generateEmbedding', () => {
    it('should generate embedding for text', async () => {
      const { openai } = await import('../openai.server');
      const mockEmbedding = Array(1536).fill(0.1);
      
      vi.mocked(openai.embeddings.create).mockResolvedValueOnce({
        data: [{
          embedding: mockEmbedding
        }],
        usage: {
          total_tokens: 50
        }
      } as any);

      const result = await embeddingService.generateEmbedding('Test text');

      expect(result.embedding).toHaveLength(1536);
      expect(result.tokens).toBe(50);
      expect(openai.embeddings.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'text-embedding-3-small',
          input: 'Test text',
          dimensions: 1536
        })
      );
    });
  });

  describe('generateEmbeddingsBatch', () => {
    it('should generate embeddings for multiple texts', async () => {
      const { openai } = await import('../openai.server');
      const mockEmbedding = Array(1536).fill(0.1);
      
      vi.mocked(openai.embeddings.create).mockResolvedValueOnce({
        data: [
          { embedding: mockEmbedding },
          { embedding: mockEmbedding }
        ],
        usage: {
          total_tokens: 100
        }
      } as any);

      const texts = ['Text 1', 'Text 2'];
      const results = await embeddingService.generateEmbeddingsBatch(texts);

      expect(results).toHaveLength(2);
      expect(results[0].embedding).toHaveLength(1536);
    });

    it('should handle batch size limits', async () => {
      const { openai } = await import('../openai.server');
      const mockEmbedding = Array(1536).fill(0.1);
      
      // Create 150 texts (more than batch size)
      const texts = Array(150).fill('Test text');
      
      vi.mocked(openai.embeddings.create).mockImplementation(() => 
        Promise.resolve({
          data: Array(Math.min(texts.length, 100)).fill({ embedding: mockEmbedding }),
          usage: { total_tokens: 100 }
        } as any)
      );

      const results = await embeddingService.generateEmbeddingsBatch(texts);

      expect(results).toHaveLength(150);
      // Should have been called twice (100 + 50)
      expect(openai.embeddings.create).toHaveBeenCalledTimes(2);
    });
  });
});