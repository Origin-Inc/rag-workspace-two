import { describe, it, expect } from 'vitest';
import { 
  userRegistrationSchema, 
  userLoginSchema, 
  documentUploadSchema,
  querySchema 
} from './validation';

describe('Validation Schemas', () => {
  describe('User Registration Schema', () => {
    it('should validate correct registration data', () => {
      const validData = {
        email: 'test@example.com',
        password: 'Test123!@#',
        name: 'John Doe',
      };

      const result = userRegistrationSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const invalidData = {
        email: 'not-an-email',
        password: 'Test123!@#',
      };

      const result = userRegistrationSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject weak password', () => {
      const invalidData = {
        email: 'test@example.com',
        password: 'weak',
      };

      const result = userRegistrationSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('User Login Schema', () => {
    it('should validate correct login data', () => {
      const validData = {
        email: 'test@example.com',
        password: 'anypassword',
      };

      const result = userLoginSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });

  describe('Document Upload Schema', () => {
    it('should validate correct document data', () => {
      const validData = {
        title: 'Test Document',
        content: 'Some content here',
        fileType: 'pdf' as const,
        metadata: { author: 'John Doe' },
      };

      const result = documentUploadSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid file type', () => {
      const invalidData = {
        title: 'Test Document',
        fileType: 'exe',
      };

      const result = documentUploadSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('Query Schema', () => {
    it('should validate correct query', () => {
      const validData = {
        query: 'What is the meaning of life?',
        maxResults: 10,
        threshold: 0.8,
      };

      const result = querySchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should use default values', () => {
      const minimalData = {
        query: 'Test query',
      };

      const result = querySchema.safeParse(minimalData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxResults).toBe(5);
        expect(result.data.threshold).toBe(0.7);
      }
    });
  });
});