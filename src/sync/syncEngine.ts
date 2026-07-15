// SyncEngine — orchestrator cho pull + (Phase 2) push + cleanup.
//
// Triggers:
//   - Bootstrap online (sau initDatabase + auth restore)
//   - NetInfo: offline → online transition
//   - AppState: background → active
//   - Pull-to-refresh (manual)
//   - Sau mỗi mutation enqueue (Phase 2)
//   - Periodic 30s khi app foreground (Phase 2)
//
// Concurrency: chỉ 1 run() in-flight. Caller gọi liên tiếp → no-op.

import { useAppStore } from '../stores/app.store';
import { refreshAllTripWidgets } from '../widgets/widgetUpdater';
import { uploadPendingGroupAvatars } from './groupAvatarUploadWorker';
import { uploadPending as uploadPendingImages } from './imageUploadWorker';
import { pullAll, type PullResult } from './pullWorker';
import { pushPending } from './pushWorker';
import * as syncBus from './syncBus';
import * as syncErrors from './syncErrors';
import * as syncQueue from './syncQueue';

let isRunning = false;
let lastRunAt = 0;
const MIN_INTERVAL_MS = 5000; // chống spam: 2 trigger liền nhau trong 5s gộp 1
// Safety net: TCP stall (fetch không reject/resolve) sẽ kẹt isRunning vĩnh viễn cho session
// → biến single-flight thành deadlock. 60s đủ cho slow 3G + large pull, không quá lâu cho UX.
const SYNC_TIMEOUT_MS = 60_000;

interface SyncRunResult {
  skipped: boolean;
  reason?: 'already_running' | 'offline' | 'rate_limited';
  pull?: PullResult;
}

function timeoutAfter(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`sync_timeout_${ms}ms`)), ms)
  );
}

export async function run(force = false): Promise<SyncRunResult> {
  if (isRunning) {
    return { skipped: true, reason: 'already_running' };
  }
  if (!force) {
    const isOnline = useAppStore.getState().isOnline;
    if (!isOnline) return { skipped: true, reason: 'offline' };

    const elapsed = Date.now() - lastRunAt;
    if (elapsed < MIN_INTERVAL_MS) {
      return { skipped: true, reason: 'rate_limited' };
    }
  }

  isRunning = true;
  useAppStore.getState().setSyncing(true);
  try {
    // Sync order:
    //   1. Pull TRƯỚC để có state mới nhất từ server
    //   2. Push queue UP (server vẫn check version → conflict modal)
    //   3. Pull lại để confirm/đồng bộ server-confirmed data
    //   4. Upload pending images (sau khi expense đã có trên server)
    //   5. Cleanup done/dead rows trong queue
    const pipeline = (async (): Promise<SyncRunResult> => {
      const pull1 = await pullAll();
      const push = await pushPending();
      // Pull lại chỉ khi push có thay đổi (tiết kiệm round-trip)
      let pull2: PullResult | undefined;
      if (push.succeeded > 0) {
        pull2 = await pullAll();
      }
      await uploadPendingImages().catch((e) => {
        if (__DEV__) console.warn('[syncEngine] imageUpload failed', e);
      });
      await uploadPendingGroupAvatars().catch((e) => {
        if (__DEV__) console.warn('[syncEngine] groupAvatarUpload failed', e);
      });
      await syncQueue.cleanup();
      lastRunAt = Date.now();
      // Báo cho UI (vd trip detail) refresh sau khi sync nền pull về thay đổi —
      // đặc biệt audit `expense.create` do server tạo sau createExpense local-first.
      syncBus.emit({ pulled: pull2 !== undefined });
      // Push cập nhật Android widget từ data local mới nhất (fire-and-forget,
      // tự no-op nếu không phải Android / chưa có widget nào).
      void refreshAllTripWidgets().catch(() => undefined);
      return { skipped: false, pull: pull2 ?? pull1 };
    })();

    const result = await Promise.race([pipeline, timeoutAfter(SYNC_TIMEOUT_MS)]);
    // Persist per-table errors mà pullAll/safe() đã thu thập (đã log riêng ở
    // pullWorker, nhưng giữ ở đây làm fallback nếu refactor sau bỏ chỗ kia).
    if (result.pull?.errors?.length) {
      for (const e of result.pull.errors) {
        void syncErrors.log({
          source: `sync_engine:pull_summary:${e.table}`,
          message: e.message,
        });
      }
    }
    return result;
  } catch (err) {
    if (__DEV__) console.warn('[syncEngine] run failed/timed out', err);
    void syncErrors.log({
      source: 'sync_engine:run',
      code: (err as { code?: string })?.code ?? null,
      message: (err as { message?: string })?.message ?? String(err),
    });
    throw err;
  } finally {
    isRunning = false;
    useAppStore.getState().setSyncing(false);
  }
}

/**
 * Reset toàn bộ watermark → next run = full pull.
 * Dùng khi schema mismatch hoặc user manual "tải lại dữ liệu".
 */
export async function reset(): Promise<void> {
  const { resetAll } = await import('./syncState');
  await resetAll();
}
