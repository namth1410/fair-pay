import LottieView from 'lottie-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useAppTheme } from '../../hooks/useAppTheme';
import { AppText } from './AppText';

const { width: SCREEN_W } = Dimensions.get('window');

// === Layout ===
const DRAGON_SIZE = Math.min(260, SCREEN_W * 0.7);
const CARD_WIDTH = Math.min(SCREEN_W - 48, 340);
// Claws dip xuống card bao nhiêu px
const CLAW_DEPTH = 42;

// === Motion tuning ===
const ENTRY_DURATION = 1100;
const EXIT_DURATION = 750;
const BOB_AMPLITUDE = 8;
const BOB_HALF_PERIOD = 650;
const WIGGLE_AMPLITUDE = 0.018;                         // ~1°
const WIGGLE_HALF_PERIOD = 1100;

interface BouncyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  dismissOnBackdrop?: boolean;
}

export function BouncyDialog({
  isOpen,
  onClose,
  children,
  dismissOnBackdrop = true,
}: BouncyDialogProps) {
  const { isDark, surface, divider, foreground } = useAppTheme();
  const [mounted, setMounted] = useState(false);
  // Track transition false→true để chỉ reset khi thật sự mở mới
  const prevOpenRef = useRef(false);
  // Direction xen kẽ — lần 1 rtl, lần 2 ltr, lần 3 rtl… Toggle ở cuối exit.
  const directionRef = useRef<'rtl' | 'ltr'>('rtl');

  const translateX = useSharedValue(SCREEN_W);
  const bob = useSharedValue(0);
  const wiggle = useSharedValue(0);
  const backdrop = useSharedValue(0);
  // scaleX cho dragon — 1 khi rtl (mặc định, mặt trái), -1 khi ltr (lật sang phải)
  const dragonScale = useSharedValue(1);

  useEffect(() => {
    const justOpened = isOpen && !prevOpenRef.current;
    const justClosed = !isOpen && prevOpenRef.current;
    prevOpenRef.current = isOpen;

    if (justOpened) {
      const dir = directionRef.current;
      const startX = dir === 'rtl' ? SCREEN_W : -SCREEN_W;

      // Reset vị trí + hướng rồng instant (trước khi withTiming chạy)
      translateX.value = startX;
      dragonScale.value = dir === 'rtl' ? 1 : -1;
      bob.value = 0;
      wiggle.value = 0;

      setMounted(true);
      backdrop.value = withTiming(1, { duration: 320 });

      // Bay vào theo hướng đã chọn
      translateX.value = withTiming(0, {
        duration: ENTRY_DURATION,
        easing: Easing.out(Easing.cubic),
      });

      // Bob lên-xuống vô hạn
      bob.value = withRepeat(
        withSequence(
          withTiming(-BOB_AMPLITUDE, {
            duration: BOB_HALF_PERIOD,
            easing: Easing.inOut(Easing.sin),
          }),
          withTiming(BOB_AMPLITUDE, {
            duration: BOB_HALF_PERIOD,
            easing: Easing.inOut(Easing.sin),
          }),
        ),
        -1,
        true,
      );

      // Card jostle nhẹ sau khi tới vị trí
      wiggle.value = withDelay(
        ENTRY_DURATION - 200,
        withRepeat(
          withSequence(
            withTiming(WIGGLE_AMPLITUDE, {
              duration: WIGGLE_HALF_PERIOD,
              easing: Easing.inOut(Easing.sin),
            }),
            withTiming(-WIGGLE_AMPLITUDE, {
              duration: WIGGLE_HALF_PERIOD,
              easing: Easing.inOut(Easing.sin),
            }),
          ),
          -1,
          true,
        ),
      );
    } else if (justClosed && mounted) {
      backdrop.value = withTiming(0, { duration: 420 });
      const dir = directionRef.current;
      const exitX = dir === 'rtl' ? -SCREEN_W * 1.1 : SCREEN_W * 1.1;
      // Bay tiếp theo đúng hướng đã vào (không quay đầu)
      translateX.value = withTiming(
        exitX,
        { duration: EXIT_DURATION, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        },
      );
      // Lật direction cho lần mở tiếp theo
      directionRef.current = dir === 'rtl' ? 'ltr' : 'rtl';
    }
  }, [isOpen, mounted, translateX, bob, wiggle, backdrop, dragonScale]);

  // Recolor dragon theo palette Sakura — body plum/pink, wings pink/light
  const dragonColorFilters = useMemo(() => {
    const bodyColor = isDark ? '#F0B5D2' : '#4A1F38';     // plum tối / pink sáng
    const wingColor = isDark ? '#FBE4EF' : '#F9A8D4';     // light pink / primary pink
    const accentColor = isDark ? '#F9A8D4' : '#EC4899';   // highlight cho eye/eyebrow

    const bodyLayers = [
      'BODY Outlines',
      'HEAD Outlines',
      'HEAD',
      'Back_LEG_F Outlines',
      'Front_LEG_F Outlines',
      'Ear_F Outlines',
    ];
    const wingLayers = ['WING Outlines', 'WING 3 Outlines', 'WING 3 Outlines 2'];
    const accentLayers = ['EYE Outlines', 'EYEBROW Outlines'];

    return [
      ...bodyLayers.map((keypath) => ({ keypath, color: bodyColor })),
      ...wingLayers.map((keypath) => ({ keypath, color: wingColor })),
      ...accentLayers.map((keypath) => ({ keypath, color: accentColor })),
    ];
  }, [isDark]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdrop.value,
  }));

  const cargoStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: bob.value },
      { rotate: `${wiggle.value}rad` },
    ],
  }));

  // Lật ngang dragon theo hướng bay — card KHÔNG bị lật
  const dragonWrapStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: dragonScale.value }],
  }));

  if (!mounted) return null;

  return (
    <Modal
      visible={mounted}
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
      animationType="none"
    >
      <View style={StyleSheet.absoluteFill}>
        {/* Backdrop */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: 'rgba(15, 8, 14, 0.55)' },
            backdropStyle,
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={dismissOnBackdrop ? onClose : undefined}
          />
        </Animated.View>

        {/* Cargo = dragon + card, bay thành khối */}
        <View style={styles.centerWrap} pointerEvents="box-none">
          <Animated.View style={[styles.cargo, cargoStyle]}>
            <View
              style={[
                styles.card,
                {
                  backgroundColor: surface,
                  borderColor: divider,
                  shadowColor: foreground,
                } as ViewStyle,
              ]}
            >
              {children}
            </View>

            {/* Dragon absolute — render sau card để nằm trên, claws "cắm" xuống top của card */}
            <Animated.View
              pointerEvents="none"
              style={[styles.dragonWrap, dragonWrapStyle]}
            >
              <LottieView
                source={require('../../../assets/dragon.json')}
                autoPlay
                loop
                resizeMode="contain"
                style={styles.dragon}
                colorFilters={dragonColorFilters}
              />
            </Animated.View>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

// ===== Compound sub-components =====

BouncyDialog.Title = function Title({ children }: { children: React.ReactNode }) {
  return (
    <AppText variant="title" style={styles.title}>
      {children}
    </AppText>
  );
};

BouncyDialog.Description = function Description({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppText variant="body" tone="muted" style={styles.description}>
      {children}
    </AppText>
  );
};

BouncyDialog.Actions = function Actions({
  children,
}: {
  children: React.ReactNode;
}) {
  return <View style={styles.actions}>{children}</View>;
};

// ===== Styles =====

const styles = StyleSheet.create({
  centerWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cargo: {
    alignItems: 'center',
  },
  dragonWrap: {
    position: 'absolute',
    width: DRAGON_SIZE,
    height: DRAGON_SIZE,
    // Đặt lên trên card, phần dưới (chân rồng) cắm vào card CLAW_DEPTH px
    top: -DRAGON_SIZE + CLAW_DEPTH,
    // Render sau card trong JSX = nằm trên
  },
  dragon: {
    width: '100%',
    height: '100%',
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    // Padding top dư chỗ cho claws "đáp" vào
    paddingTop: CLAW_DEPTH + 8,
    paddingBottom: 24,
    paddingHorizontal: 24,
    shadowOpacity: 0.25,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 18,
  },
  title: {
    marginBottom: 6,
  },
  description: {
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
});
