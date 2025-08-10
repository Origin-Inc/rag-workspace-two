import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
  isTokenExpired,
} from "./jwt.server";

describe("JWT Service", () => {
  const mockUserId = "123e4567-e89b-12d3-a456-426614174000";
  const mockEmail = "test@example.com";
  const mockSessionId = "456e7890-e89b-12d3-a456-426614174000";
  const mockFamily = "family123";
  
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  describe("generateAccessToken", () => {
    it("should generate valid access token", () => {
      const { token, expiry } = generateAccessToken({
        userId: mockUserId,
        email: mockEmail,
        sessionId: mockSessionId,
      });
      
      expect(token).toBeDefined();
      expect(token.split(".")).toHaveLength(3); // JWT format
      expect(expiry).toBeInstanceOf(Date);
      expect(expiry.getTime()).toBeGreaterThan(Date.now());
    });
    
    it("should include optional workspace and role", () => {
      const { token } = generateAccessToken({
        userId: mockUserId,
        email: mockEmail,
        sessionId: mockSessionId,
        workspaceId: "workspace123",
        roleId: "role123",
        permissions: ["read", "write"],
      });
      
      const decoded = decodeToken(token);
      expect(decoded?.["workspaceId"]).toBe("workspace123");
      expect(decoded?.["roleId"]).toBe("role123");
      expect(decoded?.["permissions"]).toEqual(["read", "write"]);
    });
  });
  
  describe("generateRefreshToken", () => {
    it("should generate valid refresh token", () => {
      const { token, expiry } = generateRefreshToken({
        userId: mockUserId,
        family: mockFamily,
        sessionId: mockSessionId,
      });
      
      expect(token).toBeDefined();
      expect(token.split(".")).toHaveLength(3);
      expect(expiry).toBeInstanceOf(Date);
      expect(expiry.getTime()).toBeGreaterThan(Date.now() + 24 * 60 * 60 * 1000); // More than 1 day
    });
  });
  
  describe("generateTokenPair", () => {
    it("should generate both access and refresh tokens", () => {
      const tokens = generateTokenPair(
        mockUserId,
        mockEmail,
        mockSessionId,
        mockFamily
      );
      
      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.accessTokenExpiry).toBeInstanceOf(Date);
      expect(tokens.refreshTokenExpiry).toBeInstanceOf(Date);
      expect(tokens.refreshTokenExpiry.getTime()).toBeGreaterThan(
        tokens.accessTokenExpiry.getTime()
      );
    });
  });
  
  describe("verifyAccessToken", () => {
    it("should verify valid access token", () => {
      const { token } = generateAccessToken({
        userId: mockUserId,
        email: mockEmail,
        sessionId: mockSessionId,
      });
      
      const payload = verifyAccessToken(token);
      
      expect(payload.userId).toBe(mockUserId);
      expect(payload.email).toBe(mockEmail);
      expect(payload.sessionId).toBe(mockSessionId);
      expect(payload.type).toBe("access");
    });
    
    it("should throw error for invalid token", () => {
      expect(() => verifyAccessToken("invalid.token.here")).toThrow("Invalid token");
    });
    
    it("should throw error for wrong token type", () => {
      const { token } = generateRefreshToken({
        userId: mockUserId,
        family: mockFamily,
        sessionId: mockSessionId,
      });
      
      expect(() => verifyAccessToken(token)).toThrow();
    });
  });
  
  describe("verifyRefreshToken", () => {
    it("should verify valid refresh token", () => {
      const { token } = generateRefreshToken({
        userId: mockUserId,
        family: mockFamily,
        sessionId: mockSessionId,
      });
      
      const payload = verifyRefreshToken(token);
      
      expect(payload.userId).toBe(mockUserId);
      expect(payload.family).toBe(mockFamily);
      expect(payload.sessionId).toBe(mockSessionId);
      expect(payload.type).toBe("refresh");
    });
    
    it("should throw error for invalid token", () => {
      expect(() => verifyRefreshToken("invalid.token.here")).toThrow("Invalid refresh token");
    });
  });
  
  describe("decodeToken", () => {
    it("should decode token without verification", () => {
      const { token } = generateAccessToken({
        userId: mockUserId,
        email: mockEmail,
        sessionId: mockSessionId,
      });
      
      const decoded = decodeToken(token);
      
      expect(decoded).toBeDefined();
      expect(decoded?.["userId"]).toBe(mockUserId);
      expect(decoded?.["email"]).toBe(mockEmail);
    });
    
    it("should return null for invalid token", () => {
      const decoded = decodeToken("invalid.token");
      expect(decoded).toBeNull();
    });
  });
  
  describe("isTokenExpired", () => {
    it("should detect non-expired token", () => {
      const { token } = generateAccessToken({
        userId: mockUserId,
        email: mockEmail,
        sessionId: mockSessionId,
      });
      
      expect(isTokenExpired(token)).toBe(false);
    });
    
    it("should detect invalid token as expired", () => {
      expect(isTokenExpired("invalid.token")).toBe(true);
    });
  });
});