import { describe, it, expect, vi } from "vitest";
import {
  generateCSRFToken,
  validateCSRFToken,
  DoubleSubmitCSRF,
} from "./csrf.server";

// Mock sessionStorage
vi.mock("./session.server", () => ({
  sessionStorage: {
    getSession: vi.fn().mockResolvedValue({
      get: vi.fn(),
      set: vi.fn(),
    }),
    commitSession: vi.fn().mockResolvedValue("cookie-string"),
  },
}));

describe("CSRF Protection", () => {
  describe("generateCSRFToken", () => {
    it("should generate unique tokens", () => {
      const token1 = generateCSRFToken();
      const token2 = generateCSRFToken();
      
      expect(token1).toHaveLength(32);
      expect(token2).toHaveLength(32);
      expect(token1).not.toBe(token2);
    });
  });
  
  describe("validateCSRFToken", () => {
    it("should skip validation for GET requests", async () => {
      const request = new Request("http://localhost/test", {
        method: "GET",
      });
      
      const isValid = await validateCSRFToken(request);
      expect(isValid).toBe(true);
    });
    
    it("should skip validation for HEAD requests", async () => {
      const request = new Request("http://localhost/test", {
        method: "HEAD",
      });
      
      const isValid = await validateCSRFToken(request);
      expect(isValid).toBe(true);
    });
    
    it("should skip validation for OPTIONS requests", async () => {
      const request = new Request("http://localhost/test", {
        method: "OPTIONS",
      });
      
      const isValid = await validateCSRFToken(request);
      expect(isValid).toBe(true);
    });
  });
  
  describe("DoubleSubmitCSRF", () => {
    const csrf = new DoubleSubmitCSRF();
    
    it("should generate token and set cookie header", async () => {
      const { token, headers } = await csrf.generateToken();
      
      expect(token).toHaveLength(32);
      expect(headers.get("Set-Cookie")).toContain("__csrf=");
      expect(headers.get("Set-Cookie")).toContain("HttpOnly");
      expect(headers.get("Set-Cookie")).toContain("SameSite=Strict");
    });
    
    it("should skip validation for safe methods", async () => {
      const request = new Request("http://localhost/test", {
        method: "GET",
      });
      
      const isValid = await csrf.validate(request);
      expect(isValid).toBe(true);
    });
    
    it("should fail validation without cookie", async () => {
      const request = new Request("http://localhost/test", {
        method: "POST",
      });
      
      const isValid = await csrf.validate(request);
      expect(isValid).toBe(false);
    });
    
    it("should fail validation with mismatched tokens", async () => {
      const request = new Request("http://localhost/test", {
        method: "POST",
        headers: {
          "Cookie": "__csrf=token123",
          "X-CSRF-Token": "differenttoken",
        },
      });
      
      const isValid = await csrf.validate(request);
      expect(isValid).toBe(false);
    });
    
    it("should pass validation with matching tokens", async () => {
      const token = "matching-token-123";
      const request = new Request("http://localhost/test", {
        method: "POST",
        headers: {
          "Cookie": `__csrf=${token}`,
          "X-CSRF-Token": token,
        },
      });
      
      const isValid = await csrf.validate(request);
      expect(isValid).toBe(true);
    });
  });
});