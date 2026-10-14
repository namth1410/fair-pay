import Scale from 'lucide-react-native/dist/esm/icons/scale';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { AnimatedEntrance, AppText, Avatar, EmptyState, Money } from '../ui';

interface BalanceEntry {
  memberId: string;
  memberName: string;
  balance: number;
}

interface BalancesTabProps {
  balances: BalanceEntry[];
}

function balanceCaption(balance: number): string {
  if (balance > 0) return 'Được nhận';
  if (balance < 0) return 'Đang nợ';
  return 'Cân bằng';
}

// Số dư từng người dạng danh sách (giao diện "Hội thoại"). Dấu theo quy ước: truyền RAW
// signed balance vào <Money showSign> — '+' được nhận, '-' đang nợ, 0 → "Cân bằng".
export const BalancesTab = React.memo(function BalancesTab({ balances }: BalancesTabProps) {
  const c = useAppTheme();

  if (balances.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <EmptyState icon={Scale} title="Thêm khoản chi để xem số dư" />
      </View>
    );
  }

  return (
    <View style={styles.tabContent}>
      <ScrollView contentContainerStyle={styles.list}>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider }]}>
          {balances.map((item, index) => {
            const settled = item.balance === 0;
            const positive = item.balance > 0;
            const isLast = index === balances.length - 1;
            return (
              <AnimatedEntrance key={item.memberId} delay={Math.min(index * 45, 400)}>
                <View
                  style={[
                    styles.row,
                    !isLast && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: c.divider,
                    },
                  ]}
                >
                  <Avatar seed={item.memberId} label={item.memberName} size={36} />
                  <View style={styles.texts}>
                    <AppText variant="body" weight="semibold" numberOfLines={1}>
                      {item.memberName}
                    </AppText>
                    <AppText variant="meta" tone="muted">
                      {balanceCaption(item.balance)}
                    </AppText>
                  </View>
                  {settled ? (
                    <AppText variant="caption" weight="semibold" tone="muted">
                      0đ
                    </AppText>
                  ) : (
                    <Money
                      value={item.balance}
                      variant="default"
                      tone={positive ? 'success' : 'danger'}
                      showSign
                    />
                  )}
                </View>
              </AnimatedEntrance>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  tabContent: { flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingVertical: 10,
  },
  texts: { flex: 1, minWidth: 0 },
});
