import NetInfo from '@react-native-community/netinfo';
import { WifiOff } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { useAppStore } from '../../stores/app.store';
import { AppText } from '../ui/AppText';

export function OfflineBanner() {
  const { isOnline, setOnline } = useAppStore();
  const c = useAppTheme();

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOnline(state.isConnected ?? true);
    });
    return () => unsubscribe();
  }, []);

  if (isOnline) return null;

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.banner, { backgroundColor: c.warning }]}
    >
      <WifiOff size={14} color="#FFFFFF" strokeWidth={2.2} />
      <AppText variant="caption" weight="semibold" style={{ color: '#FFFFFF' }}>
        Ngoại tuyến — dữ liệu sẽ đồng bộ khi có mạng
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
});
