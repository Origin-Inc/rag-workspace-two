/**
 * Tests for Context API endpoints
 *
 * Related: Task #73 - Phase 3: Create Context API Endpoints
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loader, action } from '~/routes/api.context.$pageId';
import { prisma } from '~/utils/db.server';

// Mock auth
vi.mock('~/services/auth/auth.server', () => ({
  requireUser: vi.fn(async () => ({
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
  })),
}));

describe('Context API', () => {
  // Test data
  const testUserId = 'test-user-id';
  const testWorkspaceId = '00000000-0000-0000-0000-000000000001';
  const testPageId = '00000000-0000-0000-0000-000000000002';
  const testFileId = '00000000-0000-0000-0000-000000000003';

  // Setup test workspace and page
  beforeEach(async () => {
    // Create test workspace
    try {
      await prisma.workspace.create({
        data: {
          id: testWorkspaceId,
          name: 'Test Workspace',
          slug: 'test-workspace-' + Date.now(),
        },
      });
    } catch (error) {
      // Workspace might already exist
    }

    // Create test page
    try {
      await prisma.page.create({
        data: {
          id: testPageId,
          workspaceId: testWorkspaceId,
          title: 'Test Page',
          slug: 'test-page-' + Date.now(),
        },
      });
    } catch (error) {
      // Page might already exist
    }

    // Create user-workspace association
    try {
      await prisma.userWorkspace.create({
        data: {
          userId: testUserId,
          workspaceId: testWorkspaceId,
          roleId: '00000000-0000-0000-0000-000000000000', // Mock role
        },
      });
    } catch (error) {
      // Association might already exist
    }
  });

  // Cleanup after each test
  afterEach(async () => {
    try {
      await prisma.queryHistory.deleteMany({ where: { pageId: testPageId } });
      await prisma.chatContext.deleteMany({ where: { pageId: testPageId } });
      await prisma.userWorkspace.deleteMany({ where: { userId: testUserId } });
      await prisma.page.deleteMany({ where: { id: testPageId } });
      await prisma.workspace.deleteMany({ where: { id: testWorkspaceId } });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('GET /api/context/:pageId', () => {
    it('should return empty context when none exists', async () => {
      const request = new Request(`http://localhost/api/context/${testPageId}`);
      const response = await loader({
        request,
        params: { pageId: testPageId },
        context: {},
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.context).toEqual({
        activeFile: null,
        currentTopic: null,
        entities: {},
        preferences: {},
      });
      expect(data.queryHistory).toEqual([]);
    });

    it('should return existing context with history', async () => {
      // Create context
      await prisma.chatContext.create({
        data: {
          pageId: testPageId,
          workspaceId: testWorkspaceId,
          currentTopic: 'Sales Analysis',
          entities: { person: ['John'] },
          preferences: { display: 'table' },
        },
      });

      // Add query history
      await prisma.queryHistory.create({
        data: {
          pageId: testPageId,
          query: 'What is the total revenue?',
          intent: 'data_query',
          sql: 'SELECT SUM(revenue) FROM sales',
        },
      });

      const request = new Request(`http://localhost/api/context/${testPageId}`);
      const response = await loader({
        request,
        params: { pageId: testPageId },
        context: {},
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.context.currentTopic).toBe('Sales Analysis');
      expect(data.context.entities).toEqual({ person: ['John'] });
      expect(data.queryHistory).toHaveLength(1);
      expect(data.queryHistory[0].query).toBe('What is the total revenue?');
    });

    it('should return 400 when pageId is missing', async () => {
      const request = new Request('http://localhost/api/context/');
      const response = await loader({
        request,
        params: {},
        context: {},
      });

      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Page ID required');
    });

    it('should return 404 for non-existent page', async () => {
      const nonExistentPageId = '00000000-0000-0000-0000-999999999999';
      const request = new Request(`http://localhost/api/context/${nonExistentPageId}`);
      const response = await loader({
        request,
        params: { pageId: nonExistentPageId },
        context: {},
      });

      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Page not found or access denied');
    });
  });

  describe('POST /api/context/:pageId', () => {
    it('should create new context when none exists', async () => {
      const requestBody = {
        currentTopic: 'Revenue Analysis',
        entities: { product: ['Widget'] },
        preferences: { theme: 'dark' },
      };

      const request = new Request(`http://localhost/api/context/${testPageId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const response = await action({
        request,
        params: { pageId: testPageId },
        context: {},
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify context was created in database
      const created = await prisma.chatContext.findUnique({
        where: { pageId: testPageId },
      });

      expect(created).toBeTruthy();
      expect(created?.currentTopic).toBe('Revenue Analysis');
      expect(created?.entities).toEqual({ product: ['Widget'] });
    });

    it('should update existing context', async () => {
      // Create initial context
      await prisma.chatContext.create({
        data: {
          pageId: testPageId,
          workspaceId: testWorkspaceId,
          currentTopic: 'Initial Topic',
        },
      });

      const requestBody = {
        currentTopic: 'Updated Topic',
        activeFileId: testFileId,
      };

      const request = new Request(`http://localhost/api/context/${testPageId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const response = await action({
        request,
        params: { pageId: testPageId },
        context: {},
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify context was updated
      const updated = await prisma.chatContext.findUnique({
        where: { pageId: testPageId },
      });

      expect(updated?.currentTopic).toBe('Updated Topic');
      expect(updated?.activeFileId).toBe(testFileId);
    });

    it('should validate input with Zod schema', async () => {
      const invalidBody = {
        activeFileId: 'not-a-uuid', // Invalid UUID
      };

      const request = new Request(`http://localhost/api/context/${testPageId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidBody),
      });

      const response = await action({
        request,
        params: { pageId: testPageId },
        context: {},
      });

      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid context data');
      expect(data.details).toBeDefined();
    });

    it('should handle null values correctly', async () => {
      // Create context with values
      await prisma.chatContext.create({
        data: {
          pageId: testPageId,
          workspaceId: testWorkspaceId,
          currentTopic: 'Some Topic',
          activeFileId: testFileId,
        },
      });

      // Update with null to clear values
      const requestBody = {
        currentTopic: null,
        activeFileId: null,
      };

      const request = new Request(`http://localhost/api/context/${testPageId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const response = await action({
        request,
        params: { pageId: testPageId },
        context: {},
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify values were cleared
      const updated = await prisma.chatContext.findUnique({
        where: { pageId: testPageId },
      });

      expect(updated?.currentTopic).toBeNull();
      expect(updated?.activeFileId).toBeNull();
    });

    it('should return 400 when pageId is missing', async () => {
      const request = new Request('http://localhost/api/context/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const response = await action({
        request,
        params: {},
        context: {},
      });

      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Page ID required');
    });

    it('should return 404 for non-existent page', async () => {
      const nonExistentPageId = '00000000-0000-0000-0000-999999999999';
      const request = new Request(`http://localhost/api/context/${nonExistentPageId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentTopic: 'Test' }),
      });

      const response = await action({
        request,
        params: { pageId: nonExistentPageId },
        context: {},
      });

      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Page not found or access denied');
    });

    it('should return 405 for non-POST methods', async () => {
      const request = new Request(`http://localhost/api/context/${testPageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const response = await action({
        request,
        params: { pageId: testPageId },
        context: {},
      });

      const data = await response.json();

      expect(response.status).toBe(405);
      expect(data.error).toBe('Method not allowed');
    });

    it('should handle complex entity and preference objects', async () => {
      const requestBody = {
        entities: {
          person: ['John Doe', 'Jane Smith'],
          company: ['Acme Corp', 'TechStart Inc'],
          location: ['New York', 'San Francisco'],
        },
        preferences: {
          display: 'table',
          timezone: 'America/New_York',
          theme: 'dark',
          chartType: 'bar',
          nested: {
            level1: {
              level2: 'value',
            },
          },
        },
      };

      const request = new Request(`http://localhost/api/context/${testPageId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const response = await action({
        request,
        params: { pageId: testPageId },
        context: {},
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify complex objects stored correctly
      const created = await prisma.chatContext.findUnique({
        where: { pageId: testPageId },
      });

      expect(created?.entities).toEqual(requestBody.entities);
      expect(created?.preferences).toEqual(requestBody.preferences);
    });
  });
});
