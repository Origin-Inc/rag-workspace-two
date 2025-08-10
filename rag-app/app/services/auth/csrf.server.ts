import { json } from "@remix-run/node";
import { sessionStorage } from "./session.server";
import { generateSecureToken } from "./password.server";

const CSRF_TOKEN_NAME = "csrf_token";
const CSRF_HEADER_NAME = "X-CSRF-Token";
const CSRF_FORM_FIELD = "_csrf";

/**
 * Generate a new CSRF token
 */
export function generateCSRFToken(): string {
  return generateSecureToken(32);
}

/**
 * Get or create CSRF token from session
 */
export async function getCSRFToken(request: Request): Promise<string> {
  const session = await sessionStorage.getSession(
    request.headers.get("Cookie")
  );
  
  let token = session.get(CSRF_TOKEN_NAME);
  
  if (!token) {
    token = generateCSRFToken();
    session.set(CSRF_TOKEN_NAME, token);
  }
  
  return token;
}

/**
 * Validate CSRF token from request
 */
export async function validateCSRFToken(
  request: Request
): Promise<boolean> {
  // Skip CSRF validation for GET, HEAD, OPTIONS requests
  const method = request.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return true;
  }

  const session = await sessionStorage.getSession(
    request.headers.get("Cookie")
  );
  
  const sessionToken = session.get(CSRF_TOKEN_NAME);
  
  if (!sessionToken) {
    return false;
  }

  // Check header first
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  if (headerToken === sessionToken) {
    return true;
  }

  // Check form data
  if (request.headers.get("Content-Type")?.includes("application/x-www-form-urlencoded") ||
      request.headers.get("Content-Type")?.includes("multipart/form-data")) {
    try {
      const formData = await request.formData();
      const formToken = formData.get(CSRF_FORM_FIELD);
      if (formToken === sessionToken) {
        return true;
      }
    } catch {
      // Failed to parse form data
    }
  }

  // Check JSON body
  if (request.headers.get("Content-Type")?.includes("application/json")) {
    try {
      const body = await request.json();
      if (body[CSRF_FORM_FIELD] === sessionToken) {
        return true;
      }
    } catch {
      // Failed to parse JSON
    }
  }

  return false;
}

/**
 * Require CSRF token validation
 */
export async function requireCSRFToken(request: Request): Promise<void> {
  const isValid = await validateCSRFToken(request);
  
  if (!isValid) {
    throw json(
      { error: "Invalid CSRF token" },
      { status: 403 }
    );
  }
}

/**
 * Get CSRF token and headers for response
 */
export async function getCSRFHeaders(
  request: Request
): Promise<{ token: string; headers: Headers }> {
  const session = await sessionStorage.getSession(
    request.headers.get("Cookie")
  );
  
  let token = session.get(CSRF_TOKEN_NAME);
  
  if (!token) {
    token = generateCSRFToken();
    session.set(CSRF_TOKEN_NAME, token);
  }
  
  const headers = new Headers();
  headers.append(
    "Set-Cookie",
    await sessionStorage.commitSession(session)
  );
  
  return { token, headers };
}

/**
 * CSRF protected action wrapper
 */
export function csrfProtectedAction<T extends { request: Request }>(
  action: (args: T) => any
) {
  return async (args: T) => {
    await requireCSRFToken(args.request);
    return action(args);
  };
}

/**
 * Double Submit Cookie Pattern implementation
 */
export class DoubleSubmitCSRF {
  private cookieName = "__csrf";
  private headerName = "X-CSRF-Token";
  
  /**
   * Generate token and set cookie
   */
  async generateToken(): Promise<{ token: string; headers: Headers }> {
    const token = generateSecureToken(32);
    const headers = new Headers();
    
    // Set cookie with SameSite=Strict for CSRF protection
    headers.append(
      "Set-Cookie",
      `${this.cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; ${
        process.env["NODE_ENV"] === "production" ? "Secure; " : ""
      }Max-Age=${60 * 60 * 24}` // 24 hours
    );
    
    return { token, headers };
  }
  
  /**
   * Validate double submit cookie
   */
  async validate(request: Request): Promise<boolean> {
    // Skip for safe methods
    if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) {
      return true;
    }
    
    // Get cookie value
    const cookieHeader = request.headers.get("Cookie");
    if (!cookieHeader) return false;
    
    const cookies = Object.fromEntries(
      cookieHeader.split("; ").map(c => c.split("="))
    );
    const cookieToken = cookies[this.cookieName];
    
    if (!cookieToken) return false;
    
    // Get header value
    const headerToken = request.headers.get(this.headerName);
    
    // Compare tokens
    return cookieToken === headerToken;
  }
}