import type { ShareLinkConfig } from "@shared/schema";

// ---------------------------------------------------------------------------
// Feature 3G-5 — public share-link API client.
// Deliberately does NOT use the shared `queryClient.ts` apiRequest: that helper
// throws without exposing the HTTP status code, and the public page must
// distinguish 401 (re-auth) / 404 (link gone) / 429 (rate limit) / 400 / 409.
// ---------------------------------------------------------------------------

export interface ShareBooking {
  id: number;
  slotDate?: string;
  endDate?: string | null;
  startTime?: string;
  endTime?: string;
  endDayStartTime?: string | null;
  endDayEndTime?: string | null;
  status?: string;
  bookingLabel?: string | null;
  customerName?: string | null;
  customerPhone?: string;
  service?: string | null;
  provider?: string | null;
  customField1Label?: string | null;
  customField1Value?: string | null;
  customField2Label?: string | null;
  customField2Value?: string | null;
  customFieldValues?: Array<{ fieldId: number; value: string }>;
}

export interface ShareListResponse {
  bookings: ShareBooking[];
  count: number;
  page: number;
  pageSize: number;
  config: ShareLinkConfig;
  today: string;
  customFieldNames: Record<number, string>;
  customFieldTypes: Record<number, string>;
  customFieldOptions: Record<number, string[]>;
}

export class ShareApiError extends Error {
  status: number;
  retryAfter?: number;
  body?: unknown;

  constructor(status: number, message: string, retryAfter?: number, body?: unknown) {
    super(message);
    this.name = "ShareApiError";
    this.status = status;
    this.retryAfter = retryAfter;
    this.body = body;
  }
}

// Parse the Retry-After header as integer seconds (undefined if absent/invalid).
export function parseRetryAfter(res: Response): number | undefined {
  const raw = res.headers.get("Retry-After");
  if (!raw) return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

// Extract filename="..." from a Content-Disposition header.
export function parseContentDispositionFilename(res: Response): string | null {
  const cd = res.headers.get("Content-Disposition");
  if (!cd) return null;
  const m = /filename="?([^";]+)"?/i.exec(cd);
  return m ? m[1] : null;
}

// "Try again in ~X minutes" / "Try again shortly".
export function retryAfterMessage(retryAfter?: number): string {
  if (retryAfter == null) return "Try again shortly";
  const mins = Math.ceil(retryAfter / 60);
  if (mins < 1) return "Try again shortly";
  return `Try again in ~${mins} ${mins === 1 ? "minute" : "minutes"}`;
}

async function toShareApiError(res: Response): Promise<ShareApiError> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = { error: res.statusText };
  }
  const obj = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const msg = obj.error ?? obj.message ?? res.statusText ?? `Request failed (${res.status})`;
  return new ShareApiError(res.status, String(msg), parseRetryAfter(res), body);
}

function base(token: string): string {
  return `/api/public/share/${encodeURIComponent(token)}`;
}

export async function fetchBookings(token: string, page: number): Promise<ShareListResponse> {
  const res = await fetch(`${base(token)}/bookings?page=${page}&pageSize=50`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) throw await toShareApiError(res);
  return res.json();
}

export async function authenticate(token: string, password: string): Promise<void> {
  const res = await fetch(`${base(token)}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw await toShareApiError(res);
}

export async function logout(token: string): Promise<void> {
  const res = await fetch(`${base(token)}/logout`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw await toShareApiError(res);
}

export async function patchBooking(
  token: string,
  id: number,
  data: Record<string, unknown>,
): Promise<{ booking: ShareBooking }> {
  const res = await fetch(`${base(token)}/bookings/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await toShareApiError(res);
  return res.json();
}

export async function cancelBooking(token: string, id: number): Promise<{ booking: ShareBooking }> {
  const res = await fetch(`${base(token)}/bookings/${id}/cancel`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw await toShareApiError(res);
  return res.json();
}

export async function confirmBooking(token: string, id: number): Promise<{ booking: ShareBooking }> {
  const res = await fetch(`${base(token)}/bookings/${id}/confirm`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw await toShareApiError(res);
  return res.json();
}

export async function downloadCsv(token: string): Promise<void> {
  const res = await fetch(`${base(token)}/bookings.csv`, { credentials: "include" });
  if (!res.ok) throw await toShareApiError(res);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = parseContentDispositionFilename(res) || "bookings.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
