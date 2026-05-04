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
  markAllAsRead: () => Promise<void>;
  remove: (id: string) => Promise<void>;
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
    set({
      items: get().items.map((n) =>
        idSet.has(n.id) && !n.read_at ? { ...n, read_at: now } : n
      ),
      unreadCount: Math.max(
        0,
        get().unreadCount - get().items.filter((n) => idSet.has(n.id) && !n.read_at).length
      ),
    });
    try {
      await markAsReadApi(ids);
    } catch {
      // optimistic — silent
    }
  },

  markAllAsRead: async () => {
    const now = new Date().toISOString();
    set({
      items: get().items.map((n) => (n.read_at ? n : { ...n, read_at: now })),
      unreadCount: 0,
    });
    try {
      await markAllAsReadApi();
    } catch {
      // silent — refresh will reconcile
    }
  },

  remove: async (id) => {
    const removed = get().items.find((n) => n.id === id);
    set({
      items: get().items.filter((n) => n.id !== id),
      unreadCount:
        removed && !removed.read_at
          ? Math.max(0, get().unreadCount - 1)
          : get().unreadCount,
    });
    try {
      await deleteNotificationApi(id);
    } catch {
      // silent
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
