/**
 * Time-window parsing for the Doctors_Schedule `Available_Times` column and the
 * customer's requested datetime. Pure functions — no I/O, no LLM.
 *
 * The schedule is free-form: "09:30-12:30/04:30-09:30", "9-1/5-9", "5 to 9",
 * "8.30AM-01:00PM", "7AM-3PM". Times are written in 12-hour notation and most
 * entries omit the AM/PM marker. The convention observed across the sheet:
 *
 *   - morning session → starts 7–11, ends 12–1  ("09:30-12:30", "9-1")
 *   - evening session → starts 1–6, ends 8–11   ("04:30-09:30", "5-9")
 *
 * so a bare hour in 1–6 is read as PM (13:00–18:00) and 7–11 as AM. An explicit
 * `am`/`pm` marker always wins. This is a deliberate heuristic for this roster,
 * not a general time parser.
 */

export interface TimeWindow {
  /** minutes since midnight (0–1439) */
  start: number;
  /** minutes since midnight; may exceed 1440 for an overnight window */
  end: number;
}

/** Rows that carry no usable hours (a day off, "as per GP rota", etc.). */
const OFF_RE = /\b(off|vacation|unavailable|not available|closed|as per|reporting)\b/i;

function markerOf(marker: 'am' | 'pm' | ''): 'am' | 'pm' | '' {
  return marker;
}

/**
 * The first time of a window decides the session's half of the day:
 *   - explicit am/pm always wins
 *   - a bare 1–6 is an evening session (13:00–18:00)
 *   - a bare 7–11 is a morning session, 12 is noon
 */
function startMinutes(hour: number, minute: number, marker: 'am' | 'pm' | ''): number {
  let h = hour;
  if (marker === 'pm') {
    if (h < 12) h += 12;
  } else if (marker === 'am') {
    if (h === 12) h = 0;
  } else if (h >= 1 && h <= 6) {
    h += 12;
  }
  return h * 60 + minute;
}

/**
 * The second time of a window is always in the afternoon/evening of the same
 * session unless it says otherwise: "9-1" → 13:00, "04:30-09:30" → 21:30,
 * "09:00-12:00" → 12:00. A bare hour below 12 is read as PM; 12 stays noon and
 * 13+ stays 24-hour.
 */
function endMinutes(hour: number, minute: number, marker: 'am' | 'pm' | ''): number {
  let h = hour;
  if (marker === 'pm') {
    if (h < 12) h += 12;
  } else if (marker === 'am') {
    if (h === 12) h = 0;
  } else if (h >= 1 && h < 12) {
    h += 12;
  }
  return h * 60 + minute;
}

/**
 * Parse an `Available_Times` cell into one or more (start, end) windows.
 *
 * Returns `[]` when the cell has no hours (day off / "as per GP rota"). The
 * parser is intentionally forgiving: it grabs every `H[:MM][am|pm]` token and
 * pairs them up in order, which handles "/" and "&" separated sessions as well
 * as "5 to 9" and "9-1".
 */
export function parseTimeWindows(text: any): TimeWindow[] {
  const raw = String(text ?? '');
  if (!raw.trim() || OFF_RE.test(raw)) return [];

  // Dots are used as colons in places ("9.30-1.30").
  const normalized = raw.replace(/(\d)\.(\d{2})/g, '$1:$2');

  const tokens: { hour: number; minute: number; marker: 'am' | 'pm' | '' }[] = [];
  const re = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized))) {
    const hour = Number(m[1]);
    if (hour > 23) continue;
    tokens.push({
      hour,
      minute: Number(m[2] ?? 0),
      marker: markerOf((m[3] ?? '').toLowerCase() as 'am' | 'pm' | ''),
    });
  }

  const windows: TimeWindow[] = [];
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    const start = startMinutes(tokens[i].hour, tokens[i].minute, tokens[i].marker);
    const end = endMinutes(tokens[i + 1].hour, tokens[i + 1].minute, tokens[i + 1].marker);
    windows.push(end <= start ? { start, end: end + 1440 } : { start, end });
  }
  return windows;
}

/**
 * Parse a requested time — "7 PM", "19:00", "7:30pm", "7" — into minutes since
 * midnight, or `undefined` when no time is present.
 */
export function parseRequestedTime(text: any): number | undefined {
  const raw = String(text ?? '').trim();
  if (!raw) return undefined;
  const m = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return undefined;
  const hour = Number(m[1]);
  const minute = Number(m[2] ?? 0);
  if (hour > 23) return undefined;
  return startMinutes(hour, minute, markerOf((m[3] ?? '').toLowerCase() as 'am' | 'pm' | ''));
}

/** Is `minutes` inside any of the windows? */
export function isWithinWindow(minutes: number, windows: TimeWindow[]): boolean {
  return windows.some((w) => minutes >= w.start && minutes <= w.end);
}
