import '@testing-library/jest-dom';
import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect with testing-library matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock environment variables for testing
process.env["NODE_ENV"] = 'test';
process.env["DATABASE_URL"] = 'postgresql://test:test@localhost:5432/test';
process.env["REDIS_URL"] = 'redis://localhost:6379';
process.env["JWT_SECRET"] = 'test-secret';
process.env["SESSION_SECRET"] = 'test-session-secret';