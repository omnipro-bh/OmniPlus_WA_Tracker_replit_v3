// Hand-rolled formula parser + evaluator for calculation custom fields (Phase 3G-7).
// No runtime dependencies. No eval / new Function / dynamic code. Pure Math/Number,
// so it runs identically in Node (server) and the browser (client).

export type CalcOperation = "add" | "subtract" | "multiply" | "divide";
export type BinaryOp = "+" | "-" | "*" | "/";

// Resolved AST: field references carry a numeric id.
export type FormulaNode =
  | { kind: "number"; value: number; text: string }
  | { kind: "field"; fieldId: number }
  | { kind: "binary"; op: BinaryOp; left: FormulaNode; right: FormulaNode }
  | { kind: "unary"; op: "-"; operand: FormulaNode }
  | { kind: "call"; name: string; args: FormulaNode[] };

// Intermediate parse output: field references are still by name ([Name]) and/or id ({id}).
// `compileFormula` resolves these to a FormulaNode.
export type RawFormulaNode =
  | { kind: "number"; value: number; text: string }
  | { kind: "field"; name: string | null; id: number | null }
  | { kind: "binary"; op: BinaryOp; left: RawFormulaNode; right: RawFormulaNode }
  | { kind: "unary"; op: "-"; operand: RawFormulaNode }
  | { kind: "call"; name: string; args: RawFormulaNode[] };

export type Token =
  | { type: "number"; value: number; text: string }
  | { type: "fieldName"; name: string }
  | { type: "fieldId"; id: number }
  | { type: "op"; value: BinaryOp }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "comma" }
  | { type: "ident"; value: string }
  | { type: "eof" };

export interface FieldRef {
  id: number;
  name: string;
  fieldType: string;
}

export interface CalcFieldDescriptor {
  id: number;
  name: string;
  fieldType: string;
  calcFormula?: string | null;
  calcOperation?: CalcOperation | null;
  calcFieldAId?: number | null;
  calcFieldBId?: number | null;
}

export interface CompiledFormula {
  ast: FormulaNode;
  referencedIds: number[];
  canonical: string;
}

export const FORMULA_MAX_LENGTH = 1000;
export const FORMULA_MAX_NODES = 200;
export const FORMULA_MAX_DEPTH = 50;
export const FORMULA_FUNCTIONS = ["Round", "Abs", "Min", "Max", "Floor", "Ceil"] as const;

// Display symbols for the legacy 2-operand model (used in the Simple-mode UI).
export const OPERATION_SYMBOLS: Record<CalcOperation, string> = {
  add: "+",
  subtract: "−",
  multiply: "×",
  divide: "÷",
};

export class FormulaError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "FormulaError";
    this.code = code;
  }
}

// ---- tokenizer -------------------------------------------------------------

function isDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}
function isAlpha(c: string): boolean {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");
}
function isAlphaNum(c: string): boolean {
  return isAlpha(c) || isDigit(c);
}

function scanNumber(input: string, start: number): { value: number; text: string; end: number } {
  let j = start;
  const n = input.length;
  let dot = false;
  while (j < n) {
    const ch = input[j];
    if (isDigit(ch)) {
      j++;
      continue;
    }
    if (ch === "." && !dot) {
      dot = true;
      j++;
      continue;
    }
    break;
  }
  const text = input.slice(start, j);
  const value = Number(text);
  if (!Number.isFinite(value)) {
    throw new FormulaError("PARSE_ERROR", `Invalid number: ${text}`);
  }
  return { value, text, end: j };
}

