/**
 * Tests for ContextPersistenceService
 *
 * Related: ADR-003 (Context Persistence Strategy), Task #67
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ContextPersistenceService } from './context-persistence.server';
import { prisma } from '~/utils/db.server';

describe('ContextPersistenceService', () => {
  // Test data
  const testWorkspaceId = '00000000-0000-0000-0000-000000000001';
  const testPageId = '00000000-0000-0000-0000-000000000002';
  const testFileId = '00000000-0000-0000-0000-000000000003';

  // Cleanup after each test
  afterEach(async () => {
    try {
      await prisma.queryHistory.deleteMany({ where: { pageId: testPageId } });
      await prisma.chatContext.deleteMany({ where: { pageId: testPageId } });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('loadContext', () => {
    it('should return empty context when none exists', async () => {
      const context = await ContextPersistenceService.loadContext(testPageId);

      expect(context).toEqual({
        activeFile: null,
        currentTopic: null,
        entities: {},
        preferences: {}
      });
    });

    it('should load existing context with all fields', async () => {
      // Create context directly
      await prisma.chatContext.create({
        data: {
          pageId: testPageId,
          workspaceId: testWorkspaceId,
          currentTopic: 'Sales Analysis',
          entities: { person: ['John', 'Mary'], company: ['Acme'] },
          preferences: { display: 'table', timezone: 'UTC' }
        }
      });

      const context = await ContextPersistenceService.loadContext(testPageId);

      expect(context.currentTopic).toBe('Sales Analysis');
      expect(context.entities).toEqual({ person: ['John', 'Mary'], company: ['Acme'] });
      expect(context.preferences).toEqual({ display: 'table', timezone: 'UTC' });
    });
  });

  describe('createContext', () => {
    it('should create new context with minimal fields', async () => {
      const created = await ContextPersistenceService.createContext({
        pageId: testPageId,
        workspaceId: testWorkspaceId
      });

      expect(created.pageId).toBe(testPageId);
      expect(created.workspaceId).toBe(testWorkspaceId);
      expect(created.currentTopic).toBeNull();
    });

    it('should create context with all optional fields', async () => {
      const created = await ContextPersistenceService.createContext({
        pageId: testPageId,
        workspaceId: testWorkspaceId,
        currentTopic: 'Revenue Analysis',
        entities: { product: ['Widget'] },
        preferences: { theme: 'dark' }
      });

      expect(created.currentTopic).toBe('Revenue Analysis');
      expect(created.entities).toEqual({ product: ['Widget'] });
      expect(created.preferences).toEqual({ theme: 'dark' });
    });
  });

  describe('saveContext', () => {
    beforeEach(async () => {
      await ContextPersistenceService.createContext({
        pageId: testPageId,
        workspaceId: testWorkspaceId
      });
    });

    it('should update active file', async () => {
      await ContextPersistenceService.saveContext(testPageId, {
        activeFileId: testFileId
      });

      const updated = await prisma.chatContext.findUnique({
        where: { pageId: testPageId }
      });

      expect(updated?.activeFileId).toBe(testFileId);
    });

    it('should update current topic', async () => {
      await ContextPersistenceService.saveContext(testPageId, {
        currentTopic: 'Q4 Revenue'
      });

      const updated = await prisma.chatContext.findUnique({
        where: { pageId: testPageId }
      });

      expect(updated?.currentTopic).toBe('Q4 Revenue');
    });

    it('should update entities', async () => {
      await ContextPersistenceService.saveContext(testPageId, {
        entities: { person: ['Alice', 'Bob'] }
      });

      const updated = await prisma.chatContext.findUnique({
        where: { pageId: testPageId }
      });

      expect(updated?.entities).toEqual({ person: ['Alice', 'Bob'] });
    });

    it('should update preferences', async () => {
      await ContextPersistenceService.saveContext(testPageId, {
        preferences: { format: 'chart', limit: 100 }
      });

      const updated = await prisma.chatContext.findUnique({
        where: { pageId: testPageId }
      });

      expect(updated?.preferences).toEqual({ format: 'chart', limit: 100 });
    });

    it('should throw error if context does not exist', async () => {
      const nonExistentPageId = '00000000-0000-0000-0000-999999999999';

      await expect(
        ContextPersistenceService.saveContext(nonExistentPageId, {
          currentTopic: 'Test'
        })
      ).rejects.toThrow('Context not found');
    });
  });

  describe('upsertContext', () => {
    it('should create context if it does not exist', async () => {
      const result = await ContextPersistenceService.upsertContext(
        testPageId,
        testWorkspaceId,
        { currentTopic: 'New Topic' }
      );

      expect(result.pageId).toBe(testPageId);
      expect(result.currentTopic).toBe('New Topic');
    });

    it('should update context if it exists', async () => {
      // Create initial context
      await ContextPersistenceService.createContext({
        pageId: testPageId,
        workspaceId: testWorkspaceId,
        currentTopic: 'Old Topic'
      });

      // Upsert with new topic
      const result = await ContextPersistenceService.upsertContext(
        testPageId,
        testWorkspaceId,
        { currentTopic: 'Updated Topic' }
      );

      expect(result.currentTopic).toBe('Updated Topic');
    });
  });

  describe('updateActiveFile', () => {
    beforeEach(async () => {
      await ContextPersistenceService.createContext({
        pageId: testPageId,
        workspaceId: testWorkspaceId
      });
    });

    it('should update active file ID', async () => {
      await ContextPersistenceService.updateActiveFile(testPageId, testFileId);

      const context = await prisma.chatContext.findUnique({
        where: { pageId: testPageId }
      });

      expect(context?.activeFileId).toBe(testFileId);
    });

    it('should clear active file when set to null', async () => {
      await ContextPersistenceService.updateActiveFile(testPageId, testFileId);
      await ContextPersistenceService.updateActiveFile(testPageId, null);

      const context = await prisma.chatContext.findUnique({
        where: { pageId: testPageId }
      });

      expect(context?.activeFileId).toBeNull();
    });
  });

  describe('updateTopic', () => {
    beforeEach(async () => {
      await ContextPersistenceService.createContext({
        pageId: testPageId,
        workspaceId: testWorkspaceId
      });
    });

    it('should update topic', async () => {
      await ContextPersistenceService.updateTopic(testPageId, 'Revenue Analysis');

      const context = await prisma.chatContext.findUnique({
        where: { pageId: testPageId }
      });

      expect(context?.currentTopic).toBe('Revenue Analysis');
    });
  });

  describe('addEntity', () => {
    beforeEach(async () => {
      await ContextPersistenceService.createContext({
        pageId: testPageId,
        workspaceId: testWorkspaceId
      });
    });

    it('should add entity to new type', async () => {
      await ContextPersistenceService.addEntity(testPageId, 'person', 'John');

      const context = await ContextPersistenceService.loadContext(testPageId);
      expect(context.entities).toEqual({ person: ['John'] });
    });

    it('should add entity to existing type', async () => {
      await ContextPersistenceService.addEntity(testPageId, 'person', 'John');
      await ContextPersistenceService.addEntity(testPageId, 'person', 'Mary');

      const context = await ContextPersistenceService.loadContext(testPageId);
      expect(context.entities.person).toEqual(['John', 'Mary']);
    });

    it('should not add duplicate entities', async () => {
      await ContextPersistenceService.addEntity(testPageId, 'person', 'John');
      await ContextPersistenceService.addEntity(testPageId, 'person', 'John');

      const context = await ContextPersistenceService.loadContext(testPageId);
      expect(context.entities.person).toEqual(['John']);
    });
  });

  describe('Query History', () => {
    beforeEach(async () => {
      await ContextPersistenceService.createContext({
        pageId: testPageId,
        workspaceId: testWorkspaceId
      });
    });

    describe('addToHistory', () => {
      it('should add query to history', async () => {
        const entry = await ContextPersistenceService.addToHistory(
          testPageId,
          'SELECT * FROM sales',
          'data_query',
          'SELECT * FROM sales WHERE revenue > 1000',
          { rows: 10 },
          'Here are the sales results'
        );

        expect(entry.query).toBe('SELECT * FROM sales');
        expect(entry.intent).toBe('data_query');
        expect(entry.sql).toBe('SELECT * FROM sales WHERE revenue > 1000');
        expect(entry.response).toBe('Here are the sales results');
      });

      it('should add query without optional fields', async () => {
        const entry = await ContextPersistenceService.addToHistory(
          testPageId,
          'What is the total revenue?',
          'general_chat'
        );

        expect(entry.query).toBe('What is the total revenue?');
        expect(entry.sql).toBeNull();
        expect(entry.results).toBeNull();
      });
    });

    describe('getRecentHistory', () => {
      it('should return empty array when no history', async () => {
        const history = await ContextPersistenceService.getRecentHistory(testPageId);
        expect(history).toEqual([]);
      });

      it('should return recent queries in descending order', async () => {
        await ContextPersistenceService.addToHistory(testPageId, 'Query 1', 'general_chat');
        await new Promise(resolve => setTimeout(resolve, 10)); // Ensure different timestamps
        await ContextPersistenceService.addToHistory(testPageId, 'Query 2', 'general_chat');
        await new Promise(resolve => setTimeout(resolve, 10));
        await ContextPersistenceService.addToHistory(testPageId, 'Query 3', 'general_chat');

        const history = await ContextPersistenceService.getRecentHistory(testPageId, 10);

        expect(history).toHaveLength(3);
        expect(history[0].query).toBe('Query 3');
        expect(history[1].query).toBe('Query 2');
        expect(history[2].query).toBe('Query 1');
      });

      it('should respect limit parameter', async () => {
        for (let i = 1; i <= 5; i++) {
          await ContextPersistenceService.addToHistory(testPageId, `Query ${i}`, 'general_chat');
        }

        const history = await ContextPersistenceService.getRecentHistory(testPageId, 3);
        expect(history).toHaveLength(3);
      });
    });

    describe('getUShapedHistory', () => {
      it('should return first N and last M queries', async () => {
        // Add 10 queries
        for (let i = 1; i <= 10; i++) {
          await ContextPersistenceService.addToHistory(testPageId, `Query ${i}`, 'general_chat');
          await new Promise(resolve => setTimeout(resolve, 5));
        }

        // Get first 2 + last 3 (U-shaped)
        const history = await ContextPersistenceService.getUShapedHistory(testPageId, 2, 3);

        expect(history.length).toBeLessThanOrEqual(5);
        // Should contain first and last queries
        expect(history.some(h => h.query === 'Query 1')).toBe(true);
        expect(history.some(h => h.query === 'Query 10')).toBe(true);
      });

      it('should deduplicate overlapping queries', async () => {
        // Add only 3 queries total
        await ContextPersistenceService.addToHistory(testPageId, 'Query 1', 'general_chat');
        await new Promise(resolve => setTimeout(resolve, 5));
        await ContextPersistenceService.addToHistory(testPageId, 'Query 2', 'general_chat');
        await new Promise(resolve => setTimeout(resolve, 5));
        await ContextPersistenceService.addToHistory(testPageId, 'Query 3', 'general_chat');

        // Request first 2 + last 2 (will overlap)
        const history = await ContextPersistenceService.getUShapedHistory(testPageId, 2, 2);

        // Should not have duplicates
        expect(history).toHaveLength(3);
      });
    });

    describe('getQueryCount', () => {
      it('should return 0 when no queries', async () => {
        const count = await ContextPersistenceService.getQueryCount(testPageId);
        expect(count).toBe(0);
      });

      it('should return correct count', async () => {
        await ContextPersistenceService.addToHistory(testPageId, 'Query 1', 'general_chat');
        await ContextPersistenceService.addToHistory(testPageId, 'Query 2', 'data_query');

        const count = await ContextPersistenceService.getQueryCount(testPageId);
        expect(count).toBe(2);
      });
    });

    describe('clearHistory', () => {
      it('should delete all queries for page', async () => {
        await ContextPersistenceService.addToHistory(testPageId, 'Query 1', 'general_chat');
        await ContextPersistenceService.addToHistory(testPageId, 'Query 2', 'general_chat');

        await ContextPersistenceService.clearHistory(testPageId);

        const count = await ContextPersistenceService.getQueryCount(testPageId);
        expect(count).toBe(0);
      });
    });
  });

  describe('deleteContext', () => {
    it('should delete context', async () => {
      await ContextPersistenceService.createContext({
        pageId: testPageId,
        workspaceId: testWorkspaceId
      });

      await ContextPersistenceService.deleteContext(testPageId);

      const context = await prisma.chatContext.findUnique({
        where: { pageId: testPageId }
      });

      expect(context).toBeNull();
    });
  });

  describe('getContextWithHistory', () => {
    it('should load both context and history', async () => {
      await ContextPersistenceService.createContext({
        pageId: testPageId,
        workspaceId: testWorkspaceId,
        currentTopic: 'Analysis'
      });

      await ContextPersistenceService.addToHistory(testPageId, 'Query 1', 'general_chat');
      await ContextPersistenceService.addToHistory(testPageId, 'Query 2', 'data_query');

      const result = await ContextPersistenceService.getContextWithHistory(testPageId);

      expect(result.context.currentTopic).toBe('Analysis');
      expect(result.history).toHaveLength(2);
    });
  });
});
