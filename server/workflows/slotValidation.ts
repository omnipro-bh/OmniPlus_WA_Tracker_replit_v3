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
 * Whole-word containment match ("ENT doctor" → "ENT", "dental appointment" →
 * "Dental"). Deliberately word-bounded so "not sure" never matches "No" and
 * "yesterday" never matches "Yes". Returns the sheet's spelling.
 */
export function matchWholeWordOption(raw: string, allowed: string[]): string | undefined {
  const text = String(raw ?? '');
  if (!text) return undefined;
  for (const option of allowed) {
    const candidate = String(option ?? '').trim();
    if (!candidate) continue;
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i').test(text)) return option;
  }
  return undefined;
}

/**
 * Canonicalise a free-text value to the owner-declared option spelling when it
 * matches exactly or as a whole word. Used for slots that feed a `lookup_filter`:
 * the lookup (not the options list) decides validity, but "ENT doctor" should
 * still be stored as the sheet's "ENT" so `{department}` substitutes cleanly.
 */
export function canonicalizeOption(
  raw: string,
  options?: Array<string | null | undefined> | null
): string {
  const allowed = normalizeOptions(options);
  if (allowed.length === 0) return raw;
  return (
    allowed.find((option) => option.toLowerCase() === raw.toLowerCase()) ??
    matchWholeWordOption(raw, allowed) ??
    raw
  );
}

// ── Owner-declared format validation (`validation` column) ─────────────────

/**
 * The `validation` column is the owner's second control surface, next to
 * `options`: `options` says WHICH values are allowed, `validation` says what
 * SHAPE the answer must have. Owners pick one of these from the Scenario
 * Builder; any other non-empty cell is treated as a custom regular expression.
 */
export type ValidationKind = 'text' | 'phone' | 'email' | 'number' | 'date' | 'regex';

export interface ValidationSpec {
  kind: ValidationKind;
  /** The raw cell value — used in the rejection reason/trace. */
  raw: string;
  /** Compiled custom pattern (`kind === 'regex'` only). */
  regex?: RegExp;
}

/** Named formats the UI offers; `text` and the blanks mean "no format gate". */
const NAMED_VALIDATIONS: Record<string, ValidationKind> = {
  text: 'text',
  phone: 'phone',
  email: 'email',
  number: 'number',
  date: 'date',
};

/**
 * Parse the `validation` cell.
 *
 * Blank / `none` / `text` → `undefined` (no format gate: non-empty is already
 * enforced). A named format → that kind. Anything else → a case-insensitive
 * custom regex. An uncompilable regex is a configuration error and is DROPPED:
 * a typo in the sheet must never trap the customer.
 */
export function parseValidation(value: any): ValidationSpec | undefined {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (lower === 'none' || lower === '-' || lower === 'no') return undefined;
  const named = NAMED_VALIDATIONS[lower];
  if (named) return named === 'text' ? undefined : { kind: named, raw: lower };
  try {
    return { kind: 'regex', raw, regex: new RegExp(raw, 'i') };
  } catch {
    return undefined;
  }
}

const PHONE_RE = /^\+?[0-9]{7,15}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

function matchesFormat(value: string, spec: ValidationSpec): boolean {
  switch (spec.kind) {
    case 'phone':
      // Spaces/dashes/parentheses are formatting, not digits: "+973 3900 1234".
      return PHONE_RE.test(value.replace(/[\s().-]/g, ''));
    case 'email':
      return EMAIL_RE.test(value);
    case 'number':
      return !Number.isNaN(Number(value));
    case 'date':
      return !Number.isNaN(Date.parse(value));
    case 'regex':
      return spec.regex ? spec.regex.test(value) : true;
    default:
      return true;
  }
}

/** Fields of a multi-part answer ("Ali, 39001234, a@b.com, CPR 880011223"). */
function splitFields(value: string): string[] {
  return value
    .split(/[,;\n]+/)
    .map((field) => field.trim())
    .filter(Boolean);
}

/**
 * Does `value` satisfy the owner's format?
 *
 * The whole value is checked first; when it fails, each comma/semicolon/newline
 * separated field is checked too. That keeps a step that collects several
 * details in one answer usable ("customer_details" + `phone` rejects "yes" but
 * accepts a reply that contains a phone number).
 */
export function valueMatchesFormat(value: string, spec: ValidationSpec): boolean {
  if (matchesFormat(value, spec)) return true;
  return splitFields(value).some((field) => matchesFormat(field, spec));
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
 *
 * `validationType` (the step's `validation` cell) is applied on top of the
 * shape check: a value that is a valid shape but the wrong format (a "yes" in a
 * phone slot) is rejected with `Invalid format for <validationType>`.
 */
export function validateSlotValue(
  value: unknown,
  expectedInput?: string | null,
  options?: Array<string | null | undefined> | null,
  validationType?: string | null
): SlotValidationResult {
  const raw =
    typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value).trim();

  if (!raw) return { valid: false, value: '', reason: 'empty value' };

  const spec = parseValidation(validationType);
  const withFormat = (result: SlotValidationResult): SlotValidationResult => {
    if (!result.valid || !spec) return result;
    return valueMatchesFormat(result.value, spec)
      ? result
      : { valid: false, value: result.value, reason: `Invalid format for ${spec.raw}` };
  };

  switch (normalizeInputType(expectedInput)) {
    case 'list':
    case 'buttons': {
      const allowed = normalizeOptions(options);
      if (allowed.length === 0) return withFormat({ valid: true, value: raw });
      const match =
        allowed.find((option) => option.toLowerCase() === raw.toLowerCase()) ??
        matchWholeWordOption(raw, allowed);
      return withFormat(
        match
          ? { valid: true, value: match }
          : { valid: false, value: raw, reason: `"${raw}" is not one of: ${allowed.join(', ')}` }
      );
    }

    case 'number':
      return withFormat(
        Number.isFinite(Number(raw))
          ? { valid: true, value: raw }
          : { valid: false, value: raw, reason: `"${raw}" is not a number` }
      );

    case 'datetime':
      return withFormat({ valid: true, value: raw });

    case 'text':
    default:
      return withFormat({ valid: true, value: raw });
  }
}
