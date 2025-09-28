/**
 * Response Validator Service
 * Validates GPT-5 responses for quality and structure
 */

import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('response-validator');

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  quality: 'high' | 'medium' | 'low';
  shouldRetry: boolean;
}

export interface ResponseSchema {
  required?: string[];
  properties?: Record<string, any>;
  minLength?: Record<string, number>;
  maxLength?: Record<string, number>;
}

export class ResponseValidatorService {
  private static instance: ResponseValidatorService;
  private genericPatterns: RegExp[];
  private lowQualityIndicators: string[];

  private constructor() {
    // Patterns that indicate generic or low-quality responses
    this.genericPatterns = [
      /Analyzing \d+ file\(s\)/i,
      /I'm analyzing/i,
      /Let me analyze/i,
      /Based on the information provided/i,
      /The data shows/i,
      /Unable to extract/i,
      /Content analysis unavailable/i,
      /Please provide more/i,
      /I cannot access/i
    ];

    this.lowQualityIndicators = [
      'analyzing',
      'processing',
      'reviewing',
      'examining',
      'looking at',
      'considering'
    ];
  }

  static getInstance(): ResponseValidatorService {
    if (!ResponseValidatorService.instance) {
      ResponseValidatorService.instance = new ResponseValidatorService();
    }
    return ResponseValidatorService.instance;
  }

