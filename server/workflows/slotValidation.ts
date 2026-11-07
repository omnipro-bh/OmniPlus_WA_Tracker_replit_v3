/**
 * Phase 4d-2 increment 2 — deterministic slot validation.
 *
 * Architecture: the LLM EXTRACTS raw strings; this module DECIDES whether a
 * value is acceptable. Models are probabilistic and must never own business
 * rules ("is this a valid datetime?"). Every function here is pure: no I/O, no
 * LLM, no sheet access, so the same input always yields the same verdict.
 *
 * The `options` column remains the owner's control surface — it is consumed
 * here, not by the prompt's validity logic (the prompt may use it as an
 * extraction hint only).
 */

/** A value the LLM extracted but code validation rejected (trace only). */
export interface RejectedSlot {
  slot: string;
  value: string;
  reason: string;
}

export interface SlotValidationResult {
  valid: boolean;
  /** Value to store: trimmed, with option casing canonicalised for list/buttons. */
  value: string;
  /** Why it was rejected — diagnostics only, never sent to the customer. */
  reason?: string;
}

/**
 * Placeholders owners write in the `options` cell. They are documentation, not
 * choices: treating "(leave empty)" as an allowed value is what trapped a real
 * customer on Step_4. `none` is deliberately NOT filtered — it can be a real
 * option.
 */
const PARENTHESISED_PLACEHOLDER = /^\(\s*(leave empty|empty|optional|n\/a)\s*\)$/i;
const DASH_PLACEHOLDER = /^[-–—]$/;
const NA_PLACEHOLDER = /^n\/?a$/i;

export function isPlaceholderOption(value: string): boolean {
  const s = String(value ?? '').trim();
  if (!s) return true;
  return PARENTHESISED_PLACEHOLDER.test(s) || DASH_PLACEHOLDER.test(s) || NA_PLACEHOLDER.test(s);
}

/** Canonical input type. Missing/blank cells mean `text` (never a hard failure). */
export function normalizeInputType(expectedInput?: string | null): string {
  return String(expectedInput ?? '').trim().toLowerCase() || 'text';
}

/** Drop blanks and owner placeholders. Order is preserved (first match wins). */
export function normalizeOptions(options?: Array<string | null | undefined> | null): string[] {
  if (!Array.isArray(options)) return [];
  const out: string[] = [];
  for (const option of options) {
    if (typeof option !== 'string') continue;
    const trimmed = option.trim();
    if (!trimmed || isPlaceholderOption(trimmed)) continue;
    out.push(trimmed);
  }
  return out;
}

/** Parse a comma-separated `options` cell into a trimmed, placeholder-free array. */
export function parseOptions(value: any): string[] | undefined {
  if (typeof value !== 'string') return undefined;
  const options = normalizeOptions(value.split(','));
  return options.length > 0 ? options : undefined;
}

/**
 * Decide whether a raw extracted value is acceptable for a step.
 *
 *   text            → non-empty after trim
 *   list / buttons  → must match an option (case-insensitive); the sheet's
 *                     spelling is returned. No usable options ⇒ accept as text
 *                     (a config error must never trap the customer).
 *   number          → Number.isFinite(Number(value)); raw text is stored
 *   datetime        → non-empty (dayjs parsing is a follow-up increment)
 *   anything else   → non-empty
 */
export function validateSlotValue(
  value: unknown,
  expectedInput?: string | null,
  options?: Array<string | null | undefined> | null
): SlotValidationResult {
  const raw =
    typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value).trim();

  if (!raw) return { valid: false, value: '', reason: 'empty value' };

  switch (normalizeInputType(expectedInput)) {
    case 'list':
    case 'buttons': {
      const allowed = normalizeOptions(options);
      if (allowed.length === 0) return { valid: true, value: raw };
      const match = allowed.find((option) => option.toLowerCase() === raw.toLowerCase());
      return match
        ? { valid: true, value: match }
        : { valid: false, value: raw, reason: `"${raw}" is not one of: ${allowed.join(', ')}` };
    }

    case 'number':
      return Number.isFinite(Number(raw))
        ? { valid: true, value: raw }
        : { valid: false, value: raw, reason: `"${raw}" is not a number` };

    case 'datetime':
      return { valid: true, value: raw };

    case 'text':
    default:
      return { valid: true, value: raw };
  }
}
