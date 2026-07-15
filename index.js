// Custom entry point: giữ expo-router entry + đăng ký widget task handler & config
// screen ở AppRegistry level (chạy CẢ trong app lẫn headless task của widget).
// Vì thay `main` sang file này, `import 'expo-router/entry'` PHẢI ở đầu.
import 'expo-router/entry';

import {
  registerWidgetConfigurationScreen,
  registerWidgetTaskHandler,
} from 'react-native-android-widget';

import { TripWidgetConfigScreen } from './src/widgets/TripWidgetConfigScreen';
import { widgetTaskHandler } from './src/widgets/widgetTaskHandler';

registerWidgetTaskHandler(widgetTaskHandler);
registerWidgetConfigurationScreen(TripWidgetConfigScreen);
