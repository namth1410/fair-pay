import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { fonts } from '../../config/fonts';
import { useAppTheme } from '../../hooks/useAppTheme';
import { AppText } from '../ui';

interface SectionHeaderProps {
  title: string;
  count?: number;
  tagline?: string;
}

export const SectionHeader = memo(function SectionHeader({
  title,
  count,
  tagline,
}: SectionHeaderProps) {
  const c = useAppTheme();

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        {/* Editorial index mark: "01 /" style */}
        <View style={styles.indexMark}>
          <AppText
            variant="meta"
            style={{
              color: c.primaryStrong,
              fontFamily: fonts.bold,
              letterSpacing: 1.6,
              fontSize: 10,
            }}
          >
            01
          </AppText>
          <View style={[styles.slash, { backgroundColor: c.primaryStrong }]} />
        </View>

        <AppText
          variant="label"
          style={{
            color: c.foreground,
            fontFamily: fonts.bold,
            letterSpacing: 1.8,
            fontSize: 12,
          }}
        >
          {title}
        </AppText>

        {typeof count === 'number' && (
          <View style={[styles.countChip, { borderColor: c.divider }]}>
            <AppText
              variant="meta"
              style={{
                color: c.primaryStrong,
                fontFamily: fonts.bold,
                fontSize: 11,
                fontVariant: ['tabular-nums'],
              }}
            >
              {String(count).padStart(2, '0')}
            </AppText>
          </View>
        )}

        {/* Horizontal rule filling the remaining width */}
        <View style={[styles.rule, { backgroundColor: c.divider }]} />
      </View>

      {tagline && (
        <AppText
          variant="meta"
          style={{
            color: c.muted,
            fontFamily: fonts.medium,
            marginTop: 6,
            marginLeft: 30,
          }}
        >
          {tagline}
        </AppText>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  indexMark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  slash: {
    width: 1,
    height: 12,
    transform: [{ rotate: '18deg' }],
    opacity: 0.6,
  },
  countChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  rule: {
    flex: 1,
    height: 1,
    opacity: 0.8,
  },
});
