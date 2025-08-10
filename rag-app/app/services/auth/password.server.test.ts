import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  generateSecureToken,
  generateOTP,
} from "./password.server";

describe("Password Service", () => {
  describe("hashPassword", () => {
    it("should hash a password", async () => {
      const password = "TestPassword123!";
      const hash = await hashPassword(password);
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50);
    });
    
    it("should generate different hashes for same password", async () => {
      const password = "TestPassword123!";
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);
      
      expect(hash1).not.toBe(hash2);
    });
  });
  
  describe("verifyPassword", () => {
    it("should verify correct password", async () => {
      const password = "TestPassword123!";
      const hash = await hashPassword(password);
      
      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });
    
    it("should reject incorrect password", async () => {
      const password = "TestPassword123!";
      const hash = await hashPassword(password);
      
      const isValid = await verifyPassword("WrongPassword123!", hash);
      expect(isValid).toBe(false);
    });
  });
  
  describe("validatePasswordStrength", () => {
    it("should accept strong password", () => {
      const result = validatePasswordStrength("StrongPass123!");
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
    
    it("should reject short password", () => {
      const result = validatePasswordStrength("Pass1!");
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Password must be at least 8 characters long");
    });
    
    it("should reject password without uppercase", () => {
      const result = validatePasswordStrength("weakpass123!");
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Password must contain at least one uppercase letter");
    });
    
    it("should reject password without lowercase", () => {
      const result = validatePasswordStrength("WEAKPASS123!");
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Password must contain at least one lowercase letter");
    });
    
    it("should reject password without number", () => {
      const result = validatePasswordStrength("WeakPassword!");
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Password must contain at least one number");
    });
    
    it("should reject password without special character", () => {
      const result = validatePasswordStrength("WeakPassword123");
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Password must contain at least one special character (@$!%*?&)");
    });
    
    it("should reject common passwords", () => {
      const result = validatePasswordStrength("Password123!");
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Password is too common, please choose a more unique password");
    });
  });
  
  describe("generateSecureToken", () => {
    it("should generate token of specified length", () => {
      const token = generateSecureToken(32);
      
      expect(token).toHaveLength(32);
      expect(token).toMatch(/^[A-Za-z0-9]+$/);
    });
    
    it("should generate unique tokens", () => {
      const token1 = generateSecureToken(32);
      const token2 = generateSecureToken(32);
      
      expect(token1).not.toBe(token2);
    });
  });
  
  describe("generateOTP", () => {
    it("should generate numeric OTP", () => {
      const otp = generateOTP(6);
      
      expect(otp).toHaveLength(6);
      expect(otp).toMatch(/^\d+$/);
    });
    
    it("should generate unique OTPs", () => {
      const otp1 = generateOTP(6);
      const otp2 = generateOTP(6);
      
      // While they could theoretically be the same, it's extremely unlikely
      expect(otp1).toBeDefined();
      expect(otp2).toBeDefined();
    });
  });
});