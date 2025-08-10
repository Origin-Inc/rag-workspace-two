import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Configuration Tests', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should have required environment variables', () => {
    const requiredEnvVars = [
      'DATABASE_URL',
      'REDIS_URL',
      'JWT_SECRET',
      'SESSION_SECRET',
    ];

    requiredEnvVars.forEach(envVar => {
      expect(process.env[envVar], `${envVar} should be defined`).toBeDefined();
    });
  });

  it('should have valid PostgreSQL connection string', () => {
    const dbUrl = process.env["DATABASE_URL"];
    expect(dbUrl).toMatch(/^postgresql:\/\/.+/);
  });

  it('should have valid Redis connection string', () => {
    const redisUrl = process.env["REDIS_URL"];
    expect(redisUrl).toMatch(/^redis:\/\/.+/);
  });
});