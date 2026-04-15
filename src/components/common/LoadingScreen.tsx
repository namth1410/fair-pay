import { ActivityIndicator, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';

export function LoadingScreen() {
  const c = useAppTheme();

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Đang tải"
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: c.background,
      }}
    >
      <ActivityIndicator size="large" color={c.primary} />
    </View>
  );
}