// Linear scan only — no backtracking regex. Field references are read to their
// closing delimiter via a bounded indexOf, then validated character-by-character.
export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = input.length;
  while (i < n) {
    const c = input[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (isDigit(c) || (c === "." && isDigit(input[i + 1] ?? ""))) {
      const r = scanNumber(input, i);
      tokens.push({ type: "number", value: r.value, text: r.text });
      i = r.end;
      continue;
    }
    if (c === "[") {
      const end = input.indexOf("]", i);
      if (end === -1) throw new FormulaError("PARSE_ERROR", "Unterminated field reference: missing ']'");
      const name = input.slice(i + 1, end).trim();
      if (name.length === 0) throw new FormulaError("PARSE_ERROR", "Empty field reference");
      tokens.push({ type: "fieldName", name });
      i = end + 1;
      continue;
    }
    if (c === "{") {
      const end = input.indexOf("}", i);
      if (end === -1) throw new FormulaError("PARSE_ERROR", "Unterminated field reference: missing '}'");
      const text = input.slice(i + 1, end).trim();
      if (text.length === 0) throw new FormulaError("PARSE_ERROR", "Invalid field reference: expected {id}");
      for (let k = 0; k < text.length; k++) {
        if (!isDigit(text[k])) throw new FormulaError("PARSE_ERROR", "Invalid field reference: expected {id}");
      }
      tokens.push({ type: "fieldId", id: Number(text) });
      i = end + 1;
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/") {
      tokens.push({ type: "op", value: c });
      i++;
      continue;
    }
    if (c === "(") {
      tokens.push({ type: "lparen" });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ type: "rparen" });
      i++;
      continue;
    }
    if (c === ",") {
      tokens.push({ type: "comma" });
      i++;
      continue;
    }
    if (isAlpha(c)) {
      let j = i;
      while (j < n && isAlphaNum(input[j])) j++;
      tokens.push({ type: "ident", value: input.slice(i, j) });
      i = j;
      continue;
    }
    throw new FormulaError("PARSE_ERROR", `Unexpected character: "${c}"`);
  }
  tokens.push({ type: "eof" });
  return tokens;
}

// ---- parser (recursive descent) --------------------------------------------

function describe(t: Token): string {
  switch (t.type) {
    case "number": return t.text;
    case "fieldName": return `[${t.name}]`;
    case "fieldId": return `{${t.id}}`;
    case "op": return t.value;
    case "lparen": return "(";
    case "rparen": return ")";
    case "comma": return ",";
    case "ident": return t.value;
    case "eof": return "end of formula";
  }
}

class Parser {
  private pos = 0;
  private depth = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.pos];
  }
  private next(): Token {
    return this.tokens[this.pos++];
  }

  parse(): RawFormulaNode {
    const node = this.parseExpression();
    const t = this.peek();
    if (t.type !== "eof") {
      throw new FormulaError("PARSE_ERROR", `Unexpected input: ${describe(t)}`);
    }
    return node;
  }

  private parseExpression(): RawFormulaNode {
    let left = this.parseTerm();
    for (;;) {
      const t = this.peek();
      if (t.type === "op" && (t.value === "+" || t.value === "-")) {
        this.next();
        left = { kind: "binary", op: t.value, left, right: this.parseTerm() };
      } else {
        break;
      }
    }
    return left;
  }

  private parseTerm(): RawFormulaNode {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t.type === "op" && (t.value === "*" || t.value === "/")) {
        this.next();
        left = { kind: "binary", op: t.value, left, right: this.parseUnary() };
      } else {
        break;
      }
    }
    return left;
  }

  private parseUnary(): RawFormulaNode {
    this.depth++;
    if (this.depth > FORMULA_MAX_DEPTH) {
      throw new FormulaError("DEPTH_LIMIT", `Formula is too deeply nested (max ${FORMULA_MAX_DEPTH} levels)`);
    }
    try {
      const t = this.peek();
      if (t.type === "op" && t.value === "-") {
        this.next();
        return { kind: "unary", op: "-", operand: this.parseUnary() };
      }
      return this.parsePrimary();
    } finally {
      this.depth--;
    }
  }

  private parsePrimary(): RawFormulaNode {
    this.depth++;
    if (this.depth > FORMULA_MAX_DEPTH) {
      throw new FormulaError("DEPTH_LIMIT", `Formula is too deeply nested (max ${FORMULA_MAX_DEPTH} levels)`);
    }
    try {
      const t = this.next();
      switch (t.type) {
        case "number":
          return { kind: "number", value: t.value, text: t.text };
        case "fieldName":
          return { kind: "field", name: t.name, id: null };
        case "fieldId":
          return { kind: "field", name: null, id: t.id };
        case "lparen": {
          const inner = this.parseExpression();
          const close = this.next();
          if (close.type !== "rparen") throw new FormulaError("PARSE_ERROR", "Expected ')'");
          return inner;
        }
        case "ident":
          return this.parseCall(t.value);
        case "eof":
          throw new FormulaError("PARSE_ERROR", "Unexpected end of formula");
        default:
          throw new FormulaError("PARSE_ERROR", `Unexpected token: ${describe(t)}`);
      }
    } finally {
      this.depth--;
    }
  }

  private parseCall(name: string): RawFormulaNode {
    if (!(FORMULA_FUNCTIONS as readonly string[]).includes(name)) {
      throw new FormulaError("PARSE_ERROR", `Unknown function: ${name}`);
    }
    const open = this.next();
    if (open.type !== "lparen") throw new FormulaError("PARSE_ERROR", `Expected '(' after ${name}`);
    const args: RawFormulaNode[] = [];
    if (this.peek().type === "rparen") {
      this.next();
    } else {
      args.push(this.parseExpression());
      while (this.peek().type === "comma") {
        this.next();
        args.push(this.parseExpression());
      }
      const close = this.next();
      if (close.type !== "rparen") throw new FormulaError("PARSE_ERROR", "Expected ')'");
    }

    if (name === "Abs" || name === "Floor" || name === "Ceil") {
      if (args.length !== 1) throw new FormulaError("PARSE_ERROR", `${name} expects exactly 1 argument`);
    } else if (name === "Round") {
      if (args.length !== 2) throw new FormulaError("PARSE_ERROR", "Round expects 2 arguments: Round(value, decimals)");
      const dec = args[1];
      if (dec.kind !== "number" || !Number.isInteger(dec.value) || dec.value < 0 || dec.value > 15) {
        throw new FormulaError("PARSE_ERROR", "Round decimals must be a whole number from 0 to 15");
      }
    } else if (name === "Min" || name === "Max") {
      if (args.length < 2) throw new FormulaError("PARSE_ERROR", `${name} expects at least 2 arguments`);
    }
    return { kind: "call", name, args };
  }
}

