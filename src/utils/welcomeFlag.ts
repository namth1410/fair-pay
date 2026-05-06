import * as SecureStore from 'expo-secure-store';

const WELCOMED_KEY_PREFIX = 'fair_pay_welcomed_';

function buildKey(authId: string): string {
  return `${WELCOMED_KEY_PREFIX}${authId}`;
}

export async function hasWelcomed(authId: string): Promise<boolean> {
  const raw = await SecureStore.getItemAsync(buildKey(authId));
  return Boolean(raw);
}

export async function markWelcomed(authId: string): Promise<void> {
  await SecureStore.setItemAsync(buildKey(authId), '1');
}
