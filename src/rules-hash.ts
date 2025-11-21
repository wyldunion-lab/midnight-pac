import { blake2b } from '@noble/hashes/blake2b';

export type JSONLike =
  | null
  | boolean
  | number
  | string
  | JSONLike[]
  | { [k: string]: JSONLike };

function isPlainObject(x: any): x is Record<string, any> {
  return Object.prototype.toString.call(x) === '[object Object]';
}

// Remove undefined / non-finite numbers, keep array order
function sanitize(x: any): JSONLike {
  if (x === null) return null;
  const t = typeof x;
  if (t === 'boolean' || t === 'string') return x;
  if (t === 'number') {
    if (!Number.isFinite(x)) return null;
    return x;
  }
  if (Array.isArray(x)) return x.map(sanitize);
  if (isPlainObject(x)) {
    const out: Record<string, JSONLike> = {};
    for (const k of Object.keys(x).sort()) {
      const v = sanitize(x[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  return null;
}

export function canonicalize(obj: any): string {
  return JSON.stringify(sanitize(obj));
}

export function rulesHashHex(obj: any): string {
  const canon = canonicalize(obj);
  const digest = blake2b(new TextEncoder().encode(canon), { dkLen: 32 });
  return (
    '0x' +
    Array.from(digest)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  );
}
