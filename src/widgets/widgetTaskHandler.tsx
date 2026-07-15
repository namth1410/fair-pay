// Headless task handler — chạy khi launcher cần render widget (added/update/
// resized, kể cả sau reboot) hoặc khi widget bị xóa. Chỉ ĐỌC bridge (không
// initDatabase) → nhẹ, an toàn ở headless context.

import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { renderTripWidget } from './TripWidget';
import { getWidgetData, removeBinding } from './widgetBridge';

export async function widgetTaskHandler(
  props: WidgetTaskHandlerProps
): Promise<void> {
  const { widgetId } = props.widgetInfo;

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const { tripId, snapshot } = await getWidgetData(widgetId);
      props.renderWidget(renderTripWidget(snapshot, tripId));
      break;
    }
    case 'WIDGET_DELETED': {
      await removeBinding(widgetId).catch(() => undefined);
      break;
    }
    case 'WIDGET_CLICK':
      // Không dùng — tap đã xử lý bằng OPEN_URI trực tiếp trên FlexWidget.
      break;
    default:
      break;
  }
}
