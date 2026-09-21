/**
 * Evaluador aritmético seguro (recursive descent). NO usa eval ni Function.
 * Soporta: + - * / % ^ , paréntesis, decimales, negativo unario y × ÷ − .
 * Devuelve null si la expresión es inválida o el resultado no es finito.
 */
export function safeEval(input: string): number | null {
  const src = input
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/,/g, ".")
    .replace(/\s+/g, "");

  if (!src || !/^[0-9+\-*/%^().]+$/.test(src)) return null;

  let pos = 0;

  const peek = () => src[pos];
  const eat = (ch: string) => (src[pos] === ch ? (pos++, true) : false);

  // expr := term (('+'|'-') term)*
  function expr(): number {
    let v = term();
    while (peek() === "+" || peek() === "-") {
      const op = src[pos++];
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }

  // term := power (('*'|'/'|'%') power)*
  function term(): number {
    let v = power();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const op = src[pos++];
      const r = power();
      if (op === "*") v *= r;
      else if (op === "/") v /= r;
      else v %= r;
    }
    return v;
  }

  // power := unary ('^' power)?   (asociativa a la derecha)
  function power(): number {
    const base = unary();
    if (eat("^")) return Math.pow(base, power());
    return base;
  }

  // unary := ('-'|'+') unary | primary
  function unary(): number {
    if (eat("-")) return -unary();
    if (eat("+")) return unary();
    return primary();
  }

  // primary := number | '(' expr ')'
  function primary(): number {
    if (eat("(")) {
      const v = expr();
      if (!eat(")")) throw new Error("paren");
      return v;
    }
    const start = pos;
    while (pos < src.length && /[0-9.]/.test(src[pos])) pos++;
    if (start === pos) throw new Error("num");
    const n = Number(src.slice(start, pos));
    if (Number.isNaN(n)) throw new Error("nan");
    return n;
  }

  try {
    const result = expr();
    if (pos !== src.length) return null;
    return Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

/** Formatea un número para mostrarlo: sin ruido de coma flotante, con separador de miles. */
export function formatResult(n: number): string {
  if (!Number.isFinite(n)) return "Error";
  const abs = Math.abs(n);
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-9)) return n.toExponential(6).replace(/\.?0+e/, "e");
  const rounded = Number(n.toPrecision(12));
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 10 }).format(rounded);
}
