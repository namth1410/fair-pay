// Event bus cho sync-completion → UI refresh.
//
// SyncEngine emit sau mỗi run() thành công (không bị skip). Màn hình (vd trip detail)
// subscribe để refresh dữ liệu khi sync nền pull về thay đổi — vd audit `expense.create`
// do server tạo SAU khi createExpense local-first push lên (fire-and-forget), hoặc dữ
// liệu đổi từ thiết bị khác. Dùng listener pattern (giống conflictBus) thay vì Zustand
// store để tránh re-render toàn app; chỉ component subscribe nhận event.
//
// KHÔNG buffer lastEvent như conflictBus: sync chạy lặp lại định kỳ, miss 1 event không
// sao (lần sync kế emit lại). Listener phải tự rẻ (chỉ refetch khi đúng trip đang xem).

export interface SyncCompleteEvent {
  /** true nếu lần sync này có pull lại dữ liệu (push thành công → pull2 chạy). */
  pulled: boolean;
}

type Listener = (event: SyncCompleteEvent) => void;

const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emit(event: SyncCompleteEvent): void {
  listeners.forEach((l) => {
    try {
      l(event);
    } catch (err) {
      if (__DEV__) console.warn('[syncBus] listener threw', err);
    }
  });
}
