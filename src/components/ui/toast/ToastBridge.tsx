import { useToast } from 'heroui-native';
import { useEffect } from 'react';

import { setToastInstance } from '../../../utils/toast';

export function ToastBridge() {
  const { toast } = useToast();

  useEffect(() => {
    setToastInstance(toast);
    return () => {
      setToastInstance(null);
    };
  }, [toast]);

  return null;
}
