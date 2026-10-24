import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import type { BookingShareLink, WebChatLink, WebChatSession, Workflow } from "@shared/schema";
import { storage } from "./storage";

const JWT_SECRET = process.env.SESSION_SECRET || "change_me_in_production";

// Isolated secret for share-session JWTs (derived from SESSION_SECRET so a
// compromise of one secret cannot forge the other, without a new env var).
const SHARE_SECRET = crypto
  .createHmac("sha256", JWT_SECRET)
  .update("omniplus:share-session")
  .digest("hex");

// Isolated secret for web chat session JWTs (Phase 4A-3a-1). Same derivation
// scheme as SHARE_SECRET, with a different label, so a compromise of one secret
// cannot forge the other and no new env var is required.
const CHAT_SECRET = crypto
  .createHmac("sha256", JWT_SECRET)
  .update("omniplus:chat-session")
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

// Web chat visitor session (Phase 4A-3a-1). Two distinct identities exist:
// a visitor session (this type) and a link owner (AuthRequest). They never mix.
export interface ChatRequest extends Request {
  chatSession?: {
    session: WebChatSession;
    link: WebChatLink;
    workflow: Workflow;
  };
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

// ---- Phase 4A-3a-1: web chat sessions ----
// Wired in 4A-3a-2 (public backend). Do not delete as dead code: the owner
// endpoints in 4A-3a-1 create links, but nothing authenticates a visitor yet.

export const CHAT_SESSION_COOKIE = "chat_session";

// Must match the JWT expiry in signChatSession (30d) — a cookie that outlives
// its token would produce a confusing 401 instead of a clean re-auth.
const CHAT_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface ChatSessionPayload {
  sessionId: number;
  linkId: number;
  workflowId: number;
  v: 1;
}

// Cookie options shared by the (future) auth endpoint and the clear helper so
// the flags can never drift apart.
// TODO(4A-3a-2): revisit `sameSite: "strict"` if the embeddable widget is served
// from a third-party origin — a strict cookie is not sent on cross-site requests.
export function chatSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: CHAT_SESSION_MAX_AGE_MS,
  };
}

export function clearChatSessionCookie(res: Response) {
  res.clearCookie(CHAT_SESSION_COOKIE, {
    path: "/",
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
  });
}

export function signChatSession(input: {
  sessionId: number;
  linkId: number;
  workflowId: number;
}): string {
  return jwt.sign({ ...input, v: 1 }, CHAT_SECRET, { expiresIn: "30d" });
}

export function verifyChatSession(token: string): ChatSessionPayload | null {
  try {
    const payload = jwt.verify(token, CHAT_SECRET) as Partial<ChatSessionPayload>;
    if (payload?.v !== 1) return null;
    if (
      !Number.isInteger(payload.sessionId) ||
      !Number.isInteger(payload.linkId) ||
      !Number.isInteger(payload.workflowId)
    ) {
      return null;
    }
    return payload as ChatSessionPayload;
  } catch {
    return null;
  }
}

// Validates the chat_session JWT and re-loads/re-checks session, link and
// workflow on every request, so disable/expire/delete/deactivate take effect
// immediately. Status codes: 401 auth/state, 404 link gone/disabled/expired,
// 503 workflow deactivated (distinct from 404 because the link is still valid).
export async function requireChatSession(req: ChatRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.[CHAT_SESSION_COOKIE];
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const payload = verifyChatSession(token);
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  const session = await storage.getWebChatSession(payload.sessionId);
  if (!session) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  // R2: BOTH checks. A session can be closed by setting either status or
  // endedAt; missing one would let a half-closed session keep talking.
  // `!= null` also catches an undefined column from a partial select.
  if (session.status !== "active" || session.endedAt != null) {
    clearChatSessionCookie(res);
    return res.status(401).json({ error: "Session ended" });
  }

  const link = await storage.getWebChatLink(payload.linkId);
  if (!link || !link.isEnabled) {
    return res.status(404).json({ error: "Chat unavailable" });
  }
  if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) {
    return res.status(404).json({ error: "Chat unavailable" });
  }

  const workflow = await storage.getWorkflow(payload.workflowId);
  if (!workflow || !workflow.isActive) {
    return res.status(503).json({ error: "Chat unavailable" });
  }

  // Defensive: the token, the session row and the link must all describe the
  // same workflow. Only reachable if a link is ever re-pointed at runtime.
  if (session.workflowId !== workflow.id || link.workflowId !== workflow.id) {
    clearChatSessionCookie(res);
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  req.chatSession = { session, link, workflow };
  next();
}
