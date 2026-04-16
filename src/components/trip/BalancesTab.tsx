import { LinearGradient } from 'expo-linear-gradient';
import { Button, ScrollShadow, useToast } from 'heroui-native';
import { Scale } from 'lucide-react-native';
import React, { useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { exportToImage } from '../../utils/export';
import { AnimatedEntrance, AppCard, AppText, EmptyState, Money } from '../ui';

interface BalanceEntry {
  memberId: string;
  memberName: string;
  balance: number;
}

interface BalancesTabProps {
  tripName: string;
  balances: BalanceEntry[];
  totalExpenses: number;
}

export const BalancesTab = React.memo(function BalancesTab({
  tripName, balances, totalExpenses,
}: BalancesTabProps) {
  const c = useAppTheme();
  const { toast } = useToast();
  const balanceRef = useRef<View>(null);

  const handleExport = async () => {
    const result = await exportToImage(balanceRef);
    toast.show({
      variant: result.success ? 'success' : 'danger',
      label: result.message,
    });
  };

  if (balances.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <EmptyState icon={Scale} title="Thêm khoản chi để xem số dư" />
      </View>
    );
  }

  return (
    <View style={styles.tabContent}>
      <View style={styles.sectionActions}>
        <Button variant="outline" size="sm" onPress={handleExport}>
          <Button.Label>Lưu ảnh số dư</Button.Label>
        </Button>
      </View>
      <ScrollShadow LinearGradientComponent={LinearGradient}>
        <ScrollView contentContainerStyle={styles.list}>
          <View ref={balanceRef} collapsable={false} style={{ backgroundColor: c.background }}>
            <View style={[styles.exportSummary, { backgroundColor: c.surfaceAlt }]}>
              <AppText variant="title" weight="bold" tone="primary">{tripName}</AppText>
              <View style={styles.summaryRow}>
                <AppText variant="caption" tone="muted">Tổng chi:</AppText>
                <Money value={totalExpenses} variant="default" tone="primary" />
              </View>
            </View>
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
          </View>
        </ScrollView>
      </ScrollShadow>
    </View>
  );
});

const styles = StyleSheet.create({
  tabContent: { flex: 1 },
  sectionActions: { paddingHorizontal: 16, paddingBottom: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  exportSummary: {
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    alignItems: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 4,
  },
});
