// Single-source re-export of the calculation helpers in shared/calc-formula.ts.
// Kept as a thin barrel so existing "@/lib/calc" imports keep working unchanged.
export {
  computeCalcValue,
  OPERATION_SYMBOLS,
  resolveCalcValue,
  resolveCalcValues,
  rehydrateFormula,
  FormulaError,
} from "@shared/calc-formula";
export type { CalcOperation, CalcFieldDescriptor } from "@shared/calc-formula";
