// Poll sync_queue stats cho UI: số pending + số conflict.
//
// Khi app foreground, poll 5s — UI cập nhật khi sync engine push/pull thay đổi.
// KHÔNG dùng useSyncExternalStore vì SQLite không có change-notification API
// expose ra TS layer. Polling 5s là acceptable cost (chỉ 2 COUNT queries).

import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useAppStore } from '../stores/app.store';
import * as syncQueue from '../sync/syncQueue';

const POLL_MS = 5000;

export interface QueueStats {
  pendingCount: number;
  conflictCount: number;
}

export function useQueueStats(): QueueStats {
  const [stats, setStats] = useState<QueueStats>({
    pendingCount: 0,
    conflictCount: 0,
  });
  const isSyncing = useAppStore((s) => s.isSyncing);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const refresh = async () => {
      try {
        const [pending, conflict] = await Promise.all([
          syncQueue.countPending(),
          syncQueue.countConflicts(),
        ]);
        if (!cancelled) {
          setStats({ pendingCount: pending, conflictCount: conflict });
        }
      } catch {
        // ignore — DB might not be ready yet
      }
    };

    const startPolling = () => {
      void refresh();
      if (timer) clearInterval(timer);
      timer = setInterval(refresh, POLL_MS);
    };

    const stopPolling = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    if (AppState.currentState === 'active') startPolling();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') startPolling();
      else stopPolling();
    });

    return () => {
      cancelled = true;
      stopPolling();
      sub.remove();
    };
  }, []);

  // Refresh ngay khi isSyncing transition (push vừa xong → có thể có conflict mới)
  useEffect(() => {
    if (!isSyncing) {
      void Promise.all([
        syncQueue.countPending(),
        syncQueue.countConflicts(),
      ]).then(([p, c]) => setStats({ pendingCount: p, conflictCount: c }));
    }
  }, [isSyncing]);

  return stats;
}
