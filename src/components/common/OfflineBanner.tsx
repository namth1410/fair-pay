import NetInfo from '@react-native-community/netinfo';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { useAppStore } from '../../stores/app.store';

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
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.banner, { backgroundColor: c.warning }]}>
      <Text style={styles.text}>Ngoại tuyến — dữ liệu sẽ đồng bộ khi có mạng</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
  },
});
