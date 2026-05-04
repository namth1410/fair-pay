import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { fonts } from '../../config/fonts';
import { useAppTheme } from '../../hooks/useAppTheme';
import { AppText } from '../ui';

interface SectionHeaderProps {
  title: string;
  count?: number;
  tagline?: string;
  /** Optional slot rendered after the count chip, before the trailing rule. */
  right?: ReactNode;
}

export const SectionHeader = memo(function SectionHeader({
  title,
  count,
  tagline,
  right,
}: SectionHeaderProps) {
  const c = useAppTheme();

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
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

        {right ? <View style={styles.rightSlot}>{right}</View> : null}
      </View>

      {tagline && (
        <AppText
          variant="meta"
          style={{
            color: c.muted,
            fontFamily: fonts.medium,
            marginTop: 6,
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
  rightSlot: {
    marginLeft: 4,
  },
});