function countNodes(node: RawFormulaNode): number {
  switch (node.kind) {
    case "number":
    case "field":
      return 1;
    case "unary":
      return 1 + countNodes(node.operand);
    case "binary":
      return 1 + countNodes(node.left) + countNodes(node.right);
    case "call":
      return 1 + node.args.reduce((s, a) => s + countNodes(a), 0);
  }
}

export function parseFormula(input: string): RawFormulaNode {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new FormulaError("PARSE_ERROR", "Formula is required");
  }
  if (input.length > FORMULA_MAX_LENGTH) {
    throw new FormulaError("SIZE_LIMIT", `Formula is too long (max ${FORMULA_MAX_LENGTH} characters)`);
  }
  const tokens = tokenize(input);
  const root = new Parser(tokens).parse();
  if (countNodes(root) > FORMULA_MAX_NODES) {
    throw new FormulaError("SIZE_LIMIT", `Formula is too complex (max ${FORMULA_MAX_NODES} parts)`);
  }
  return root;
}

// ---- compile (name→id resolution + type validation + canonicalization) ------

// Convert parse output into a resolved AST. Unresolved [Name] references become
// fieldId -1 (never matches a stored value) so eval degrades to null rather than throw.
function rawToResolved(node: RawFormulaNode): FormulaNode {
  switch (node.kind) {
    case "number":
      return { kind: "number", value: node.value, text: node.text };
    case "field":
      return { kind: "field", fieldId: node.id ?? -1 };
    case "unary":
      return { kind: "unary", op: node.op, operand: rawToResolved(node.operand) };
    case "binary":
      return { kind: "binary", op: node.op, left: rawToResolved(node.left), right: rawToResolved(node.right) };
    case "call":
      return { kind: "call", name: node.name, args: node.args.map(rawToResolved) };
  }
}

// Compile a stored canonical ({id}) formula into a resolved AST. Used at eval time,
// and exported so callers can pre-compile once per request (avoiding per-row re-parse).
export function compileCanonical(canonical: string): FormulaNode {
  return rawToResolved(parseFormula(canonical));
}

function serialize(node: FormulaNode): string {
  switch (node.kind) {
    case "number":
      return node.text;
    case "field":
      return `{${node.fieldId}}`;
    case "unary":
      return `-${serialize(node.operand)}`;
    case "binary":
      return `(${serialize(node.left)} ${node.op} ${serialize(node.right)})`;
    case "call":
      return `${node.name}(${node.args.map(serialize).join(", ")})`;
  }
}

