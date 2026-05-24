export const TAU = Math.PI * 2;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

export function magnitude3(vector) {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

export function hashSeed(seed) {
  const text = String(seed ?? 'orbit');
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function createRng(seed) {
  let state = hashSeed(seed);

  return function random() {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomBetween(rng, min, max) {
  return lerp(min, max, rng());
}

export function randomSign(rng, positiveChance = 0.5) {
  return rng() < positiveChance ? 1 : -1;
}

export function createSeed(prefix = 'orbit') {
  const time = Date.now().toString(36);
  const entropy = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${time}-${entropy}`;
}

export function roundForDisplay(value, digits = 2) {
  if (!Number.isFinite(value)) return '0';
  return Number(value).toFixed(digits);
}
