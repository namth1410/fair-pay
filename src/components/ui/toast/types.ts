import type { ReactNode } from 'react';

export type ToastVariantName = 'success' | 'danger' | 'warning' | 'info';

export interface ToastActionHelpers {
  hide: () => void;
}

export interface ToastOpts {
  description?: string;
  icon?: ReactNode;
  duration?: number | 'persistent';
  actionLabel?: string;
  onActionPress?: (helpers: ToastActionHelpers) => void;
}

export type ToastOptsArg = ToastOpts | string;
