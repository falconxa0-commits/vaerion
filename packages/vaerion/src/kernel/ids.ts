/**
 * Vaerion kernel — identity: ULID + Canonical Resource Names (CRN).
 *
 * Law: every entity carries a ULID; monotonic sortability enables journal
 * stitching and cursor pagination identical on every surface (Blueprint §5.4).
 * IDs are injectable via the IdGen port so tests are deterministic.
 */

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ" as const;
const CROCKFORD_DECODE: Readonly<Record<string, number>> = (() => {
  const map: Record<string, number> = {};
  for (let i = 0; i < CROCKFORD.length; i++) {
    const ch = CROCKFORD[i] as string;
    map[ch] = i;
    map[ch.toLowerCase()] = i;
  }
  // tolerated aliases per ULID spec
  map["O"] = 0; map["o"] = 0;
  map["I"] = 1; map["i"] = 1;
  map["L"] = 1; map["l"] = 1;
  return map;
})();

export type Ulid = string;

/** Encode a 48-bit millisecond timestamp + 80-bit randomness as a 26-char ULID. */
export function encodeUlid(timeMs: number, randomness80Bit: Uint8Array): Ulid {
  if (!Number.isInteger(timeMs) || timeMs < 0 || timeMs > 0xFFFFFFFFFFFF) {
    throw new Error(`ulid: timestamp out of range: ${timeMs}`);
  }
  if (randomness80Bit.length !== 10) throw new Error("ulid: randomness must be 10 bytes");
  let out = "";
  // 10 chars of time (48 bits, 5 bits per char, most significant first).
  let t = timeMs;
  for (let i = 9; i >= 0; i--) {
    out = CROCKFORD[t % 32] + out;
    t = Math.floor(t / 32);
  }
  // 16 chars of randomness (80 bits, 5 bits per char — Crockford base32).
  let bits = 0;
  let bitsLen = 0;
  let byteIdx = 0;
  for (let i = 0; i < 16; i++) {
    while (bitsLen < 5) {
      bits = (bits << 8) | (byteIdx < 10 ? (randomness80Bit[byteIdx++] as number) : 0);
      bitsLen += 8;
    }
    bitsLen -= 5;
    out += CROCKFORD[(bits >>> bitsLen) & 0x1f];
  }
  return out;
}

/** Decode a ULID into { timeMs, randomness }. Tolerates Crockford aliases. */
export function decodeUlid(ulid: string): { timeMs: number; randomness: Uint8Array } {
  if (!/^[0-9A-HJKMNP-TV-Za-hjkmnp-tvz]{26}$/.test(ulid)) {
    throw new Error(`ulid: invalid: ${ulid}`);
  }
  let timeMs = 0;
  for (let i = 0; i < 10; i++) {
    timeMs = timeMs * 32 + (CROCKFORD_DECODE[ulid[i] as string] as number);
  }
  let bits = 0;
  let bitsLen = 0;
  const randomness = new Uint8Array(10);
  let byteIdx = 0;
  for (let i = 10; i < 26; i++) {
    bits = ((bits << 5) | (CROCKFORD_DECODE[ulid[i] as string] as number)) & 0xffffffff;
    bitsLen += 5;
    while (bitsLen >= 8 && byteIdx < 10) {
      bitsLen -= 8;
      randomness[byteIdx++] = (bits >>> bitsLen) & 0xff;
    }
  }
  return { timeMs, randomness };
}

/** Canonical Resource Name: `crn_<namespace>_<ulid>`. */
export type Crn = string;
/** Full Crockford alphabet (I, L, O, U excluded). */
export const ULID_CHARS = "0123456789ABCDEFGHJKMNPQRSTVWXYZabcdefghjkmnpqrstvwxyz";
const CRN_RE = new RegExp(`^crn_([a-z][a-z0-9_]{1,30})_([${ULID_CHARS}]{26})$`);
export function crn(namespace: string, id: Ulid): Crn {
  if (!/^[a-z][a-z0-9_]{1,30}$/.test(namespace)) throw new Error(`crn: bad namespace: ${namespace}`);
  return `crn_${namespace}_${id}`;
}
export function parseCrn(value: string): { namespace: string; ulid: Ulid } | null {
  const m = CRN_RE.exec(value);
  return m ? { namespace: m[1] as string, ulid: m[2] as string } : null;
}

/** Identity port: the only sanctioned way to mint ids. */
export interface IdGen {
  next(): Ulid;
}

/** Deterministic IdGen for tests/replay — ULIDs derived from an injected RNG. */
export class SeededIdGen implements IdGen {
  private last: Ulid | null = null;
  constructor(
    private readonly timeMs: () => number,
    private readonly rng: { nextBytes(n: number): Uint8Array },
  ) {}

  next(): Ulid {
    const t = this.timeMs();
    const rand = this.rng.nextBytes(10);
    let id = encodeUlid(t, rand);
    // Enforce monotonicity within the same millisecond tick (ULID monotonic rule).
    if (this.last !== null && id <= this.last) {
      const dec = decodeUlid(this.last as string);
      const inc = new Uint8Array(dec.randomness);
      for (let i = inc.length - 1; i >= 0; i--) {
        if ((inc[i] as number) === 0xff) { inc[i] = 0; continue; }
        inc[i] = (inc[i] as number) + 1;
        break;
      }
      id = encodeUlid(dec.timeMs, inc);
    }
    this.last = id;
    return id;
  }
}

/** Production IdGen — real clock + cryptographic randomness (the only ambient source, behind this port). */
export class SystemIdGen implements IdGen {
  private readonly rng = new (class {
    private buf = new Uint8Array(0);
    private idx = 0;
    refill(): void {
      crypto.getRandomValues(this.buf = new Uint8Array(64));
      this.idx = 0;
    }
    byte(): number {
      if (this.idx >= this.buf.length) this.refill();
      return this.buf[this.idx++] as number;
    }
  })();
  private last: Ulid | null = null;

  next(): Ulid {
    const now = Date.now();
    const rand = new Uint8Array(10);
    for (let i = 0; i < 10; i++) rand[i] = this.rng.byte();
    let id = encodeUlid(now, rand);
    if (this.last !== null && id <= this.last) {
      const dec = decodeUlid(this.last as string);
      const inc = new Uint8Array(dec.randomness);
      for (let i = inc.length - 1; i >= 0; i--) {
        if ((inc[i] as number) === 0xff) { inc[i] = 0; continue; }
        inc[i] = (inc[i] as number) + 1;
        break;
      }
      id = encodeUlid(dec.timeMs, inc);
    }
    this.last = id;
    return id;
  }
}
