import crypto from "crypto";
import { storage } from "./storage";
import type { WebChatLink, Workflow } from "@shared/schema";

// ---------------------------------------------------------------------------
// Phase 4A-3a-1 — web chat capability tokens.
//
// A link's plaintext token is shown to its owner exactly twice: on create and on
// rotate. Only the SHA-256 hex digest is persisted (web_chat_links.token_hash),
// so no stored value and no code path can reproduce the URL afterwards. GET
// returns metadata only; recovering the URL requires a rotate.
//
// Token shape matches the booking share-link precedent: 32 random bytes encoded
// as base64url (43 chars), hashed to 64 hex chars.
// ---------------------------------------------------------------------------

export function generateChatToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashChatToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Creates the row with isEnabled=false (the storage layer enforces the default).
// The caller decides whether to surface the returned plaintext; nothing here
// persists it.
export async function createWebChatLink(input: {
  userId: number;
  workflowId: number;
  label?: string | null;
  expiresAt?: Date | null;
}): Promise<{ link: WebChatLink; plaintext: string }> {
  const plaintext = generateChatToken();
  const link = await storage.createWebChatLink({
    userId: input.userId,
    workflowId: input.workflowId,
    tokenHash: hashChatToken(plaintext),
    label: input.label ?? null,
    expiresAt: input.expiresAt ?? null,
  });
  return { link, plaintext };
}

// Kill switch: this is the single enforcement point for the public surface.
// A missing/disabled/expired link is indistinguishable to the caller (all null),
// so the public endpoint in 4A-3a-2 has exactly one failure branch.
//
// Deliberately does NOT check workflow.isActive: the token is a capability
// (absent → 404), while a deactivated workflow is a service-availability state
// (→ 503) owned by requireChatSession. The workflow is returned so callers can
// make that distinction.
export async function resolveWebChatLinkByToken(
  token: string,
): Promise<{ link: WebChatLink; workflow: Workflow } | null> {
  if (!token || typeof token !== "string") return null;

  const link = await storage.getWebChatLinkByTokenHash(hashChatToken(token));
  if (!link) return null;

  if (!link.isEnabled) return null;
  if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) return null;

  const workflow = await storage.getWorkflow(link.workflowId);
  if (!workflow) return null;

  return { link, workflow };
}

// Replaces the token hash; the previous token stops resolving immediately.
// Returns null when the workflow has no link, or the link belongs to another user.
export async function rotateWebChatLink(
  workflowId: number,
  userId: number,
): Promise<{ link: WebChatLink; plaintext: string } | null> {
  const existing = await storage.getWebChatLinkForWorkflow(workflowId);
  if (!existing || existing.userId !== userId) return null;

  const plaintext = generateChatToken();
  const link = await storage.updateWebChatLink(existing.id, {
    tokenHash: hashChatToken(plaintext),
  });
  if (!link) return null;

  return { link, plaintext };
}

// Owner-facing projection. Built key-by-key from a whitelist so tokenHash,
// userId and workflowId can never leak — not even by spreading the row.
export type SerializedWebChatLink = {
  id: number;
  label: string | null;
  isEnabled: boolean;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function serializeWebChatLink(link: WebChatLink): SerializedWebChatLink {
  return {
    id: link.id,
    label: link.label,
    isEnabled: link.isEnabled,
    expiresAt: link.expiresAt,
    lastUsedAt: link.lastUsedAt,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  };
}
