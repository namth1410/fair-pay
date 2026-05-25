import * as Crypto from 'expo-crypto';

type UUID = `${string}-${string}-${string}-${string}-${string}`;
const g = globalThis as unknown as { crypto?: { randomUUID?: () => UUID } };

const polyfill = (): UUID => Crypto.randomUUID() as UUID;

if (!g.crypto) {
  Object.defineProperty(g, 'crypto', {
    value: { randomUUID: polyfill },
    writable: true,
    configurable: true,
  });
} else if (typeof g.crypto.randomUUID !== 'function') {
  g.crypto.randomUUID = polyfill;
}
