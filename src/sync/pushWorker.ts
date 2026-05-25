// PushWorker — replay sync_queue lên server theo thứ tự FIFO.
//
// Lifecycle 1 item:
//   1. pickPending() → markInFlight
//   2. dispatch(op_type, payload) → success | error
//   3. success → markDone + applyServerResult (update local mirror với server data)
//   4. error → classify:
//      - P0410 → markConflict + fetch server state + emit ConflictEvent (UI modal)
//      - 23503/42501/P0002 → markDead + toast warning
//      - network → markFailed + scheduled retry
//
// Concurrency: chỉ 1 push() in-flight. Caller (syncEngine) gọi tuần tự.

import * as conflictBus from './conflictBus';
import { dispatch, fetchServerEntity } from './pushDispatcher';
import * as syncErrors from './syncErrors';
import * as syncQueue from './syncQueue';

interface PushResult {
  attempted: number;
  succeeded: number;
  conflict: number;
  dead: number;
  failed: number;
}

const MAX_BATCH = 20;

/**
 * Push tối đa N items từ queue. Trả về số items đã attempt + breakdown status.
 * Không throw — mọi error đã được classify + persist vào queue.
 */
export async function pushPending(limit = MAX_BATCH): Promise<PushResult> {
  // Recover orphaned in_flight rows trước khi pick: app crash/force-kill mid-push
  // sẽ để lại row stuck `in_flight` mãi (pickPending không include status đó).
  const recovered = await syncQueue.recoverStaleInFlight();
  if (recovered > 0) {
    void syncErrors.log({
      source: 'push:recover_in_flight',
      message: `Reset ${recovered} stale in_flight row(s) → pending`,
      context: { recovered },
    });
  }

  const items = await syncQueue.pickPending(limit);
  let succeeded = 0;
  let conflict = 0;
  let dead = 0;
  let failed = 0;

  for (const item of items) {
    await syncQueue.markInFlight(item.id);

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(item.payload) as Record<string, unknown>;
    } catch {
      await syncQueue.markDead(item.id, null, 'invalid_payload_json');
      dead++;
      continue;
    }

    try {
      await dispatch(item.op_type, payload);
      await syncQueue.markDone(item.id);
      succeeded++;
    } catch (err) {
      const code = (err as { code?: string })?.code ?? null;
      // Conflict — fetch server state để UI hiện modal
      let serverData: Record<string, unknown> | null = null;
      if (code === 'P0410') {
        try {
          serverData = await fetchServerEntity(item.entity_type, item.entity_id);
        } catch {
          serverData = null;
        }
      }

      const next = await syncQueue.handleError(item.id, err, serverData);
      if (next === 'conflict') {
        conflict++;
        // Emit cho UI modal
        const updatedItem = await syncQueue.getById(item.id);
        if (updatedItem) {
          conflictBus.emit({ queueItem: updatedItem, serverData });
        }
      } else if (next === 'dead') {
        dead++;
      } else if (next === 'failed') {
        failed++;
      } else if (next === 'done') {
        // 23505 idempotency duplicate → server đã apply, treat as success
        succeeded++;
      }
    }
  }

  return {
    attempted: items.length,
    succeeded,
    conflict,
    dead,
    failed,
  };
}

// re-export để consumer khỏi import từ 2 chỗ
export { conflictBus };
