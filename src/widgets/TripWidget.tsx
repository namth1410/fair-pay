// Layout widget (RemoteViews qua react-native-android-widget). KHÔNG phải RN
// component thường — chỉ FlexWidget/TextWidget được. Tap = OPEN_URI deep link
// tới trip (manifest đã có scheme fairpay + singleTask).

import type { ColorProp, WidgetRepresentation } from 'react-native-android-widget';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

import { balanceToWidgetLabel, type WidgetTone } from './widgetFormat';
import type { TripSnapshot } from './widgetTypes';

interface WidgetTheme {
  bg: ColorProp;
  bgSuccess: ColorProp;
  bgDanger: ColorProp;
  textPrimary: ColorProp;
  muted: ColorProp;
  success: ColorProp;
  danger: ColorProp;
}

const LIGHT: WidgetTheme = {
  bg: '#FFFFFF',
  bgSuccess: '#ECFDF5', // xanh nhạt — được nhận
  bgDanger: '#FEF2F2', // đỏ nhạt — đang nợ
  textPrimary: '#18181B',
  muted: '#71717A',
  success: '#059669',
  danger: '#DC2626',
};

const DARK: WidgetTheme = {
  bg: '#1F1F26',
  bgSuccess: '#14261E', // xanh ám tối — được nhận
  bgDanger: '#2A1719', // đỏ ám tối — đang nợ
  textPrimary: '#FAFAFA',
  muted: '#A1A1AA',
  success: '#34D399',
  danger: '#F87171',
};

function toneColor(theme: WidgetTheme, tone: WidgetTone): ColorProp {
  if (tone === 'success') return theme.success;
  if (tone === 'danger') return theme.danger;
  return theme.muted;
}

/** Nền theo tình trạng — nợ (đỏ nhạt) / được nhận (xanh nhạt) / cân bằng (trung tính). */
function toneBg(theme: WidgetTheme, tone: WidgetTone): ColorProp {
  if (tone === 'success') return theme.bgSuccess;
  if (tone === 'danger') return theme.bgDanger;
  return theme.bg;
}

function TripWidget({
  snapshot,
  tripId,
  theme,
}: {
  snapshot: TripSnapshot | null;
  tripId: string | null;
  theme: WidgetTheme;
}) {
  const uri = tripId ? `fairpay://trips/${tripId}` : null;
  const label = snapshot ? balanceToWidgetLabel(snapshot.myBalance) : null;
  const bg = label ? toneBg(theme, label.tone) : theme.bg;

  // Tên + nhóm ở TRÊN, số dư to ở DƯỚI — space-between phân bổ hết chiều cao
  // 2 hàng, không thừa padding. Placeholder căn giữa.
  const children =
    snapshot && label
      ? [
          <FlexWidget
            key="head"
            style={{ width: 'match_parent', flexDirection: 'column' }}
          >
            <TextWidget
              text={snapshot.tripName}
              maxLines={1}
              truncate="END"
              style={{ fontSize: 24, fontWeight: '700', color: theme.textPrimary }}
            />
            <TextWidget
              text={snapshot.groupName}
              maxLines={1}
              truncate="END"
              style={{ fontSize: 15, color: theme.muted, marginTop: 3 }}
            />
          </FlexWidget>,
          <TextWidget
            key="balance"
            text={label.text}
            maxLines={1}
            truncate="END"
            style={{
              fontSize: 34,
              fontWeight: '700',
              color: toneColor(theme, label.tone),
            }}
          />,
        ]
      : [
          <TextWidget
            key="brand"
            text="Fair Pay"
            style={{ fontSize: 20, fontWeight: '700', color: theme.textPrimary }}
          />,
          <TextWidget
            key="hint"
            text="Chạm để mở chuyến đi"
            maxLines={2}
            style={{ fontSize: 14, color: theme.muted, marginTop: 4 }}
          />,
        ];

  return (
    <FlexWidget
      clickAction={uri ? 'OPEN_URI' : 'OPEN_APP'}
      clickActionData={uri ? { uri } : undefined}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: snapshot ? 'space-between' : 'center',
        paddingHorizontal: 18,
        paddingVertical: 18,
        backgroundColor: bg,
        borderRadius: 24,
      }}
    >
      {children}
    </FlexWidget>
  );
}

/** Render 2 biến thể light/dark — launcher chọn theo theme hệ thống. */
export function renderTripWidget(
  snapshot: TripSnapshot | null,
  tripId: string | null
): WidgetRepresentation {
  return {
    light: <TripWidget snapshot={snapshot} tripId={tripId} theme={LIGHT} />,
    dark: <TripWidget snapshot={snapshot} tripId={tripId} theme={DARK} />,
  };
}
