import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react-native';
import type { ComponentType } from 'react';

import type { ToastVariantName } from './types';

interface VariantStyle {
  circleBg: string;
  Icon: ComponentType<{ size?: number; color?: string }>;
}

export const TOAST_VARIANT_CONFIG: Record<ToastVariantName, VariantStyle> = {
  success: { circleBg: '#22C55E', Icon: CheckCircle2 },
  danger: { circleBg: '#EF4444', Icon: AlertCircle },
  warning: { circleBg: '#F59E0B', Icon: AlertTriangle },
  info: { circleBg: '#3B82F6', Icon: Info },
};
