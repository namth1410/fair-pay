// Shared types + constants cho Android widget "Lối tắt tới Trip".

/** Tên widget — PHẢI khớp `name` trong app.json plugin + requestWidgetUpdateById. */
export const WIDGET_NAME = 'Trip';

/** Snapshot dữ liệu 1 trip để render lên widget (app tính rồi push sang launcher). */
export interface TripSnapshot {
  tripId: string;
  tripName: string;
  groupName: string;
  /** Số dư của user hiện tại trong trip (VND, signed: + được nhận, - đang nợ). */
  myBalance: number;
  /** ISO timestamp lúc snapshot được build. */
  updatedAt: string;
}

/** Persisted state (JSON file) — ĐỌC được từ headless task handler. */
export interface WidgetState {
  /** widgetId (dạng string) → tripId. */
  bindings: Record<string, string>;
  /** tripId → snapshot cuối cùng. */
  snapshots: Record<string, TripSnapshot>;
}
