import DOMPurify from 'isomorphic-dompurify';
import { z } from 'zod';

/**
 * Input sanitization service for preventing XSS and injection attacks
 */
export class InputSanitizer {
  /**
   * Sanitize HTML content to prevent XSS
   */
  static sanitizeHTML(input: string, options?: DOMPurify.Config): string {
    const config: DOMPurify.Config = {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'],
      ALLOWED_ATTR: ['href', 'target', 'rel'],
      ALLOW_DATA_ATTR: false,
      RETURN_DOM: false,
      RETURN_DOM_FRAGMENT: false,
      ...options
    };
    
    return DOMPurify.sanitize(input, config);
  }
  
  /**
   * Sanitize plain text (remove all HTML)
   */
  static sanitizeText(input: string): string {
    return DOMPurify.sanitize(input, { 
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true
    });
  }
  
  /**
   * Sanitize SQL input to prevent injection
   */
  static sanitizeSQL(input: string): string {
    // Remove common SQL injection patterns
    const patterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|FROM|WHERE|ORDER BY|GROUP BY|HAVING)\b)/gi,
      /(-{2}|\/\*|\*\/)/g, // SQL comments
      /(;|\||\\x[0-9a-f]{2})/gi, // Command separators and hex encoding
      /(\bOR\b.*=.*)/gi, // OR conditions
      /(\bAND\b.*=.*)/gi, // AND conditions
    ];
    
    let sanitized = input;
    patterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '');
    });
    
    // Escape special characters
    sanitized = sanitized
      .replace(/'/g, "''") // Escape single quotes
      .replace(/"/g, '""') // Escape double quotes
      .replace(/\\/g, '\\\\'); // Escape backslashes
    
    return sanitized.trim();
  }
  
  /**
   * Sanitize JSON input
   */
  static sanitizeJSON(input: string): object | null {
    try {
      const parsed = JSON.parse(input);
      // Recursively sanitize string values
      return this.sanitizeObject(parsed);
    } catch (error) {
      console.error('[Sanitizer] Invalid JSON:', error);
      return null;
    }
  }
  
  /**
   * Recursively sanitize object values
   */
  static sanitizeObject(obj: any): any {
    if (typeof obj === 'string') {
      return this.sanitizeText(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }
    
    if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Sanitize the key as well
        const sanitizedKey = this.sanitizeText(key);
        sanitized[sanitizedKey] = this.sanitizeObject(value);
      }
      return sanitized;
    }
    
    return obj;
  }
  
  /**
   * Sanitize file paths to prevent directory traversal
   */
  static sanitizeFilePath(input: string): string {
    // Remove directory traversal patterns
    return input
      .replace(/\.\./g, '') // Remove ..
      .replace(/[<>:"|?*]/g, '') // Remove invalid characters
      .replace(/^\/+/, '') // Remove leading slashes
      .replace(/\/+/g, '/'); // Normalize multiple slashes
  }
  
  /**
   * Sanitize URLs
   */
  static sanitizeURL(input: string): string | null {
    try {
      const url = new URL(input);
      
      // Only allow http(s) protocols
      if (!['http:', 'https:'].includes(url.protocol)) {
        return null;
      }
      
      // Prevent javascript: and data: URLs
      if (url.href.startsWith('javascript:') || url.href.startsWith('data:')) {
        return null;
      }
      
      return url.href;
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Sanitize email addresses
   */
  static sanitizeEmail(input: string): string | null {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const sanitized = input.trim().toLowerCase();
    
    return emailRegex.test(sanitized) ? sanitized : null;
  }
  
  /**
   * Validate and sanitize using Zod schema
   */
  static validateAndSanitize<T>(
    input: unknown,
    schema: z.ZodSchema<T>
  ): { success: boolean; data?: T; error?: string } {
    try {
      const validated = schema.parse(input);
      
      // Additional sanitization after validation
      if (typeof validated === 'object' && validated !== null) {
        return {
          success: true,
          data: this.sanitizeObject(validated) as T
        };
      }
      
      return { success: true, data: validated };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: error.errors.map(e => e.message).join(', ')
        };
      }
      return {
        success: false,
        error: 'Validation failed'
      };
    }
  }
}

/**
 * Common Zod schemas for validation
 */
export const ValidationSchemas = {
  // User input schemas
  userRegistration: z.object({
    email: z.string().email(),
    password: z.string().min(8).max(100),
    name: z.string().min(1).max(100),
  }),
  
  userLogin: z.object({
    email: z.string().email(),
    password: z.string(),
  }),
  
  // Database operation schemas
  databaseQuery: z.object({
    blockId: z.string().uuid(),
    filters: z.array(z.object({
      column: z.string(),
      operator: z.enum(['=', '!=', '>', '<', '>=', '<=', 'contains', 'not_contains']),
      value: z.any(),
    })).optional(),
    sort: z.object({
      column: z.string(),
      direction: z.enum(['asc', 'desc']),
    }).optional(),
    limit: z.number().min(1).max(1000).optional(),
    offset: z.number().min(0).optional(),
  }),
  
  // AI query schema
  aiQuery: z.object({
    prompt: z.string().min(1).max(2000),
    context: z.string().optional(),
    temperature: z.number().min(0).max(1).optional(),
  }),
  
  // File upload schema
  fileUpload: z.object({
    filename: z.string().max(255),
    mimetype: z.string(),
    size: z.number().max(10 * 1024 * 1024), // 10MB max
  }),
};

/**
 * Middleware for automatic input sanitization
 */
export async function sanitizationMiddleware(request: Request) {
  const url = new URL(request.url);
  
  // Sanitize URL parameters
  const sanitizedParams = new URLSearchParams();
  url.searchParams.forEach((value, key) => {
    const sanitizedKey = InputSanitizer.sanitizeText(key);
    const sanitizedValue = InputSanitizer.sanitizeText(value);
    sanitizedParams.set(sanitizedKey, sanitizedValue);
  });
  
  // For POST/PUT requests, sanitize body
  if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
    const contentType = request.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
      try {
        const body = await request.json();
        const sanitized = InputSanitizer.sanitizeObject(body);
        
        // Create new request with sanitized body
        return new Request(request.url, {
          ...request,
          body: JSON.stringify(sanitized),
        });
      } catch (error) {
        // Invalid JSON, let the handler deal with it
      }
    }
  }
  
  return request;
}

/**
 * Content Security Policy headers
 */
export function getSecurityHeaders(): HeadersInit {
  return {
    // XSS Protection
    'X-XSS-Protection': '1; mode=block',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    
    // Content Security Policy
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://api.openai.com https://*.sentry.io",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
    
    // Referrer Policy
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    
    // Permissions Policy
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  };
}