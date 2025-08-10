import { z } from "zod";

// Environment variable validation
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().startsWith("postgresql://"),
  REDIS_URL: z.string().url().startsWith("redis://"),
  OPENAI_API_KEY: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(32),
  SESSION_SECRET: z.string().min(32),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  MAX_FILE_SIZE: z.coerce.number().default(10485760),
  VECTOR_DIMENSIONS: z.coerce.number().default(1536),
  SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.7),
});

export type EnvConfig = z.infer<typeof envSchema>;

// User validation schemas
export const userRegistrationSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    "Password must contain at least one uppercase letter, one lowercase letter, one number and one special character"
  ),
  name: z.string().min(2).max(100).optional(),
});

export const userLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Document validation schemas
export const documentUploadSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().optional(),
  fileType: z.enum(["pdf", "txt", "md", "json", "csv"]).optional(),
  metadata: z.record(z.any()).optional(),
});

// Query validation schemas
export const querySchema = z.object({
  query: z.string().min(1).max(5000),
  maxResults: z.number().min(1).max(20).default(5),
  threshold: z.number().min(0).max(1).default(0.7),
});