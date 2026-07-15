import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { router } from 'expo-router';
import { BottomSheet, Button } from 'heroui-native';
import { Image, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import type { ExpenseWithSplits } from '../../services/expense.service';
import type { GroupMember } from '../../services/group.service';
import { formatDateTimeVN, formatDateVN } from '../../utils/format';
import { AppText, Money } from '../ui';

interface Props {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  expense: ExpenseWithSplits | null;
  members: GroupMember[];
  /** Cho phép sửa (trip đang mở). Ẩn nút Sửa khi trip đã đóng. */
  canEdit?: boolean;
}

const SPLIT_TYPE_VN: Record<string, string> = {
  equal: 'Chia đều',
  ratio: 'Theo tỉ lệ',
  custom: 'Tuỳ chỉnh',
};

export function ExpenseDetailSheet({ isOpen, onOpenChange, expense, members, canEdit }: Props) {
  const c = useAppTheme();
  const getName = (id: string) =>
    members.find((m) => m.id === id)?.display_name || '?';

  const handleEdit = () => {
    if (!expense) return;
    onOpenChange(false);
    router.push(`/trips/${expense.trip_id}/expenses/${expense.id}/edit`);
  };

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content snapPoints={['60%', '90%']}>
          <BottomSheetScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {expense ? (
              <>
                <View style={styles.header}>
                  <BottomSheet.Title>{expense.title}</BottomSheet.Title>
                  <Money value={expense.amount} variant="display" tone="primary" />
                  {canEdit ? (
                    <Button variant="secondary" size="sm" onPress={handleEdit}>
                      <Button.Label>✏️ Sửa khoản chi</Button.Label>
                    </Button>
                  ) : null}
                </View>

                <View style={[styles.infoBox, { backgroundColor: c.surfaceAlt }]}>
                  <InfoRow label="Người trả" value={getName(expense.paid_by)} />
                  <InfoRow
                    label="Ngày"
                    value={
                      expense.created_at
                        ? formatDateTimeVN(new Date(expense.created_at))
                        : formatDateVN(new Date(expense.date))
                    }
                  />
                </View>

                {expense.note ? (
                  <View style={styles.section}>
                    <AppText variant="caption" tone="muted" weight="semibold">
                      GHI CHÚ
                    </AppText>
                    <AppText variant="body">{expense.note}</AppText>
                  </View>
                ) : null}

                {expense.image_url ? (
                  <View style={styles.section}>
                    <AppText variant="caption" tone="muted" weight="semibold">
                      HÌNH ẢNH
                    </AppText>
                    <Image
                      source={{ uri: expense.image_url }}
                      style={styles.image}
                      resizeMode="cover"
                    />
                  </View>
                ) : null}

                <View style={styles.section}>
                  <View style={styles.splitHeading}>
                    <AppText variant="caption" tone="muted" weight="semibold">
                      CHIA TIỀN
                    </AppText>
                    <View style={[styles.chip, { backgroundColor: c.accentSoft }]}>
                      <AppText variant="caption" tone="muted">
                        {SPLIT_TYPE_VN[expense.split_type] ?? expense.split_type}
                      </AppText>
                    </View>
                  </View>
                  <View style={[styles.splitsList, { borderColor: c.divider }]}>
                    {expense.expense_splits.map((split, idx) => (
                      <View
                        key={split.id}
                        style={[
                          styles.splitRow,
                          idx > 0 && {
                            borderTopWidth: StyleSheet.hairlineWidth,
                            borderTopColor: c.divider,
                          },
                        ]}
                      >
                        <AppText
                          variant="body"
                          numberOfLines={1}
                          style={styles.splitName}
                        >
                          {getName(split.member_id)}
                        </AppText>
                        <Money value={split.amount} variant="compact" tone="default" />
                      </View>
                    ))}
                  </View>
                </View>
              </>
            ) : null}
          </BottomSheetScrollView>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <AppText variant="meta" tone="muted">{label}</AppText>
      <AppText
        variant="body"
        weight="semibold"
        numberOfLines={1}
        style={styles.infoValue}
      >
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 16, paddingBottom: 32 },
  header: { alignItems: 'center', gap: 8, paddingBottom: 16 },
  section: { gap: 8, marginTop: 16 },
  infoBox: {
    padding: 14,
    borderRadius: 12,
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  infoValue: { flex: 1, textAlign: 'right' },
  splitHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  splitsList: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  splitName: { flex: 1, minWidth: 0 },
  image: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 12,
  },
});
