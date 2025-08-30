/**
 * Production-ready error handling utilities
 */

import { json } from "@remix-run/node";

export class ApplicationError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = "ApplicationError";
  }
}

export class ValidationError extends ApplicationError {
  constructor(message: string, details?: any) {
    super(message, 400, "VALIDATION_ERROR", details);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends ApplicationError {
  constructor(message: string = "Resource not found") {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends ApplicationError {
  constructor(message: string = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends ApplicationError {
  constructor(message: string = "Forbidden") {
    super(message, 403, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

/**
 * Handle errors in loaders and actions
 */
export function handleError(error: unknown) {
  console.error("[Error Handler]", error);
  
  // Handle known application errors
  if (error instanceof ApplicationError) {
    return json(
      {
        error: error.message,
        code: error.code,
        details: error.details,
      },
      { status: error.statusCode }
    );
  }
  
  // Handle Prisma errors
  if (error && typeof error === 'object' && 'code' in error) {
    const prismaError = error as any;
    
    switch (prismaError.code) {
      case 'P2002':
        return json(
          { error: "A record with this value already exists" },
          { status: 409 }
        );
      case 'P2025':
        return json(
          { error: "Record not found" },
          { status: 404 }
        );
      case 'P2003':
        return json(
          { error: "Invalid reference" },
          { status: 400 }
        );
      default:
        console.error("Prisma error:", prismaError);
        return json(
          { error: "Database error occurred" },
          { status: 500 }
        );
    }
  }
  
  // Handle generic errors
  if (error instanceof Error) {
    return json(
      { error: error.message },
      { status: 500 }
    );
  }
  
  // Fallback for unknown errors
  return json(
    { error: "An unexpected error occurred" },
    { status: 500 }
  );
}

/**
 * Safe JSON parse with error handling
 */
export function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text);
  } catch (error) {
    console.error("JSON parse error:", error);
    return fallback;
  }
}

/**
 * Wrap async functions with error handling
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  errorHandler?: (error: unknown) => void
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (errorHandler) {
        errorHandler(error);
      } else {
        console.error("Unhandled error:", error);
      }
      throw error;
    }
  }) as T;
}

/**
 * Retry failed operations with exponential backoff
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: unknown;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      // Don't retry on client errors
      if (error instanceof ApplicationError && error.statusCode < 500) {
        throw error;
      }
      
      if (i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}