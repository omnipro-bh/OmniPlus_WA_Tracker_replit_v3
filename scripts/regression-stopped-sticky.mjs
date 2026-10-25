#!/usr/bin/env node
/**
 * Regression test — HANDOFF follow-up #4: the `stopped` state must be sticky.
 *
 * Bug (fixed in the same change as this script): a booking node reached while
 * `web_chat_booking_enabled` is OFF made `flowRunner` answer `stopped` in the
 * POST body only — it never persisted the stop — so the very next poll/GET
 * re-derived `awaiting_input` from the still-persisted pre-stop cursor, and the
 * visitor was trapped in a "click → nothing → click again" loop.
 *
 * There is no test runner in this project and `server/workflows/chat-tick.ts`
 * cannot be imported without a database (server/db.ts throws on a missing
 * DATABASE_URL), so this asserts the contract at the HTTP layer the browser
 * actually uses — the same evidence path the 4A-3 follow-up used.
 *
 * Preconditions
 *   - A reachable server (production or local).
 *   - Workflow 34 (or whichever workflow the token belongs to) has
 *     `web_chat_booking_enabled` = false, so a booking node stops.
 *   - A share-link token for that workflow.
 *
 * Usage
 *   BASE_URL=https://wt.omniplus-bh.com \
 *   CHAT_TOKEN=<share token> \
 *   BOOKING_BUTTON_ID=row_book_en \
 *   node scripts/regression-stopped-sticky.mjs
 *
 * Exit codes: 0 = pass, 1 = regression, 2 = precondition not met.
 *
 * The session it creates is ended at the end; it also clicks Restart in the
 * middle (which is what a stuck visitor would do), so no conversation is left
 * in the stopped state.
 */

const BASE_URL = (process.env.BASE_URL || "https://wt.omniplus-bh.com").replace(/\/+$/, "");
const CHAT_TOKEN = process.env.CHAT_TOKEN;
const BOOKING_BUTTON_ID = process.env.BOOKING_BUTTON_ID || "row_book_en";

let failures = 0;

function log(ok, label, detail) {
  const tag = ok === null ? "INFO" : ok ? "PASS" : "FAIL";
  if (ok === false) failures += 1;
  console.log(`${tag}  ${label}${detail === undefined ? "" : `  ${detail}`}`);
}

/** Minimal cookie jar — fetch does not carry cookies, the visitor's browser does. */
const jar = new Map();

function putCookies(res) {
  const raw =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie")].filter(Boolean);
  for (const line of raw) {
    for (const part of String(line).split(/,(?=[^;=]+=)/)) {
      const pair = part.split(";")[0].trim();
      const eq = pair.indexOf("=");
      if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  }
}

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function call(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(jar.size ? { cookie: cookieHeader() } : {}),
      "user-agent": "omniplus-stopped-sticky-regression/1.0",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  putCookies(res);

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error page */
  }
  return { status: res.status, json, text };
}

function clientMsgId() {
  return `reg_stop_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function main() {
  if (!CHAT_TOKEN) {
    console.error("Missing CHAT_TOKEN (the share-link token for the workflow).");
    process.exit(2);
  }

  console.log(`base:   ${BASE_URL}`);
  console.log(`button: ${BOOKING_BUTTON_ID}\n`);

  // ── 1. bootstrap ────────────────────────────────────────────────────────
  const boot = await call("POST", `/api/public/chat/${encodeURIComponent(CHAT_TOKEN)}/session`, {});
  if (boot.status !== 200 && boot.status !== 201) {
    log(false, "bootstrap", `HTTP ${boot.status} ${boot.text.slice(0, 120)}`);
    process.exit(1);
  }
  log(true, "bootstrap", `HTTP ${boot.status} status=${boot.json?.status} session=${boot.json?.sessionId}`);

  if (boot.json?.status !== "awaiting_input") {
    log(false, "bootstrap should land on the interactive entry node", `status=${boot.json?.status}`);
  }

  // ── 2. click the booking entry (flag OFF ⇒ runner stops) ────────────────
  const clickPath = "/api/public/chat/session/message";
  const click = await call("POST", clickPath, {
    type: "button",
    buttonId: BOOKING_BUTTON_ID,
    clientMsgId: clientMsgId(),
  });

  if (click.status !== 200) {
    log(false, "booking click", `HTTP ${click.status} ${click.text.slice(0, 160)}`);
    process.exit(1);
  }

  if (click.json?.status === "awaiting_input") {
    // The booking handler ran: either the flag is ON, or the button routes to a
    // normal interactive node. Either way this scenario cannot be exercised.
    log(
      false,
      "precondition: expected the booking node to STOP",
      `status=awaiting_input — is web_chat_booking_enabled ON for this workflow?`
    );
    await call("POST", "/api/public/chat/session/end", {});
    process.exit(2);
  }

  log(
    click.json?.status === "stopped" && click.json?.awaiting == null,
    "POST response is stopped",
    `status=${click.json?.status} awaiting=${JSON.stringify(click.json?.awaiting)}`
  );

  // ── 3. THE REGRESSION: the stop must survive the next read ─────────────
  const read = await call("GET", "/api/public/chat/session");
  log(
    read.status === 200,
    "GET /session reachable",
    `HTTP ${read.status}`
  );
  log(
    read.json?.status === "stopped" && read.json?.awaiting == null,
    "GET /session keeps the stopped state (pre-fix: awaiting_input)",
    `status=${read.json?.status} awaiting=${JSON.stringify(read.json?.awaiting)}`
  );

  // ── 4. …and the poll, which is what the client actually calls ──────────
  const poll = await call("GET", "/api/public/chat/session/messages?sinceId=0&limit=50");
  log(poll.status === 200, "poll reachable", `HTTP ${poll.status}`);
  log(
    poll.json?.status === "stopped" && poll.json?.awaiting == null,
    "poll keeps the stopped state (pre-fix: awaiting_input)",
    `status=${poll.json?.status} awaiting=${JSON.stringify(poll.json?.awaiting)}`
  );

  // ── 5. the stuck state must stay recoverable ───────────────────────────
  const restart = await call("POST", "/api/public/chat/session/restart", {});
  log(
    restart.status === 200 && restart.json?.status !== "stopped",
    "restart clears the stop marker",
    `HTTP ${restart.status} status=${restart.json?.status}`
  );

  const after = await call("GET", "/api/public/chat/session");
  log(
    after.json?.status === "awaiting_input" && after.json?.awaiting?.kind === "button",
    "after restart the main menu is interactive again",
    `status=${after.json?.status} awaiting=${JSON.stringify(after.json?.awaiting)}`
  );

  // ── 6. cleanup ─────────────────────────────────────────────────────────
  await call("POST", "/api/public/chat/session/end", {});
  log(true, "session ended");

  console.log(`\n${failures === 0 ? "PASS" : `FAIL (${failures})`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
