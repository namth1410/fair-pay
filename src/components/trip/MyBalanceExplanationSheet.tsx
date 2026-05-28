import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { BottomSheet } from 'heroui-native';
import ArrowDownLeft from 'lucide-react-native/dist/esm/icons/arrow-down-left';
import ArrowUpRight from 'lucide-react-native/dist/esm/icons/arrow-up-right';
import HandCoins from 'lucide-react-native/dist/esm/icons/hand-coins';
import Send from 'lucide-react-native/dist/esm/icons/send';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import type { ExplanationKind, ExplanationLine, MyBalanceExplanation } from '../../utils/explainBalance';
import { formatVND } from '../../utils/format';
import { AppText, Money } from '../ui';

interface Props {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tripName: string;
  explanation: MyBalanceExplanation | null;
}

export function MyBalanceExplanationSheet({ isOpen, onOpenChange, tripName, explanation }: Props) {
  const c = useAppTheme();

  const lines = explanation?.lines ?? [];
  const total = explanation?.totalBalance ?? 0;
  const { label: totalLabel, tone: totalTone } = describeTotal(total);

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content snapPoints={['60%', '90%']}>
          <BottomSheetScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <BottomSheet.Title>Cách tính số dư của bạn</BottomSheet.Title>
              {tripName ? (
                <AppText variant="meta" tone="muted" numberOfLines={1} ellipsizeMode="tail">
                  {tripName}
                </AppText>
              ) : null}
            </View>

            {lines.length === 0 ? (
              <View style={styles.emptyBox}>
                <AppText variant="body" tone="muted" center>
                  Bạn chưa liên quan đến khoản chi hay thanh toán nào trong chuyến đi này.
                </AppText>
              </View>
            ) : (
              <View style={styles.list}>
                {lines.map((line, idx) => (
                  <LineRow key={`${line.kind}-${idx}`} line={line} />
                ))}
              </View>
            )}

            {lines.length > 0 ? (
              <View style={[styles.totalBox, { backgroundColor: c.surfaceAlt }]}>
                <AppText variant="caption" tone="muted">{totalLabel}</AppText>
                <Money value={Math.abs(total)} variant="display" tone={totalTone} />
              </View>
            ) : null}
          </BottomSheetScrollView>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

function describeTotal(b: number): { label: string; tone: 'success' | 'danger' | 'muted' } {
  if (b > 0) return { label: 'Bạn được nợ', tone: 'success' };
  if (b < 0) return { label: 'Bạn đang nợ', tone: 'danger' };
  return { label: 'Đã cân bằng', tone: 'muted' };
}

const ICON_FOR_KIND: Record<ExplanationKind, typeof Send> = {
  expense_paid_only: ArrowUpRight,
  expense_paid_and_split: ArrowUpRight,
  expense_split_only: ArrowDownLeft,
  payment_sent: Send,
  payment_received: HandCoins,
};

function LineRow({ line }: { line: ExplanationLine }) {
  const c = useAppTheme();
  const positive = line.delta >= 0;
  const Icon = ICON_FOR_KIND[line.kind];
  const tint = positive ? c.success : c.danger;

  return (
    <View style={[styles.row, { borderColor: c.divider, backgroundColor: c.surfaceAlt }]}>
      <View style={[styles.iconWrap, { backgroundColor: positive ? c.successSoft : c.dangerSoft }]}>
        <Icon size={16} color={tint} />
      </View>
      <View style={styles.rowMain}>
        <AppText variant="body" weight="semibold" numberOfLines={1} ellipsizeMode="tail">
          {renderTitle(line)}
        </AppText>
        <AppText variant="caption" tone="muted">
          {renderDetail(line)}
        </AppText>
      </View>
      <Money value={Math.abs(line.delta)} variant="default" tone={positive ? 'success' : 'danger'} showSign={false} />
    </View>
  );
}

function renderTitle(line: ExplanationLine): string {
  switch (line.kind) {
    case 'payment_sent':
      return `Bạn thanh toán ${line.counterpartName ?? ''}`.trim();
    case 'payment_received':
      return `${line.counterpartName ?? ''} thanh toán cho bạn`;
    default:
      return line.title;
  }
}

function renderDetail(line: ExplanationLine): string {
  switch (line.kind) {
    case 'expense_paid_only':
      return `Bạn trả ${formatVND(line.amount)} · bạn không chịu phần nào`;
    case 'expense_paid_and_split':
      return `Bạn trả ${formatVND(line.amount)} · bạn chịu ${formatVND(line.myShare ?? 0)}`;
    case 'expense_split_only':
      return `${line.counterpartName ?? '?'} trả ${formatVND(line.amount)} · bạn chịu ${formatVND(line.myShare ?? 0)}`;
    case 'payment_sent':
      return `Trừ trực tiếp vào số bạn còn nợ ${line.counterpartName ?? ''}`;
    case 'payment_received':
      return `Trừ trực tiếp vào số ${line.counterpartName ?? ''} còn nợ bạn`;
  }
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 16, paddingBottom: 24 },
  header: { alignItems: 'center', gap: 4, paddingBottom: 14 },
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowMain: { flex: 1, minWidth: 0, gap: 2 },
  totalBox: {
    marginTop: 14,
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    gap: 4,
  },
  emptyBox: { paddingVertical: 32, paddingHorizontal: 16 },
});
