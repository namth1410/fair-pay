import type { ToastManager, ToastShowOptions } from 'heroui-native';
import { createElement } from 'react';

import { DarkPillToast } from '../components/ui/toast/DarkPillToast';
import type {
  ToastOpts,
  ToastOptsArg,
  ToastVariantName,
} from '../components/ui/toast/types';
import { getErrorMessage } from './error';

let toastInstance: ToastManager | null = null;
const pendingQueue: ToastShowOptions[] = [];
const QUEUE_CAP = 8;

export function setToastInstance(instance: ToastManager | null): void {
  toastInstance = instance;
  if (instance && pendingQueue.length > 0) {
    const drained = pendingQueue.splice(0, pendingQueue.length);
    requestAnimationFrame(() => {
      for (const payload of drained) {
        instance.show(payload);
      }
    });
  }
}

function dispatch(payload: ToastShowOptions): void {
  if (toastInstance) {
    toastInstance.show(payload);
    return;
  }
  if (pendingQueue.length >= QUEUE_CAP) {
    if (__DEV__) {
      console.warn('[toast] pending queue full, dropping payload');
    }
    return;
  }
  pendingQueue.push(payload);
}

function normalizeOpts(opts?: ToastOptsArg): ToastOpts {
  if (!opts) return {};
  if (typeof opts === 'string') return { description: opts };
  return opts;
}

function buildPayload(
  variant: ToastVariantName,
  label: string,
  opts: ToastOpts
): ToastShowOptions {
  return {
    duration: opts.duration,
    component: (toastProps) =>
      createElement(DarkPillToast, {
        ...toastProps,
        variant,
        label,
        description: opts.description,
        icon: opts.icon,
        actionLabel: opts.actionLabel,
        onActionPress: opts.onActionPress,
      }),
  };
}

export function showSuccess(label: string, opts?: ToastOptsArg): void {
  dispatch(buildPayload('success', label, normalizeOpts(opts)));
}

export function showWarning(label: string, opts?: ToastOptsArg): void {
  dispatch(buildPayload('warning', label, normalizeOpts(opts)));
}

export function showInfo(label: string, opts?: ToastOptsArg): void {
  dispatch(buildPayload('info', label, normalizeOpts(opts)));
}

export function showError(error: unknown, customLabel?: string): void {
  dispatch(
    buildPayload('danger', customLabel ?? 'Lỗi', {
      description: getErrorMessage(error),
    })
  );
}

/**
 * Validation/static error message (not from an exception). Uses danger variant
 * but lets caller specify label + description without going through getErrorMessage.
 */
export function showValidationError(label: string, description?: string): void {
  dispatch(buildPayload('danger', label, { description }));
}

/**
 * Escape hatch for the rare case that needs to bypass the dark pill design or
 * use options the helpers don't expose (e.g. duration: 'persistent', custom
 * heroui-native render). Prefer the typed helpers above.
 */
export function showToastRaw(payload: ToastShowOptions): void {
  dispatch(payload);
}
