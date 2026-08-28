/**
 * vae-foundation — Money as decimal strings (D8.3).
 *
 * Money is never a float. Amounts are arbitrary-precision decimal
 * strings; arithmetic is integer-scaled. Used by receipts, budgets,
 * and gateway pricing (D13.3).
 */

const MONEY_RE = /^-?\d+(\.\d+)?$/;

export class MoneyFormatError extends Error {}

/** Validate a decimal-string amount; throws on violation. */
export function assertMoney(value: string): void {
  if (!MONEY_RE.test(value)) {
    throw new MoneyFormatError(`money must be a decimal string, got ${JSON.stringify(value)} (D8.3)`);
  }
}

/** Number of decimal places in a decimal string. */
function scale(value: string): number {
  const dot = value.indexOf(".");
  return dot === -1 ? 0 : value.length - dot - 1;
}

function toScaledInt(value: string, scaleDigits: number): bigint {
  assertMoney(value);
  const neg = value.startsWith("-");
  const body = neg ? value.slice(1) : value;
  const [int, frac = ""] = body.split(".");
  const fracPadded = frac.padEnd(scaleDigits, "0");
  const v = BigInt(int! + fracPadded);
  return neg ? -v : v;
}

function fromScaledInt(v: bigint, scaleDigits: number): string {
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const s = abs.toString().padStart(scaleDigits + 1, "0");
  const intPart = s.slice(0, s.length - scaleDigits);
  const fracPart = s.slice(s.length - scaleDigits);
  const out = scaleDigits === 0 ? intPart : `${intPart}.${fracPart}`;
  return neg && abs !== 0n ? `-${out}` : out;
}

/** Add two decimal-string amounts; result keeps the finer scale. */
export function addMoney(a: string, b: string): string {
  const scaleDigits = Math.max(scale(a), scale(b));
  return fromScaledInt(toScaledInt(a, scaleDigits) + toScaledInt(b, scaleDigits), scaleDigits);
}

/** Compare two decimal-string amounts: -1 | 0 | 1. */
export function compareMoney(a: string, b: string): number {
  const scaleDigits = Math.max(scale(a), scale(b));
  const ia = toScaledInt(a, scaleDigits);
  const ib = toScaledInt(b, scaleDigits);
  return ia < ib ? -1 : ia > ib ? 1 : 0;
}

export const ZERO_MONEY = "0.0000";
