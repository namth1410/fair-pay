// SyncBridge — wire syncEngine.run() vào 3 trigger points:
//   1. Session active (login thành công hoặc bootstrap có session)
//   2. NetInfo offline → online transition
//   3. AppState background → active transition
//
// Mount as sibling của <Slot /> trong _layout. No UI render.

import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useAppStore } from '../stores/app.store';
import { useAuthStore } from '../stores/auth.store';
import { run as runSync } from './syncEngine';

export function SyncBridge() {
  const sessionUserId = useAuthStore((s) => s.session?.user.id);
  const isOnline = useAppStore((s) => s.isOnline);
  const prevOnlineRef = useRef(isOnline);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Trigger pull khi session active (kể cả ở cold-start sau khi auth restore)
  useEffect(() => {
    if (!sessionUserId) return;
    // Fire-and-forget — error đã được safe() trong pullWorker swallow
    void runSync().catch((err) => {
      if (__DEV__) console.warn('[SyncBridge] initial pull failed', err);
    });
  }, [sessionUserId]);

  // Trigger pull khi NetInfo transition offline → online
  useEffect(() => {
    if (!prevOnlineRef.current && isOnline && sessionUserId) {
      void runSync().catch((err) => {
        if (__DEV__) console.warn('[SyncBridge] post-online pull failed', err);
      });
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline, sessionUserId]);

  // Trigger pull khi AppState background → active
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (
        (prev === 'background' || prev === 'inactive') &&
        next === 'active' &&
        useAppStore.getState().isOnline &&
        useAuthStore.getState().session
      ) {
        void runSync().catch((err) => {
          if (__DEV__) console.warn('[SyncBridge] foreground pull failed', err);
        });
      }
    });
    return () => sub.remove();
  }, []);

  return null;
}
