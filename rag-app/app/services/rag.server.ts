import { openai } from './openai.server';
import { createSupabaseAdmin } from '~/utils/supabase.server';
import { DebugLogger } from '~/utils/debug-logger';

interface SearchResult {
  id: string;
  content: string;
  similarity?: number;
  rank?: number;
  passage_id: string;
  source_block_id?: string;
  metadata?: Record<string, any>;
}

interface AugmentedContext {
  text: string;
  citations: Array<{
    passage_id: string;
    source_block_id?: string;
    content: string;
  }>;
  totalTokens: number;
}

interface WorkspaceSummary {
  summary: string;
  key_pages: string[];
  important_items: string[];
  citations: Array<{
    passage_id: string;
    block_id?: string;
  }>;
}

interface AnswerWithCitations {
  answer: string;
  citations: Array<{
    passage_id: string;
    source_block_id?: string;
    excerpt: string;
  }>;
  confidence: number;
}

export class RAGService {
  private readonly supabase = createSupabaseAdmin();
  private readonly logger = new DebugLogger('RAGService');
  
  // Configuration
  private readonly MAX_CONTEXT_TOKENS = 4000;
  private readonly DEFAULT_TEMPERATURE = 0.7;
  private readonly DEFAULT_MAX_TOKENS = 1500;

  /**
   * Build augmented context from search results
   */
  async buildAugmentedContext(
    query: string,
    searchResults: SearchResult[],
    options: {
      maxTokens?: number;
      includeCitations?: boolean;
      rankByRelevance?: boolean;
    } = {}
  ): Promise<AugmentedContext> {
    const {
      maxTokens = this.MAX_CONTEXT_TOKENS,
      includeCitations = true,
      rankByRelevance = true
    } = options;

    this.logger.info('Building augmented context', {
      query,
      resultsCount: searchResults.length,
      maxTokens
    });

    // Sort results by relevance if requested
    const sortedResults = rankByRelevance
      ? this.rankResultsByRelevance(searchResults, query)
      : searchResults;

    // Build context text and citations
    const contextParts: string[] = [];
    const citations: AugmentedContext['citations'] = [];
    let totalTokens = 0;

    for (const result of sortedResults) {
      const estimatedTokens = this.estimateTokens(result.content);
      
      // Check if adding this result would exceed token limit
      if (totalTokens + estimatedTokens > maxTokens) {
        this.logger.info('Token limit reached', { 
          totalTokens, 
          maxTokens 
        });
        break;
      }

      // Add to context
      contextParts.push(`[${result.passage_id}] ${result.content}`);
      totalTokens += estimatedTokens;

      // Add citation
      if (includeCitations) {
        citations.push({
          passage_id: result.passage_id,
          source_block_id: result.source_block_id,
          content: result.content.substring(0, 200) // Excerpt
        });
      }
    }

    const contextText = contextParts.join('\n\n');

    this.logger.info('Context built', {
      contextLength: contextText.length,
      citationsCount: citations.length,
      totalTokens
    });

    return {
      text: contextText,
      citations,
      totalTokens
    };
  }