  /**
   * Validate a response from GPT-5
   */
  validate(response: any, schema?: ResponseSchema, model?: string): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      quality: 'high',
      shouldRetry: false
    };

    // Check if response exists
    if (!response) {
      result.errors.push('Response is null or undefined');
      result.isValid = false;
      result.shouldRetry = true;
      result.quality = 'low';
      return result;
    }

    // Validate against schema if provided
    if (schema) {
      this.validateSchema(response, schema, result);
    }

    // Check for generic responses
    this.checkGenericContent(response, result);

    // Check response quality
    this.assessQuality(response, result);

    // Model-specific validation
    if (model) {
      this.validateModelSpecific(response, model, result);
    }

    // Determine if retry is needed
    result.shouldRetry = this.shouldRetry(result);

    logger.trace('Response validation complete', {
      isValid: result.isValid,
      quality: result.quality,
      errorCount: result.errors.length,
      warningCount: result.warnings.length,
      shouldRetry: result.shouldRetry
    });

    return result;
  }

  /**
   * Validate response against schema
   */
  private validateSchema(response: any, schema: ResponseSchema, result: ValidationResult): void {
    // Check required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in response) || response[field] === null || response[field] === undefined) {
          result.errors.push(`Missing required field: ${field}`);
          result.isValid = false;
        }
      }
    }

    // Check field types
    if (schema.properties) {
      for (const [field, expectedType] of Object.entries(schema.properties)) {
        if (field in response) {
          const actualType = Array.isArray(response[field]) ? 'array' : typeof response[field];
          if (actualType !== expectedType) {
            result.warnings.push(`Field ${field} has type ${actualType}, expected ${expectedType}`);
          }
        }
      }
    }

    // Check field lengths
    if (schema.minLength) {
      for (const [field, minLen] of Object.entries(schema.minLength)) {
        if (field in response && response[field]) {
          const length = typeof response[field] === 'string' 
            ? response[field].length 
            : Array.isArray(response[field]) 
              ? response[field].length 
              : 0;
          
          if (length < minLen) {
            result.warnings.push(`Field ${field} is too short (${length} < ${minLen})`);
            result.quality = result.quality === 'high' ? 'medium' : result.quality;
          }
        }
      }
    }

    if (schema.maxLength) {
      for (const [field, maxLen] of Object.entries(schema.maxLength)) {
        if (field in response && response[field]) {
          const length = typeof response[field] === 'string' 
            ? response[field].length 
            : Array.isArray(response[field]) 
              ? response[field].length 
              : 0;
          
          if (length > maxLen) {
            result.warnings.push(`Field ${field} is too long (${length} > ${maxLen})`);
          }
        }
      }
    }
  }

  /**
   * Check for generic content
   */
  private checkGenericContent(response: any, result: ValidationResult): void {
    const textContent = this.extractTextContent(response);
    
    // Check for generic patterns
    for (const pattern of this.genericPatterns) {
      if (pattern.test(textContent)) {
        result.warnings.push(`Generic pattern detected: ${pattern.source}`);
        result.quality = 'medium';
      }
    }

    // Check for low-quality indicators
    const lowerContent = textContent.toLowerCase();
    const indicatorCount = this.lowQualityIndicators.filter(
      indicator => lowerContent.includes(indicator)
    ).length;

    if (indicatorCount >= 3) {
      result.warnings.push('Multiple low-quality indicators found');
      result.quality = 'low';
    }

    // Check if response is too short to be useful
    if (textContent.length < 50) {
      result.warnings.push('Response is very short');
      result.quality = 'low';
    }

    // Check if response seems to be an error message
    if (textContent.includes('error') || textContent.includes('failed')) {
      result.errors.push('Response contains error indicators');
      result.isValid = false;
    }
  }

  /**
   * Assess overall response quality
   */
  private assessQuality(response: any, result: ValidationResult): void {
    const textContent = this.extractTextContent(response);
    
    // Quality metrics
    let qualityScore = 100;

    // Length check
    if (textContent.length < 100) qualityScore -= 30;
    else if (textContent.length < 200) qualityScore -= 15;

    // Specificity check
    const hasSpecificData = /\d{2,}|\$[\d,]+|[\d.]+%/g.test(textContent);
    if (!hasSpecificData) qualityScore -= 20;

    // Structure check
    const hasStructure = response.summary || response.content || response.analysis;
    if (!hasStructure) qualityScore -= 25;

    // Array content check
    if ('keyThemes' in response && Array.isArray(response.keyThemes)) {
      if (response.keyThemes.length === 0) qualityScore -= 15;
      else if (response.keyThemes.every((t: string) => t.length < 5)) qualityScore -= 10;
    }

    // Determine quality level
    if (qualityScore >= 70) {
      result.quality = 'high';
    } else if (qualityScore >= 40) {
      result.quality = 'medium';
    } else {
      result.quality = 'low';
    }

    logger.trace('Quality assessment', {
      qualityScore,
      quality: result.quality,
      contentLength: textContent.length
    });
  }

  /**
   * Model-specific validation
   */
  private validateModelSpecific(response: any, model: string, result: ValidationResult): void {
    if (model.includes('gpt-5')) {
      // GPT-5 specific checks
      
      // Check if structured output is properly formatted
      if (response && typeof response === 'object') {
        // GPT-5 should provide well-structured responses
        const hasProperStructure = Object.keys(response).length >= 2;
        if (!hasProperStructure) {
          result.warnings.push('GPT-5 response lacks expected structure');
        }
      }

      // Check for verbosity level appropriateness
      const textLength = this.extractTextContent(response).length;
      if (textLength > 10000) {
        result.warnings.push('Response may be overly verbose');
      }
    } else if (model.includes('gpt-4')) {
      // GPT-4 specific checks
      
      // Check for common GPT-4 issues
      if (this.extractTextContent(response).includes('As an AI')) {
        result.warnings.push('Response contains AI self-reference');
        result.quality = result.quality === 'high' ? 'medium' : result.quality;
      }
    }
  }

  /**
   * Determine if retry is needed
   */
  private shouldRetry(result: ValidationResult): boolean {
    // Always retry on critical errors
    if (!result.isValid && result.errors.length > 0) {
      return true;
    }

    // Retry on low quality with no content
    if (result.quality === 'low' && result.errors.length === 0) {
      return true;
    }

    // Don't retry on medium/high quality
    return false;
  }

  /**
   * Extract text content from response
   */
  private extractTextContent(response: any): string {
    if (typeof response === 'string') {
      return response;
    }

    if (typeof response === 'object' && response !== null) {
      const parts: string[] = [];
      
      // Extract common text fields
      const textFields = ['summary', 'content', 'narrative', 'analysis', 'text', 'message'];
      for (const field of textFields) {
        if (field in response && typeof response[field] === 'string') {
          parts.push(response[field]);
        }
      }

      // Extract from arrays
      const arrayFields = ['keyThemes', 'insights', 'recommendations', 'entities'];
      for (const field of arrayFields) {
        if (field in response && Array.isArray(response[field])) {
          parts.push(...response[field].filter((item: any) => typeof item === 'string'));
        }
      }

      return parts.join(' ');
    }

    return '';
  }

  /**
   * Create validation schema for common response types
   */
  createSchema(type: 'semantic' | 'analysis' | 'summary' | 'extraction'): ResponseSchema {
    switch (type) {
      case 'semantic':
        return {
          required: ['summary'],
          properties: {
            summary: 'string',
            context: 'string',
            keyThemes: 'array',
            entities: 'array',
            relationships: 'array'
          },
          minLength: {
            summary: 50
          }
        };

      case 'analysis':
        return {
          required: ['analysis', 'insights'],
          properties: {
            analysis: 'string',
            insights: 'array',
            metrics: 'object'
          },
          minLength: {
            analysis: 100
          }
        };

      case 'summary':
        return {
          required: ['summary'],
          properties: {
            summary: 'string'
          },
          minLength: {
            summary: 50
          },
          maxLength: {
            summary: 500
          }
        };

      case 'extraction':
        return {
          required: ['data'],
          properties: {
            data: 'array',
            metadata: 'object'
          }
        };

      default:
        return {};
    }
  }
}

// Export singleton instance
export const responseValidator = ResponseValidatorService.getInstance();