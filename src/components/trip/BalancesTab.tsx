import Scale from 'lucide-react-native/dist/esm/icons/scale';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { AnimatedEntrance, AppCard, EmptyState, Money } from '../ui';

interface BalanceEntry {
  memberId: string;
  memberName: string;
  balance: number;
}

interface BalancesTabProps {
  balances: BalanceEntry[];
}

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
        {balances.map((item, index) => {
          const positive = item.balance >= 0;
          return (
            <AnimatedEntrance key={item.memberId} delay={Math.min(index * 60, 500)}>
              <AppCard
                title={item.memberName}
                subtitle={positive ? 'Được nợ' : 'Đang nợ'}
                borderLeft={{ width: 3, color: positive ? c.success : c.danger }}
                trailing={
                  <Money
                    value={Math.abs(item.balance)}
                    variant="default"
                    tone={positive ? 'success' : 'danger'}
                    showSign
                  />
                }
              />
            </AnimatedEntrance>
          );
        })}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  tabContent: { flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
});
