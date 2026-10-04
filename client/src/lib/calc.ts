export type CalcOperation = "add" | "subtract" | "multiply" | "divide";

export const OPERATION_SYMBOLS: Record<CalcOperation, string> = {
  add: "+",
  subtract: "−",
  multiply: "×",
  divide: "÷",
};

/** Compute a calculation field's value from raw string values of its two operands.
 *  Returns null when either operand is missing or non-numeric, or on divide-by-zero. */
export function computeCalcValue(
  op: CalcOperation | null | undefined,
  a: string | null | undefined,
  b: string | null | undefined,
): number | null {
  if (!op) return null;
  if (a == null || b == null || a.trim() === "" || b.trim() === "") return null;
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return null;
  switch (op) {
    case "add": return na + nb;
    case "subtract": return na - nb;
    case "multiply": return na * nb;
    case "divide": return nb === 0 ? null : na / nb;
    default: return null;
  }
}