// Resolve field names → ids, validate types (number + calculation only), and
// canonicalize to the {id} form for storage.
export function compileFormula(input: string, fields: FieldRef[]): CompiledFormula {
  const raw = parseFormula(input);
  const byName = new Map<string, FieldRef>();
  const byId = new Map<number, FieldRef>();
  for (const f of fields) {
    byName.set(f.name.toLowerCase(), f);
    byId.set(f.id, f);
  }
  const referenced = new Set<number>();

  function resolve(node: RawFormulaNode): FormulaNode {
    switch (node.kind) {
      case "number":
        return { kind: "number", value: node.value, text: node.text };
      case "field": {
        let ref: FieldRef | undefined;
        if (node.id != null) {
          ref = byId.get(node.id);
        } else if (node.name != null) {
          ref = byName.get(node.name.toLowerCase());
        }
        if (!ref) {
          const label = node.id != null ? `{${node.id}}` : node.name;
          throw new FormulaError("UNKNOWN_FIELD", `Unknown field: ${label}`);
        }
        if (ref.fieldType !== "number" && ref.fieldType !== "calculation") {
          throw new FormulaError("TYPE_MISMATCH", `Formulas can only reference number fields (${ref.name} is ${ref.fieldType})`);
        }
        referenced.add(ref.id);
        return { kind: "field", fieldId: ref.id };
      }
      case "unary":
        return { kind: "unary", op: node.op, operand: resolve(node.operand) };
      case "binary":
        return { kind: "binary", op: node.op, left: resolve(node.left), right: resolve(node.right) };
      case "call":
        return { kind: "call", name: node.name, args: node.args.map(resolve) };
    }
  }

  const ast = resolve(raw);
  const canonical = serialize(ast);
  return { ast, referencedIds: Array.from(referenced), canonical };
}

// ---- evaluation -------------------------------------------------------------