  /**
   * Generate an answer using RAG
   */
  async generateAnswer(
    query: string,
    context: string,
    options: {
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
    } = {}
  ): Promise<string> {
    const {
      systemPrompt = this.getDefaultSystemPrompt(),
      temperature = this.DEFAULT_TEMPERATURE,
      maxTokens = this.DEFAULT_MAX_TOKENS
    } = options;

    this.logger.info('Generating answer', {
      queryLength: query.length,
      contextLength: context.length,
      temperature,
      maxTokens
    });

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { 
            role: 'user', 
            content: this.buildRAGPrompt(query, context)
          }
        ],
        temperature,
        max_tokens: maxTokens
      });

      const answer = response.choices[0]?.message?.content || 'Unable to generate answer';

      this.logger.info('Answer generated', {
        answerLength: answer.length,
        tokensUsed: response.usage?.total_tokens
      });

      return answer;
    } catch (error) {
      this.logger.error('Failed to generate answer', error);
      throw new Error(`Answer generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate answer with citations
   */
  async generateAnswerWithCitations(
    query: string,
    context: AugmentedContext
  ): Promise<AnswerWithCitations> {
    this.logger.info('Generating answer with citations');

    const systemPrompt = `You are a helpful AI assistant that answers questions based on the provided context.
When answering, cite your sources using the passage IDs in square brackets [passage_id].
If the context doesn't contain enough information to answer the question, say so.
Be accurate and specific in your answers.`;

    const userPrompt = `Context:
${context.text}

Question: ${query}

Please provide a comprehensive answer with citations to the relevant passages.`;

    try {
      if (!openai) {
        throw new Error('OpenAI client is not configured. Check OPENAI_API_KEY environment variable.');
      }

      this.logger.info('Making OpenAI API call', { 
        model: 'gpt-4-turbo-preview',
        contextLength: context.text.length,
        userPromptLength: userPrompt.length
      });

      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 1500
      });

      this.logger.info('OpenAI API response received', {
        hasChoices: !!response.choices?.length,
        responseId: response.id,
        usage: response.usage
      });

      const answer = response.choices[0]?.message?.content || '';
      
      if (!answer) {
        throw new Error('OpenAI returned empty response');
      }

      // Extract cited passage IDs from the answer
      const citedPassageIds = this.extractCitedPassageIds(answer);
      
      // Get the actual citations
      const citations = context.citations.filter(c => 
        citedPassageIds.includes(c.passage_id)
      );

      // Calculate confidence based on citation coverage
      const confidence = citations.length > 0 
        ? Math.min(0.9, 0.5 + (citations.length * 0.1))
        : 0.3;

      return {
        answer,
        citations: citations.map(c => ({
          passage_id: c.passage_id,
          source_block_id: c.source_block_id,
          excerpt: c.content
        })),
        confidence
      };
    } catch (error) {
      this.logger.error('Failed to generate answer with citations', error);
      throw new Error(`Answer generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate workspace summary
   */
  async generateWorkspaceSummary(
    workspaceId: string,
    summaryType: string = 'comprehensive'
  ): Promise<WorkspaceSummary> {
    this.logger.info('Generating workspace summary', {
      workspaceId,
      summaryType
    });

    try {
      // Call the summarize_workspace RPC function
      const { data, error } = await this.supabase
        .rpc('summarize_workspace', {
          workspace_uuid: workspaceId,
          summary_type: summaryType
        });

      if (error) {
        throw new Error(`Summary generation failed: ${error.message}`);
      }

      // Process the raw summary with AI for better formatting
      const processedSummary = await this.processRawSummary(
        data.summary,
        data.key_pages,
        data.citations
      );

      return {
        summary: processedSummary,
        key_pages: data.key_pages || [],
        important_items: data.important_items || [],
        citations: data.citations || []
      };
    } catch (error) {
      this.logger.error('Failed to generate workspace summary', error);
      throw new Error(`Summary generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process raw summary with AI
   */
  private async processRawSummary(
    rawSummary: string,
    keyPages: any[],
    citations: any[]
  ): Promise<string> {
    const systemPrompt = `You are an AI that creates concise, well-structured summaries of workspace content.
Format the summary with clear sections and bullet points where appropriate.
Highlight key information and important insights.`;

    const userPrompt = `Please create a comprehensive summary from the following workspace content:

${rawSummary}

Key pages in the workspace: ${keyPages?.join(', ') || 'None identified'}

Format this as a clear, structured summary that highlights:
1. Main topics and themes
2. Key information and insights
3. Important items or action points
4. Overall workspace organization`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.5,
        max_tokens: 1000
      });

      return response.choices[0]?.message?.content || rawSummary;
    } catch (error) {
      this.logger.error('Failed to process summary', error);
      // Return raw summary if processing fails
      return rawSummary;
    }
  }

  /**
   * Build RAG prompt
   */
  private buildRAGPrompt(query: string, context: string): string {
    return `Based on the following context, please answer the question. If the context doesn't contain enough information to answer the question completely, say so.

Context:
${context}

Question: ${query}

Answer:`;
  }

  /**
   * Get default system prompt
   */
  private getDefaultSystemPrompt(): string {
    return `You are a helpful AI assistant that provides accurate, relevant answers based on the provided context.
Your responses should be:
1. Accurate and based only on the provided context
2. Clear and well-structured
3. Honest about limitations when context is insufficient
4. Professional and helpful in tone`;
  }

  /**
   * Rank results by relevance to query
   */
  private rankResultsByRelevance(
    results: SearchResult[],
    query: string
  ): SearchResult[] {
    const queryTerms = query.toLowerCase().split(/\s+/);
    
    return results.sort((a, b) => {
      // Calculate relevance score for each result
      const scoreA = this.calculateRelevanceScore(a, queryTerms);
      const scoreB = this.calculateRelevanceScore(b, queryTerms);
      
      return scoreB - scoreA;
    });
  }

  /**
   * Calculate relevance score for a result
   */
  private calculateRelevanceScore(
    result: SearchResult,
    queryTerms: string[]
  ): number {
    let score = 0;
    
    // Start with similarity score if available
    if (result.similarity) {
      score += result.similarity * 0.5;
    }
    
    // Add rank score if available
    if (result.rank) {
      score += result.rank * 0.3;
    }
    
    // Check for query term matches
    const contentLower = result.content.toLowerCase();
    for (const term of queryTerms) {
      if (contentLower.includes(term)) {
        score += 0.1;
      }
    }
    
    // Boost for metadata importance
    if (result.metadata?.importance_score) {
      score += result.metadata.importance_score * 0.2;
    }
    
    return score;
  }

  /**
   * Estimate token count for text
   */
  private estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Extract cited passage IDs from answer text
   */
  private extractCitedPassageIds(answer: string): string[] {
    const passageIds: string[] = [];
    const regex = /\[([^\]]+)\]/g;
    let match;
    
    while ((match = regex.exec(answer)) !== null) {
      passageIds.push(match[1]);
    }
    
    return [...new Set(passageIds)]; // Remove duplicates
  }
}

export const ragService = new RAGService();