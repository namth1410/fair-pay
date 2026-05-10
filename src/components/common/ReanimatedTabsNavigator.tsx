import {
  CommonActions,
  createNavigatorFactory,
  type DefaultNavigatorOptions,
  type NavigatorTypeBagBase,
  type ParamListBase,
  type StaticConfig,
  type TabActionHelpers,
  type TabNavigationState,
  TabRouter,
  type TabRouterOptions,
  type TypedNavigator,
  useNavigationBuilder,
} from '@react-navigation/native';
import { useEffect, useMemo, useRef } from 'react';
import { Dimensions, type StyleProp, type ViewStyle } from 'react-native';
import {
  type Route as RTVRoute,
  TabView,
  type TabViewMethods,
} from 'reanimated-tab-view';

// Custom navigator wrap quanh reanimated-tab-view để giữ Expo Router file-based
// routing + useFocusEffect cho tab screens. jumpMode="smooth" → jump xa không
// lướt qua tab giữa.

type ReanimatedTabNavigationOptions = {
  sceneStyle?: StyleProp<ViewStyle>;
};

type ReanimatedTabNavigationEventMap = Record<string, never>;

type ReanimatedTabNavigationConfig = {
  swipeEnabled?: boolean;
  renderMode?: 'all' | 'windowed' | 'lazy';
  sceneContainerStyle?: StyleProp<ViewStyle>;
};

type ReanimatedTabNavigatorProps = DefaultNavigatorOptions<
  ParamListBase,
  string | undefined,
  TabNavigationState<ParamListBase>,
  ReanimatedTabNavigationOptions,
  ReanimatedTabNavigationEventMap,
  unknown
> &
  TabRouterOptions &
  ReanimatedTabNavigationConfig;

function ReanimatedTabNavigator({
  id,
  initialRouteName,
  backBehavior,
  children,
  layout,
  screenListeners,
  screenOptions,
  screenLayout,
  swipeEnabled = true,
  renderMode = 'lazy',
  sceneContainerStyle,
}: ReanimatedTabNavigatorProps) {
  const { state, descriptors, navigation, NavigationContent } =
    useNavigationBuilder<
      TabNavigationState<ParamListBase>,
      TabRouterOptions,
      TabActionHelpers<ParamListBase>,
      ReanimatedTabNavigationOptions,
      ReanimatedTabNavigationEventMap
    >(TabRouter, {
      id,
      initialRouteName,
      backBehavior,
      children,
      layout,
      screenListeners,
      screenOptions,
      screenLayout,
    });

  const routes = useMemo<RTVRoute[]>(
    () =>
      state.routes.map((r) => ({
        key: r.key,
        title: r.name,
      })),
    [state.routes],
  );

  const tabViewRef = useRef<TabViewMethods>(null);
  // Lib chỉ đọc navigationState.index lúc mount để khởi tạo currentRouteIndex.
  // Sau đó muốn đổi tab phải gọi jumpTo() qua ref → trigger smooth animation.
  // Khi React Navigation state.index đổi (do AppDock dispatch JUMP_TO),
  // mình gọi imperative jumpTo để sync.
  useEffect(() => {
    const targetRoute = state.routes[state.index];
    if (!targetRoute) return;
    tabViewRef.current?.jumpTo(targetRoute.key);
  }, [state.index, state.routes]);

  return (
    <NavigationContent>
      <TabView
        ref={tabViewRef}
        navigationState={{ index: state.index, routes }}
        renderScene={({ route }) => {
          const descriptor = descriptors[route.key];
          return descriptor ? descriptor.render() : null;
        }}
        onIndexChange={(index) => {
          const route = state.routes[index];
          if (!route) return;
          // Chỉ dispatch khi index khác state.index hiện tại — tránh loop khi
          // chính mình gọi jumpTo trong useEffect ở trên.
          if (index === state.index) return;
          navigation.dispatch({
            ...CommonActions.navigate({
              name: route.name,
              merge: true,
            }),
            target: state.key,
          });
        }}
        jumpMode="smooth"
        renderMode={renderMode}
        swipeEnabled={swipeEnabled}
        sceneContainerStyle={sceneContainerStyle}
        // Ẩn tab bar mặc định — dock UI render bằng AppDock ở layout. Phải
        // override initialLayout.tabBar.height = 0 vì lib mặc định reserve
        // TAB_BAR_HEIGHT ngay cả khi renderTabBar trả null.
        tabBarConfig={EMPTY_TAB_BAR_CONFIG}
        initialLayout={INITIAL_TAB_VIEW_LAYOUT}
      />
    </NavigationContent>
  );
}

const EMPTY_TAB_BAR_CONFIG = {
  renderTabBar: () => null,
};

// Provide initial width ngay từ frame đầu — swipeTranslationXSV của lib
// dùng useSharedValue(initial) chỉ chạy 1 lần lúc mount. Nếu width=0 lúc
// đó, smooth jump tính sai distance ban đầu.
const INITIAL_TAB_VIEW_LAYOUT = {
  tabBar: { height: 0 },
  tabView: { width: Dimensions.get('window').width },
};

export function createReanimatedTabNavigator<
  const ParamList extends ParamListBase,
  const NavigatorID extends string | undefined = string | undefined,
  const TypeBag extends NavigatorTypeBagBase = {
    ParamList: ParamList;
    NavigatorID: NavigatorID;
    State: TabNavigationState<ParamList>;
    ScreenOptions: ReanimatedTabNavigationOptions;
    EventMap: ReanimatedTabNavigationEventMap;
    NavigationList: {
      [RouteName in keyof ParamList]: unknown;
    };
    Navigator: typeof ReanimatedTabNavigator;
  },
  const Config extends StaticConfig<TypeBag> = StaticConfig<TypeBag>,
>(config?: Config): TypedNavigator<TypeBag, Config> {
  return createNavigatorFactory(ReanimatedTabNavigator)(config);
}

export type {
  ReanimatedTabNavigationEventMap,
  ReanimatedTabNavigationOptions,
};
