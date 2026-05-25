// Event bus cho conflict events từ SyncEngine → UI (modal/toast).
//
// SyncEngine emit khi push gặp P0410. UI subscribe để show ConflictResolverModal.
// Sử dụng simple listener pattern thay vì Zustand store để tránh re-render
// toàn app khi conflict — chỉ component subscribe nhận event.

import type { SyncQueueRow } from '../types/database.types';

export interface ConflictEvent {
  queueItem: SyncQueueRow;
  serverData: Record<string, unknown> | null;
}

type Listener = (event: ConflictEvent) => void;

const listeners = new Set<Listener>();

// Buffer cho late subscriber: nếu emit() chạy lúc 0 listener (race bootstrap,
// HMR reload, programmatic trigger), event được stash ở đây; subscriber kế
// tiếp sẽ nhận đúng 1 lần rồi clear. Tránh silent-drop ở race window microtask
// giữa SyncBridge effect và ConflictResolverModal effect.
let lastEvent: ConflictEvent | null = null;

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  if (lastEvent) {
    const buffered = lastEvent;
    lastEvent = null;
    try {
      listener(buffered);
    } catch (err) {
      if (__DEV__) console.warn('[conflictBus] replay threw', err);
    }
  }
  return () => {
    listeners.delete(listener);
  };
}

export function emit(event: ConflictEvent): void {
  if (listeners.size === 0) {
    lastEvent = event;
    return;
  }
  listeners.forEach((l) => {
    try {
      l(event);
    } catch (err) {
      if (__DEV__) console.warn('[conflictBus] listener threw', err);
    }
  });
}
