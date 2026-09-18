// Independent deterministic streams. Reads and rejected commands never draw values.
export function randomStream(seed, salt) {
  let value = (seed ^ salt) >>> 0;
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let x = value;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
export const DIFFICULTIES = {
  easy: { minDuration: 8, maxDuration: 12, failureRate: 0.002, disruptionChance: 0.15 },
  medium: { minDuration: 12, maxDuration: 20, failureRate: 0.008, disruptionChance: 0.3 },
  hard: { minDuration: 18, maxDuration: 28, failureRate: 0.015, disruptionChance: 0.5 },
};
export function scenarioConfig(body) {
  const defaults = { mode: 'manual', seed: 42, difficulty: 'medium', automaticEvents: true, maxConcurrentDisruptions: 2 };
  const config = Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, body[key] === undefined ? value : body[key]]));
  if (!['manual', 'randomized'].includes(config.mode)) throw new Error('mode must be manual or randomized');
  if (!Number.isInteger(config.seed) || config.seed < 0 || config.seed > 4294967295) throw new Error('seed must be an integer from 0 to 4294967295');
  if (!Object.hasOwn(DIFFICULTIES, config.difficulty)) throw new Error('difficulty must be easy, medium or hard');
  if (typeof config.automaticEvents !== 'boolean') throw new Error('automaticEvents must be boolean');
  if (!Number.isInteger(config.maxConcurrentDisruptions) || config.maxConcurrentDisruptions < 1 || config.maxConcurrentDisruptions > 3) throw new Error('maxConcurrentDisruptions must be an integer from 1 to 3');
  return config;
}
