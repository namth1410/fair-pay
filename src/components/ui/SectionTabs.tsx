import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts } from '../../config/fonts';
import { useAppTheme } from '../../hooks/useAppTheme';

interface TabItem {
  key: string;
  label: string;
  badge?: number;
  hidden?: boolean;
}

interface SectionTabsProps {
  items: TabItem[];
  selected: string;
  onSelect: (key: string) => void;
}

export function SectionTabs({ items, selected, onSelect }: SectionTabsProps) {
  const c = useAppTheme();

  return (
    <View style={styles.tabs}>
      {items
        .filter((item) => !item.hidden)
        .map((item) => {
          const isActive = item.key === selected;
          return (
            <Pressable
              key={item.key}
              onPress={() => onSelect(item.key)}
              style={[
                styles.tab,
                {
                  backgroundColor: isActive ? c.primary : 'transparent',
                  borderColor: isActive ? c.primary : c.divider,
                },
              ]}
            >
              <View style={styles.tabContent}>
                <Text
                  style={{
                    color: isActive ? '#FFFFFF' : c.muted,
                    fontSize: 14,
                    fontWeight: '500',
                    fontFamily: fonts.medium,
                  }}
                >
                  {item.label}
                </Text>
                {item.badge != null && item.badge > 0 && (
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor: isActive
                          ? 'rgba(255,255,255,0.3)'
                          : '#DC2626',
                      },
                    ]}
                  >
                    <Text style={styles.badgeText}>{item.badge}</Text>
                  </View>
                )}
              </View>
            </Pressable>
          );
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: fonts.bold,
  },
});
