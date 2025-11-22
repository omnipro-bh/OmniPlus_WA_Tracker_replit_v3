import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";

const JWT_SECRET = process.env.SESSION_SECRET || "change_me_in_production";

export interface AuthRequest extends Request {
  userId?: number;
  user?: any;
  impersonatedUser?: any; // The user being impersonated (when impersonating)
  isImpersonating?: boolean;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(userId: number, impersonatedUserId?: number): string {
  const payload: { userId: number; impersonatedUserId?: number } = { userId };
  if (impersonatedUserId) {
    payload.impersonatedUserId = impersonatedUserId;
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): { userId: number; impersonatedUserId?: number } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: number; impersonatedUserId?: number };
  } catch {
    return null;
  }
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  // Always load the actual authenticated user (admin when impersonating)
  const authenticatedUser = await storage.getUser(payload.userId);
  
  if (!authenticatedUser) {
    return res.status(401).json({ error: "User not found" });
  }

  // Check if authenticated user is banned
  if (authenticatedUser.status === "banned") {
    res.clearCookie("token"); // Clear the authentication cookie
    return res.status(403).json({ 
      error: "Account suspended", 
      message: "Your account has been suspended. Please contact support for assistance." 
    });
  }

  // If impersonating, load the impersonated user separately
  if (payload.impersonatedUserId) {
    const impersonatedUser = await storage.getUser(payload.impersonatedUserId);
    
    if (!impersonatedUser) {
      // Impersonated user no longer exists - clear cookie and exit impersonation
      res.clearCookie("token");
      return res.status(401).json({ 
        error: "Impersonated user not found. Please log in again.",
      });
    }

    // Check if impersonated user is banned or deleted
    if (impersonatedUser.status === "banned") {
      // Impersonated user banned - clear cookie and exit impersonation
      res.clearCookie("token");
      return res.status(403).json({ 
        error: "Impersonated user account has been suspended. Please log in again.",
      });
    }

    // Set up impersonation context
    req.user = authenticatedUser; // Admin user (for authorization)
    req.userId = authenticatedUser.id; // Admin ID
    req.impersonatedUser = impersonatedUser; // User being impersonated
    req.isImpersonating = true;
  } else {
    // Normal authentication (not impersonating)
    req.user = authenticatedUser;
    req.userId = authenticatedUser.id;
  }
  
  next();
}

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}
