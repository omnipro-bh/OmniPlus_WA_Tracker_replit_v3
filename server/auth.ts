import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import type { BookingShareLink } from "@shared/schema";
import { storage } from "./storage";

const JWT_SECRET = process.env.SESSION_SECRET || "change_me_in_production";

// Isolated secret for share-session JWTs (derived from SESSION_SECRET so a
// compromise of one secret cannot forge the other, without a new env var).
const SHARE_SECRET = crypto
  .createHmac("sha256", JWT_SECRET)
  .update("omniplus:share-session")
  .digest("hex");

export interface AuthRequest extends Request {
  userId?: number;
  user?: any;
  impersonatedUser?: any; // The user being impersonated (when impersonating)
  isImpersonating?: boolean;
}

// Public share-link session (Feature 3). Distinct from AuthRequest — a share
// session has no userId/impersonation, only the resolved link.
export interface ShareRequest extends Request {
  shareLink?: BookingShareLink;
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

// ---- Feature 3: share-link sessions ----

export function signShareSession(linkId: number, configVersion: number): string {
  return jwt.sign({ linkId, configVersion }, SHARE_SECRET, { expiresIn: "12h" });
}

export function verifyShareSession(token: string): { linkId: number; configVersion: number } | null {
  try {
    const payload = jwt.verify(token, SHARE_SECRET) as { linkId: number; configVersion: number };
    if (typeof payload.linkId !== "number" || typeof payload.configVersion !== "number") {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

// Validates the share_session JWT and re-loads/re-checks the link on every
// request (so disable/delete/expiry/password-change take effect immediately).
// Auth-state failures (missing/invalid cookie) → 401; link-state failures
// (deleted/disabled/expired/password-changed) → 404 with a uniform message.
export async function requireShareSession(req: ShareRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.share_session;
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const payload = verifyShareSession(token);
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  const link = await storage.getShareLink(payload.linkId);
  if (!link) {
    return res.status(404).json({ error: "Share link not found" });
  }
  if (!link.isEnabled) {
    return res.status(404).json({ error: "Share link not found" });
  }
  if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) {
    return res.status(404).json({ error: "Share link not found" });
  }
  if (link.configVersion !== payload.configVersion) {
    return res.status(404).json({ error: "Share link not found" });
  }

  req.shareLink = link;
  next();
}
