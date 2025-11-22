import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";

const JWT_SECRET = process.env.SESSION_SECRET || "change_me_in_production";

export interface AuthRequest extends Request {
  userId?: number;
  user?: any;
  originalUserId?: number; // The actual logged-in admin's ID when impersonating
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

  // If impersonating, load the impersonated user but track the original admin
  const targetUserId = payload.impersonatedUserId || payload.userId;
  const user = await storage.getUser(targetUserId);
  
  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }

  // Check if user is banned
  if (user.status === "banned") {
    res.clearCookie("token"); // Clear the authentication cookie
    return res.status(403).json({ 
      error: "Account suspended", 
      message: "Your account has been suspended. Please contact support for assistance." 
    });
  }

  req.userId = user.id;
  req.user = user;
  
  // Track impersonation state
  if (payload.impersonatedUserId) {
    req.originalUserId = payload.userId;
    req.isImpersonating = true;
  }
  
  next();
}

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}
