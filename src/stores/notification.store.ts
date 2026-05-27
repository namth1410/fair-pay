import { create } from 'zustand';

import { NOTIF_PAGE_SIZE } from '../config/constants';
import {
  deleteNotification as deleteNotificationApi,
  fetchNotifications,
  getUnreadCount,
  markAllAsRead as markAllAsReadApi,
  markAsRead as markAsReadApi,
  type Notification,
  type NotificationListFilter,
} from '../services/notification.service';

interface NotificationState {
  items: Notification[];
  unreadCount: number;
  isLoading: boolean;
  isRefreshing: boolean;
  hasMore: boolean;
  filter: NotificationListFilter;

  setFilter: (filter: NotificationListFilter) => Promise<void>;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  refreshUnreadCount: () => Promise<void>;
  markAsRead: (ids: string[]) => Promise<void>;
  markAllAsRead: (opts?: { groupIds?: string[] }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Insert a realtime-received notification at the head. Skip duplicates. */
  prepend: (n: Notification) => void;
  /** Replace an existing notification in place (dedup UPDATE event). */
  applyUpdate: (n: Notification) => void;
  reset: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: [],
  unreadCount: 0,
  isLoading: false,
  isRefreshing: false,
  hasMore: true,
  filter: { scope: 'all', groupIds: [] },

  setFilter: async (filter) => {
    set({ filter, items: [], hasMore: true });
    await get().refresh();
  },

  refresh: async () => {
    set({ isRefreshing: true });
    try {
      const items = await fetchNotifications({ filter: get().filter });
      set({
        items,
        hasMore: items.length >= NOTIF_PAGE_SIZE,
      });
      await get().refreshUnreadCount();
    } finally {
      set({ isRefreshing: false });
    }
  },

  loadMore: async () => {
    const { items, hasMore, isLoading, filter } = get();
    if (!hasMore || isLoading || !items.length) return;
    const last = items[items.length - 1];
    if (!last) return;
    set({ isLoading: true });
    try {
      const cursor = last.created_at;
      const next = await fetchNotifications({ cursor, filter });
      set({
        items: [...items, ...next],
        hasMore: next.length >= NOTIF_PAGE_SIZE,
      });
    } finally {
      set({ isLoading: false });
    }
  },

  refreshUnreadCount: async () => {
    try {
      const count = await getUnreadCount();
      set({ unreadCount: count });
    } catch {
      // ignore — badge stale OK
    }
  },

  markAsRead: async (ids) => {
    if (!ids.length) return;
    const idSet = new Set(ids);
    const now = new Date().toISOString();
    const prevItems = get().items;
    const prevUnread = get().unreadCount;
    const flippedCount = prevItems.filter((n) => idSet.has(n.id) && !n.read_at).length;
    set({
      items: prevItems.map((n) =>
        idSet.has(n.id) && !n.read_at ? { ...n, read_at: now } : n
      ),
      unreadCount: Math.max(0, prevUnread - flippedCount),
    });
    try {
      await markAsReadApi(ids);
    } catch (e) {
      set({ items: prevItems, unreadCount: prevUnread });
      if (__DEV__) console.warn('[Notif] markAsRead rollback:', e);
    }
  },

  markAllAsRead: async (opts) => {
    const now = new Date().toISOString();
    const prevItems = get().items;
    const prevUnread = get().unreadCount;
    const groupIds = opts?.groupIds?.length ? new Set(opts.groupIds) : null;
    const nextItems = prevItems.map((n) => {
      if (n.read_at) return n;
      if (groupIds && !groupIds.has(n.group_id ?? '')) return n;
      return { ...n, read_at: now };
    });
    const flipped = nextItems.filter((n, i) => prevItems[i] && !prevItems[i].read_at && n.read_at).length;
    set({
      items: nextItems,
      unreadCount: Math.max(0, prevUnread - flipped),
    });
    try {
      await markAllAsReadApi(opts);
      // Re-sync badge từ server vì items đã load có thể không bao phủ hết
      // unread notifications của user (đặc biệt khi filter group rộng).
      await get().refreshUnreadCount();
    } catch (e) {
      set({ items: prevItems, unreadCount: prevUnread });
      if (__DEV__) console.warn('[Notif] markAllAsRead rollback:', e);
    }
  },

  prepend: (n) => {
    const { items, unreadCount } = get();
    if (items.some((x) => x.id === n.id)) return;
    set({
      items: [n, ...items],
      unreadCount: n.read_at ? unreadCount : unreadCount + 1,
    });
  },

  applyUpdate: (n) => {
    const { items } = get();
    const idx = items.findIndex((x) => x.id === n.id);
    if (idx === -1) {
      // UPDATE arrived before the original INSERT was in cache — treat as new.
      get().prepend(n);
      return;
    }
    const next = items.slice();
    next[idx] = { ...next[idx], ...n };
    set({ items: next });
  },

  remove: async (id) => {
    const prevItems = get().items;
    const prevUnread = get().unreadCount;
    const removed = prevItems.find((n) => n.id === id);
    if (!removed) return;
    set({
      items: prevItems.filter((n) => n.id !== id),
      unreadCount: !removed.read_at ? Math.max(0, prevUnread - 1) : prevUnread,
    });
    try {
      await deleteNotificationApi(id);
    } catch (e) {
      set({ items: prevItems, unreadCount: prevUnread });
      if (__DEV__) console.warn('[Notif] remove rollback:', e);
    }
  },

  reset: () =>
    set({
      items: [],
      unreadCount: 0,
      isLoading: false,
      isRefreshing: false,
      hasMore: true,
      filter: { scope: 'all', groupIds: [] },
    }),
}));