function toNumber(v: string | null | undefined): number | null {
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function roundHalf(x: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(x * f) / f;
}

function evaluateResolve(ast: FormulaNode, resolve: (id: number) => number | null): number | null {
  switch (ast.kind) {
    case "number":
      return ast.value;
    case "field":
      return resolve(ast.fieldId);
    case "unary": {
      const x = evaluateResolve(ast.operand, resolve);
      return x == null ? null : -x;
    }
    case "binary": {
      const l = evaluateResolve(ast.left, resolve);
      const r = evaluateResolve(ast.right, resolve);
      if (l == null || r == null) return null;
      switch (ast.op) {
        case "+": return l + r;
        case "-": return l - r;
        case "*": return l * r;
        case "/": return r === 0 ? null : l / r;
      }
      break;
    }
    case "call": {
      const argVals: number[] = [];
      for (const a of ast.args) {
        const v = evaluateResolve(a, resolve);
        if (v == null) return null; // null propagates through function args
        argVals.push(v);
      }
      switch (ast.name) {
        case "Abs": return Math.abs(argVals[0]);
        case "Floor": return Math.floor(argVals[0]);
        case "Ceil": return Math.ceil(argVals[0]);
        case "Round": return roundHalf(argVals[0], argVals[1]);
        case "Min": return Math.min.apply(null, argVals);
        case "Max": return Math.max.apply(null, argVals);
        default: return null;
      }
    }
  }
  return null;
}

export function evaluate(ast: FormulaNode, values: Map<number, string>): number | null {
  return evaluateResolve(ast, (id) => toNumber(values.get(id)));
}

// ---- legacy 2-operand helper (moved from the duplicated copies) -------------

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

// ---- cycle detection (save-time) --------------------------------------------

export function detectCalcCycle(
  fields: CalcFieldDescriptor[],
  candidateId: number | null,
  candidateFormula: string | null,
): boolean {
  const fieldById = new Map<number, CalcFieldDescriptor>();
  for (const f of fields) fieldById.set(f.id, f);
  const refs: FieldRef[] = fields.map((f) => ({ id: f.id, name: f.name, fieldType: f.fieldType }));

  const graph = new Map<number, number[]>();
  for (const f of fields) {
    if (f.fieldType !== "calculation") continue;
    if (f.id === candidateId) continue; // candidate's deps added below
    let deps: number[] = [];
    if (f.calcFormula) {
      try {
        deps = compileFormula(f.calcFormula, refs).referencedIds;
      } catch {
        deps = [];
      }
    }
    graph.set(f.id, deps.filter((id) => fieldById.get(id)?.fieldType === "calculation"));
  }
  if (candidateId != null && candidateFormula != null) {
    let deps: number[] = [];
    try {
      deps = compileFormula(candidateFormula, refs).referencedIds;
    } catch {
      deps = [];
    }
    graph.set(candidateId, deps.filter((id) => fieldById.get(id)?.fieldType === "calculation"));
  }

  // 0 = white, 1 = gray (in progress), 2 = black (done)
  const color = new Map<number, number>();
  const visit = (node: number): boolean => {
    color.set(node, 1);
    for (const next of graph.get(node) ?? []) {
      const c = color.get(next) ?? 0;
      if (c === 1) return true;
      if (c === 0 && visit(next)) return true;
    }
    color.set(node, 2);
    return false;
  };

  for (const node of Array.from(graph.keys())) {
    if ((color.get(node) ?? 0) === 0 && visit(node)) return true;
  }
  return false;
}

// ---- integration helpers ----------------------------------------------------

// Single field — formula first, legacy fallback. Does NOT resolve calc→calc
// chaining (a formula referencing another calc field evaluates that ref as a
// plain stored value, which is absent → null). Use resolveCalcValues for DAG.
export function resolveCalcValue(field: CalcFieldDescriptor, values: Map<number, string>): number | null {
  if (field.calcFormula) {
    try {
      return evaluate(compileCanonical(field.calcFormula), values);
    } catch {
      return null;
    }
  }
  return computeCalcValue(
    field.calcOperation,
    field.calcFieldAId != null ? values.get(field.calcFieldAId) : undefined,
    field.calcFieldBId != null ? values.get(field.calcFieldBId) : undefined,
  );
}

// Full calc DAG — memoized DFS with cycle guard, resolving calc→calc chaining.
// `compiled` is an optional pre-compiled AST cache keyed by calc field id:
//   - undefined (key absent) → parse the formula inline (backwards compatible)
//   - null                  → treat the field as uncomputable → null
//   - FormulaNode           → use the pre-compiled AST directly
export function resolveCalcValues(
  fields: CalcFieldDescriptor[],
  values: Map<number, string>,
  compiled?: Map<number, FormulaNode | null>,
): Map<number, number | null> {
  const result = new Map<number, number | null>();
  const fieldById = new Map<number, CalcFieldDescriptor>();
  for (const f of fields) fieldById.set(f.id, f);

  const calcFields = fields.filter((f) => f.fieldType === "calculation");
  const state = new Map<number, number>(); // 0 white, 1 gray, 2 black
  const computed = new Map<number, number | null>();

  const resolveOne = (field: CalcFieldDescriptor): number | null => {
    const st = state.get(field.id) ?? 0;
    if (st === 1) return null; // cycle guard
    if (st === 2) return computed.get(field.id) ?? null;

    state.set(field.id, 1);
    let out: number | null;
    if (field.calcFormula) {
      const cached = compiled?.get(field.id);
      let ast: FormulaNode | null;
      if (cached === undefined) {
        try {
          ast = compileCanonical(field.calcFormula);
        } catch {
          ast = null;
        }
      } else {
        ast = cached;
      }
      if (ast == null) {
        out = null;
      } else {
        try {
          out = evaluateResolve(ast, (id) => {
            const ref = fieldById.get(id);
            if (ref && ref.fieldType === "calculation") return resolveOne(ref);
            return toNumber(values.get(id));
          });
        } catch {
          out = null;
        }
      }
    } else {
      out = computeCalcValue(
        field.calcOperation,
        field.calcFieldAId != null ? values.get(field.calcFieldAId) : undefined,
        field.calcFieldBId != null ? values.get(field.calcFieldBId) : undefined,
      );
    }
    state.set(field.id, 2);
    computed.set(field.id, out);
    result.set(field.id, out);
    return out;
  };

  for (const cf of calcFields) resolveOne(cf);
  return result;
}

// Rehydrate a canonical {id} formula to [Name] form for display/editing.
// Linear single-pass replace (no catastrophic backtracking).
export function rehydrateFormula(canonical: string, nameById: Map<number, string>): string {
  return canonical.replace(/\{(\d+)\}/g, (_, idStr: string) => {
    const id = Number(idStr);
    const name = nameById.get(id);
    return name != null ? `[${name}]` : `{${idStr}}`;
  });
}
