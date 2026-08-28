/**
 * vae-foundation — ULID identity (D11.2).
 *
 * Universally Unique Lexicographically Sortable Identifiers:
 * 48-bit big-endian millisecond timestamp + 80 bits of randomness,
 * Crockford base32 encoded (26 chars). Monotonic within a process:
 * identifiers created in the same millisecond increment the random
 * part, preserving sort order (journal stitching depends on this).
 */

const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ" as const;
const TIME_LEN = 10;
const RAND_LEN = 16;
const DECODE = new Map<string, number>(
  [...ENCODING].map((c, i) => [c, i] as const).concat([["O", 0], ["I", 1], ["L", 1]] as const),
);

/** A ULID string (26 chars, Crockford base32). Branded for strict typing. */
export type Ulid = string & { readonly __brand: "Ulid" };

let lastTime = -1;
let lastRand: bigint = 0n;

function encodeTime(time: number): string {
  let out = "";
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    out = ENCODING[time % 32]! + out;
    time = Math.floor(time / 32);
  }
  return out;
}

function encodeRand(rand: bigint): string {
  let out = "";
  for (let i = 0; i < RAND_LEN; i++) {
    out = ENCODING[Number(rand & 31n)]! + out;
    rand >>= 5n;
  }
  return out;
}

/** Randomness source (overridable for determinism in tests). */
export type RandomSource = () => Uint8Array;

export const systemRandom: RandomSource = () => crypto.getRandomValues(new Uint8Array(10));

function randFromBytes(bytes: Uint8Array): bigint {
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return v & ((1n << 80n) - 1n);
}

/**
 * Generate a ULID at `time` (ms). Monotonic within the process: a call
 * in the same millisecond as the previous call returns a strictly
 * greater value. Pass a fixed random source for reproducible tests.
 */
export function ulid(time: number, random: RandomSource = systemRandom): Ulid {
  const t = Math.max(0, Math.floor(time));
  let rand = randFromBytes(random());
  if (t === lastTime) {
    // Monotonic: strictly increment within the same millisecond.
    if (rand <= lastRand) rand = lastRand + 1n;
    if (rand >= 1n << 80n) {
      // 80 bits exhausted within one ms — practically impossible; fail loudly
      // rather than emit a non-monotonic id (deterministic scheduling, D11.2).
      throw new Error("ULID randomness overflow within a single millisecond");
    }
  }
  lastTime = t;
  lastRand = rand;
  return (encodeTime(t) + encodeRand(rand)) as Ulid;
}

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** True when `value` is a well-formed ULID. */
export function isUlid(value: string): value is Ulid {
  return ULID_RE.test(value);
}

/** Decode the 48-bit millisecond timestamp carried by a ULID. */
export function ulidTime(value: Ulid): number {
  let t = 0;
  for (let i = 0; i < TIME_LEN; i++) {
    const d = DECODE.get(value[i]!);
    if (d === undefined) throw new Error(`invalid ULID character: ${value[i]}`);
    t = t * 32 + d;
  }
  return t;
}

/** Compare two ULIDs lexicographically (== chronological). */
export function compareUlid(a: Ulid, b: Ulid): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
