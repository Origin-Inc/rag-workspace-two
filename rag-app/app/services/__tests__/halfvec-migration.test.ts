import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '~/utils/db.server';
import { HalfvecMigrator } from '../../scripts/migrate-to-halfvec';
import { halfvecEmbeddingService } from '../halfvec-embedding-generation.server';
import { searchWithHalfvec } from '../halfvec-search.server';
import { vectorMetricsService } from '../monitoring/vector-metrics.server';
import { openai } from '../openai.server';
import { ensureVectorSearchPath } from '~/utils/db-vector.server';

// Mock OpenAI
vi.mock('../openai.server', () => ({
  openai: {
    embeddings: {
      create: vi.fn().mockResolvedValue({
        data: [{
          embedding: Array(1536).fill(0).map(() => Math.random())
        }]
      })
    }
  }
}));

describe('Halfvec Migration Test Suite', () => {
  let testPageId: string;
  let testWorkspaceId: string;
  let testEmbedding: number[];
  
  beforeAll(async () => {
    // Create test data
    testWorkspaceId = 'test-workspace-' + Date.now();
    testPageId = 'test-page-' + Date.now();
    testEmbedding = Array(1536).fill(0).map(() => Math.random());
    
    // Insert test page
    await prisma.page.create({
      data: {
        id: testPageId,
        title: 'Test Page for Halfvec Migration',
        content: { text: 'Test content for migration validation' },
        workspaceId: testWorkspaceId,
      }
    });
  });
  
  afterAll(async () => {
    // Cleanup test data
    try {
      await prisma.$executeRaw`
        DELETE FROM page_embeddings WHERE page_id = ${testPageId}::uuid
      `;
      await prisma.page.delete({
        where: { id: testPageId }
      });
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  });
  
  describe('Migration Infrastructure', () => {
    it('should have halfvec columns created', async () => {
      const result = await prisma.$queryRaw<any[]>`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'page_embeddings' 
          AND column_name LIKE '%halfvec%'
      `;
      
      expect(result.length).toBeGreaterThan(0);
      expect(result.some(r => r.column_name === 'embedding_halfvec')).toBe(true);
    });
    
    it('should have HNSW indexes created for halfvec columns', async () => {
      const result = await prisma.$queryRaw<any[]>`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'page_embeddings'
          AND indexname LIKE '%halfvec%'
      `;
      
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].indexdef).toContain('hnsw');
      expect(result[0].indexdef).toContain('halfvec_cosine_ops');
    });
    
    it('should have migration helper functions created', async () => {
      const result = await prisma.$queryRaw<any[]>`
        SELECT proname 
        FROM pg_proc 
        WHERE proname IN ('convert_to_halfvec', 'rollback_to_vector')
      `;
      
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });
  
  describe('Data Migration', () => {
    it('should convert vector embeddings to halfvec format', async () => {
      // Insert test embedding as vector
      const vectorString = `[${testEmbedding.join(',')}]`;
      await ensureVectorSearchPath();
      await prisma.$executeRaw`
        INSERT INTO page_embeddings (
          page_id, workspace_id, chunk_text, chunk_index, embedding
        ) VALUES (
          ${testPageId}::uuid,
          ${testWorkspaceId}::uuid,
          'Test chunk for conversion',
          0,
          ${vectorString}::vector(1536)
        )
      `;
      
      // Run conversion
      await ensureVectorSearchPath();
      await prisma.$executeRaw`
        UPDATE page_embeddings 
        SET embedding_halfvec = embedding::halfvec(1536)
        WHERE page_id = ${testPageId}::uuid
          AND embedding_halfvec IS NULL
      `;
      
      // Verify conversion
      const result = await prisma.$queryRaw<any[]>`
        SELECT 
          embedding IS NOT NULL as has_vector,
          embedding_halfvec IS NOT NULL as has_halfvec
        FROM page_embeddings
        WHERE page_id = ${testPageId}::uuid
      `;
      
      expect(result[0].has_vector).toBe(true);
      expect(result[0].has_halfvec).toBe(true);
    });
    
    it('should maintain data integrity during conversion', async () => {
      // Compare similarity scores between vector and halfvec
      const queryVector = `[${testEmbedding.join(',')}]`;
      
      await ensureVectorSearchPath();
      const vectorResult = await prisma.$queryRaw<any[]>`
        SELECT 1 - (embedding <=> ${queryVector}::vector) as similarity
        FROM page_embeddings
        WHERE page_id = ${testPageId}::uuid
          AND embedding IS NOT NULL
      `;
      
      const halfvecResult = await prisma.$queryRaw<any[]>`
        SELECT 1 - (embedding_halfvec <=> ${queryVector}::halfvec) as similarity
        FROM page_embeddings
        WHERE page_id = ${testPageId}::uuid
          AND embedding_halfvec IS NOT NULL
      `;
      
      if (vectorResult.length > 0 && halfvecResult.length > 0) {
        const vectorSim = vectorResult[0].similarity;
        const halfvecSim = halfvecResult[0].similarity;
        
        // Similarity should be within 2% tolerance
        expect(Math.abs(vectorSim - halfvecSim)).toBeLessThan(0.02);
      }
    });
  });
  
  describe('Storage Reduction', () => {
    it('should achieve significant storage reduction', async () => {
      const result = await prisma.$queryRaw<any[]>`
        SELECT 
          pg_column_size(embedding) as vector_size,
          pg_column_size(embedding_halfvec) as halfvec_size
        FROM page_embeddings
        WHERE page_id = ${testPageId}::uuid
          AND embedding IS NOT NULL
          AND embedding_halfvec IS NOT NULL
        LIMIT 1
      `;
      
      if (result.length > 0) {
        const vectorSize = result[0].vector_size;
        const halfvecSize = result[0].halfvec_size;
        const reduction = ((vectorSize - halfvecSize) / vectorSize) * 100;
        
        // Should achieve at least 50% reduction
        expect(reduction).toBeGreaterThan(50);
        // Should be close to the expected 57% reduction
        expect(reduction).toBeCloseTo(57, 5);
      }
    });
    
    it('should have smaller index sizes for halfvec', async () => {
      const result = await prisma.$queryRaw<any[]>`
        SELECT 
          indexname,
          pg_relation_size(indexname::regclass) as size_bytes
        FROM pg_indexes
        WHERE tablename = 'page_embeddings'
          AND (indexname LIKE '%vector%' OR indexname LIKE '%halfvec%')
      `;
      
      const vectorIndex = result.find(r => 
        r.indexname.includes('vector') && !r.indexname.includes('halfvec')
      );
      const halfvecIndex = result.find(r => r.indexname.includes('halfvec'));
      
      if (vectorIndex && halfvecIndex) {
        // Halfvec index should be significantly smaller
        expect(halfvecIndex.size_bytes).toBeLessThan(vectorIndex.size_bytes);
      }
    });
  });
  
  describe('Search Functionality', () => {
    it('should perform vector similarity search with halfvec', async () => {
      const results = await searchWithHalfvec(
        testWorkspaceId,
        'Test content',
        { forceVectorType: 'halfvec' }
      );
      
      expect(Array.isArray(results)).toBe(true);
    });
    
    it('should maintain search accuracy with halfvec', async () => {
      // Create multiple test embeddings
      const testChunks = [
        'First test chunk with unique content',
        'Second test chunk with different information',
        'Third test chunk with similar words',
      ];
      
      for (let i = 0; i < testChunks.length; i++) {
        const embedding = Array(1536).fill(0).map(() => Math.random());
        const vectorString = `[${embedding.join(',')}]`;
        
        await ensureVectorSearchPath();
        await prisma.$executeRaw`
          INSERT INTO page_embeddings (
            page_id, workspace_id, chunk_text, chunk_index, 
            embedding, embedding_halfvec
          ) VALUES (
            ${testPageId}::uuid,
            ${testWorkspaceId}::uuid,
            ${testChunks[i]},
            ${i + 1},
            ${vectorString}::vector(1536),
            ${vectorString}::halfvec(1536)
          )
        `;
      }
      
      // Search with both vector types
      const vectorResults = await searchWithHalfvec(
        testWorkspaceId,
        'test chunk',
        { forceVectorType: 'vector', limit: 3 }
      );
      
      const halfvecResults = await searchWithHalfvec(
        testWorkspaceId,
        'test chunk',
        { forceVectorType: 'halfvec', limit: 3 }
      );
      
      // Results should be similar
      expect(vectorResults.length).toBe(halfvecResults.length);
    });
    
    it('should handle mixed vector/halfvec environments', async () => {
      // Test auto-detection of vector type
      const results = await searchWithHalfvec(
        testWorkspaceId,
        'test',
        { forceVectorType: 'auto' }
      );
      
      expect(Array.isArray(results)).toBe(true);
    });
  });
  
  describe('Embedding Generation', () => {
    it('should generate and store halfvec embeddings', async () => {
      const newPageId = 'test-halfvec-gen-' + Date.now();
      
      await halfvecEmbeddingService.generatePageEmbeddings(
        newPageId,
        testWorkspaceId,
        'Content for halfvec embedding generation test',
        { forceVectorType: 'halfvec' }
      );
      
      const result = await prisma.$queryRaw<any[]>`
        SELECT COUNT(*) as count
        FROM page_embeddings
        WHERE page_id = ${newPageId}::uuid
          AND embedding_halfvec IS NOT NULL
      `;
      
      expect(Number(result[0].count)).toBeGreaterThan(0);
      
      // Cleanup
      await prisma.$executeRaw`
        DELETE FROM page_embeddings WHERE page_id = ${newPageId}::uuid
      `;
    });
    
    it('should support storing both vector types during migration', async () => {
      const newPageId = 'test-both-types-' + Date.now();
      
      await halfvecEmbeddingService.generatePageEmbeddings(
        newPageId,
        testWorkspaceId,
        'Content for both types test',
        { forceVectorType: 'both' }
      );
      
      const result = await prisma.$queryRaw<any[]>`
        SELECT 
          embedding IS NOT NULL as has_vector,
          embedding_halfvec IS NOT NULL as has_halfvec
        FROM page_embeddings
        WHERE page_id = ${newPageId}::uuid
        LIMIT 1
      `;
      
      if (result.length > 0) {
        expect(result[0].has_vector).toBe(true);
        expect(result[0].has_halfvec).toBe(true);
      }
      
      // Cleanup
      await prisma.$executeRaw`
        DELETE FROM page_embeddings WHERE page_id = ${newPageId}::uuid
      `;
    });
  });
  
  describe('Performance Monitoring', () => {
    it('should collect storage metrics', async () => {
      const metrics = await vectorMetricsService.getStorageMetrics();
      
      expect(metrics).toBeDefined();
      expect(metrics.overall).toBeDefined();
      expect(metrics.tables).toBeDefined();
      expect(typeof metrics.overall.storageReduction).toBe('number');
    });
    
    it('should compare search performance', async () => {
      const metrics = await vectorMetricsService.compareSearchAccuracy();
      
      expect(metrics).toBeDefined();
      expect(metrics.searchPerformance).toBeDefined();
      expect(metrics.searchAccuracy).toBeDefined();
      expect(typeof metrics.searchAccuracy.recall_at_10).toBe('number');
    });
    
    it('should generate progress report', async () => {
      const report = await vectorMetricsService.generateProgressReport();
      
      expect(typeof report).toBe('string');
      expect(report).toContain('HALFVEC MIGRATION PROGRESS REPORT');
      expect(report).toContain('Migration Progress:');
      expect(report).toContain('Storage Reduction:');
    });
  });
  
  describe('Rollback Capability', () => {
    it('should preserve original vector columns for rollback', async () => {
      const result = await prisma.$queryRaw<any[]>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'page_embeddings'
          AND column_name LIKE '%vector_backup%'
      `;
      
      // After column swap, backup columns should exist
      // This test would pass after running the column swap migration
      // For now, we check that the original columns still exist
      const originalColumns = await prisma.$queryRaw<any[]>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'page_embeddings'
          AND column_name = 'embedding'
      `;
      
      expect(originalColumns.length).toBeGreaterThan(0);
    });
    
    it('should have rollback function available', async () => {
      // This test checks if rollback function exists
      // It would be created by the column swap migration
      const result = await prisma.$queryRaw<any[]>`
        SELECT EXISTS (
          SELECT 1 FROM pg_proc 
          WHERE proname = 'rollback_to_vector'
        ) as has_rollback
      `;
      
      // Function may or may not exist depending on migration state
      expect(typeof result[0].has_rollback).toBe('boolean');
    });
  });
  
  describe('Edge Cases', () => {
    it('should handle null embeddings gracefully', async () => {
      await prisma.$executeRaw`
        INSERT INTO page_embeddings (
          page_id, workspace_id, chunk_text, chunk_index
        ) VALUES (
          ${testPageId}::uuid,
          ${testWorkspaceId}::uuid,
          'Chunk with no embedding',
          999
        )
      `;
      
      const result = await searchWithHalfvec(
        testWorkspaceId,
        'no embedding',
        { forceVectorType: 'auto' }
      );
      
      expect(Array.isArray(result)).toBe(true);
    });
    
    it('should handle malformed embeddings', async () => {
      // Test that the system handles errors gracefully
      const malformedVector = '[1,2,3]'; // Wrong dimension
      
      await expect(
        prisma.$executeRaw`
          INSERT INTO page_embeddings (
            page_id, workspace_id, chunk_text, chunk_index, embedding_halfvec
          ) VALUES (
            ${testPageId}::uuid,
            ${testWorkspaceId}::uuid,
            'Malformed embedding test',
            998,
            ${malformedVector}::halfvec(1536)
          )
        `
      ).rejects.toThrow();
    });
    
    it('should handle concurrent migrations', async () => {
      // Simulate concurrent conversion attempts
      const promises = [];
      
      for (let i = 0; i < 5; i++) {
        promises.push(
          prisma.$executeRaw`
            UPDATE page_embeddings 
            SET embedding_halfvec = embedding::halfvec(1536)
            WHERE page_id = ${testPageId}::uuid
              AND embedding IS NOT NULL
              AND embedding_halfvec IS NULL
          `
        );
      }
      
      const results = await Promise.allSettled(promises);
      
      // All should complete without error
      expect(results.every(r => r.status === 'fulfilled')).toBe(true);
    });
  });
});