import LottieView from 'lottie-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  type ImageSourcePropType,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '../../hooks/useAppTheme';
import { useAnimationsEnabled } from '../../utils/userPreferences';
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

// === Peek dragon (PNG bổ sung — ló từ cạnh dưới màn hình) ===
// `facing` = hướng đầu/thân rồng trong ảnh nhìn về phía nào của người xem.
// Slot trái pick từ {right, front} (rồng quay đầu vào giữa); slot phải ngược lại;
// slot center pick bất kỳ. Tránh case rồng quay lưng vào dialog ở slot biên.
type PeekFacing = 'left' | 'right' | 'front';
const PEEK_DRAGONS: { src: ImageSourcePropType; facing: PeekFacing }[] = [
  { src: require('../../../assets/nobg/01_slay_qua.png'),       facing: 'left'  },
  { src: require('../../../assets/nobg/02_hdpe_luon.png'),      facing: 'right' },
  { src: require('../../../assets/nobg/03_e_nha.png'),          facing: 'left' },
  { src: require('../../../assets/nobg/04_lop_truong.png'),     facing: 'left' },
  { src: require('../../../assets/nobg/05_plus_one_may.png'),   facing: 'left' },
  { src: require('../../../assets/nobg/06_na_ni.png'),          facing: 'right' },
  { src: require('../../../assets/nobg/07_du_wow_roi_do.png'),  facing: 'left'  },
  { src: require('../../../assets/nobg/08_ten_ten.png'),        facing: 'left' },
  { src: require('../../../assets/nobg/09_mtp.png'),            facing: 'right' },
  { src: require('../../../assets/nobg/10_dinh_noc.png'),       facing: 'left' },
  { src: require('../../../assets/nobg/11_bao_qua.png'),        facing: 'left' },
  { src: require('../../../assets/nobg/12_mlem.png'),           facing: 'right' },
  { src: require('../../../assets/nobg/13_nai_xu.png'),         facing: 'right' },
  { src: require('../../../assets/nobg/14_j97.png'),            facing: 'right' },
];
const PEEK_WIDTH = 150;
const PEEK_HEIGHT = Math.round(PEEK_WIDTH * (341 / 256));   // giữ tỉ lệ ảnh gốc 256×341
const PEEK_DURATION = 650;
// Margin horizontal cho slot trái/phải so với cạnh màn hình
const PEEK_EDGE_MARGIN = 16;
// Idle motion sau khi peek xong — bob lên xuống + wiggle góc nhỏ
const PEEK_BOB_AMPLITUDE = 5;
const PEEK_BOB_HALF_PERIOD = 800;
const PEEK_WIGGLE_AMPLITUDE = 2;                            // ±2° quanh góc tilt
const PEEK_WIGGLE_HALF_PERIOD = 1100;

type PeekSlot = 'left' | 'center' | 'right';
const PEEK_SLOTS: PeekSlot[] = ['left', 'center', 'right'];
// Slot tính theo SCREEN_W vì ảnh giờ nằm ở đáy màn hình, không phải đáy card.
// Trái: nghiêng đầu vào giữa (+CW); phải: nghiêng ngược lại.
const PEEK_SLOT_CONFIG: Record<PeekSlot, { left: number; rotation: number }> = {
  left:   { left: PEEK_EDGE_MARGIN,                                rotation: 16 },
  center: { left: (SCREEN_W - PEEK_WIDTH) / 2,                     rotation: 0 },
  right:  { left: SCREEN_W - PEEK_WIDTH - PEEK_EDGE_MARGIN,        rotation: -16 },
};

function pickRandomSlot(): PeekSlot {
  return PEEK_SLOTS[Math.floor(Math.random() * PEEK_SLOTS.length)] as PeekSlot;
}

// Random index trong PEEK_DRAGONS, chỉ chọn ảnh có hướng phù hợp với slot.
// left slot → ảnh hướng right hoặc front; right slot → left hoặc front; center → bất kỳ.
function pickDragonForSlot(slot: PeekSlot): number {
  const candidateIndices = PEEK_DRAGONS.reduce<number[]>((acc, d, i) => {
    const ok =
      slot === 'center' ||
      (slot === 'left'  && (d.facing === 'right' || d.facing === 'front')) ||
      (slot === 'right' && (d.facing === 'left'  || d.facing === 'front'));
    if (ok) acc.push(i);
    return acc;
  }, []);
  // Fallback all nếu pool rỗng (an toàn nếu bộ ảnh thay đổi trong tương lai)
  const pool = candidateIndices.length > 0
    ? candidateIndices
    : PEEK_DRAGONS.map((_, i) => i);
  return pool[Math.floor(Math.random() * pool.length)] as number;
}

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
  const animationsEnabled = useAnimationsEnabled();
  const insets = useSafeAreaInsets();
  // Khoảng cách rồng phải dịch xuống để biến mất hoàn toàn dưới cạnh màn hình.
  // = chiều cao ảnh + safe area bottom + buffer nhỏ.
  const peekHiddenOffset = PEEK_HEIGHT + insets.bottom + 16;
  const [mounted, setMounted] = useState(false);
  // Track transition false→true để chỉ reset khi thật sự mở mới
  const prevOpenRef = useRef(false);
  // Direction xen kẽ — lần 1 rtl, lần 2 ltr, lần 3 rtl… Toggle ở cuối exit.
  const directionRef = useRef<'rtl' | 'ltr'>('rtl');
  // Slot + ảnh rồng PNG ngẫu nhiên mỗi lần mở
  const [peekSlot, setPeekSlot] = useState<PeekSlot>('center');
  const [peekIdx, setPeekIdx] = useState(0);

  const translateX = useSharedValue(SCREEN_W);
  const bob = useSharedValue(0);
  const wiggle = useSharedValue(0);
  const backdrop = useSharedValue(0);
  // scaleX cho dragon — 1 khi rtl (mặc định, mặt trái), -1 khi ltr (lật sang phải)
  const dragonScale = useSharedValue(1);
  // peek: 0 = ẩn dưới mép màn hình, 1 = đã ló đầu lên trên đáy card
  const peek = useSharedValue(0);
  const peekRotation = useSharedValue(0);
  // Idle motion (bob lên xuống + wiggle góc nhỏ) — cộng dồn vào transform
  const peekBob = useSharedValue(0);
  const peekWiggle = useSharedValue(0);

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

      // Random slot + ảnh rồng PNG ló từ đáy
      const nextSlot = pickRandomSlot();
      const nextIdx = pickDragonForSlot(nextSlot);
      setPeekSlot(nextSlot);
      setPeekIdx(nextIdx);
      peek.value = 0;
      peekRotation.value = PEEK_SLOT_CONFIG[nextSlot].rotation;
      peekBob.value = 0;
      peekWiggle.value = 0;

      setMounted(true);

      if (!animationsEnabled) {
        // Instant: dialog xuất hiện ngay tại vị trí cuối, dragon đứng yên
        backdrop.value = 1;
        translateX.value = 0;
        peek.value = 1;
        return;
      }

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

      // Rồng PNG ló đầu lên sau khi card slide gần xong.
      // Dùng cubic out (KHÔNG back) để không overshoot — back easing đẩy peek > 1
      // tạm thời, khiến rồng vọt lên cao hơn vị trí rest rồi mới settle.
      const peekDelay = ENTRY_DURATION - 400;
      peek.value = withDelay(
        peekDelay,
        withTiming(1, {
          duration: PEEK_DURATION,
          easing: Easing.out(Easing.cubic),
        }),
      );

      // Idle motion bắt đầu khi rồng gần xong rise (delay ~80% của PEEK_DURATION)
      // → tránh chồng lên cubic ease-out của rise; chuyển sang loop mượt.
      const idleDelay = peekDelay + Math.round(PEEK_DURATION * 0.8);
      peekBob.value = withDelay(
        idleDelay,
        withRepeat(
          withSequence(
            withTiming(-PEEK_BOB_AMPLITUDE, {
              duration: PEEK_BOB_HALF_PERIOD,
              easing: Easing.inOut(Easing.sin),
            }),
            withTiming(PEEK_BOB_AMPLITUDE, {
              duration: PEEK_BOB_HALF_PERIOD,
              easing: Easing.inOut(Easing.sin),
            }),
          ),
          -1,
          true,
        ),
      );
      peekWiggle.value = withDelay(
        idleDelay,
        withRepeat(
          withSequence(
            withTiming(PEEK_WIGGLE_AMPLITUDE, {
              duration: PEEK_WIGGLE_HALF_PERIOD,
              easing: Easing.inOut(Easing.sin),
            }),
            withTiming(-PEEK_WIGGLE_AMPLITUDE, {
              duration: PEEK_WIGGLE_HALF_PERIOD,
              easing: Easing.inOut(Easing.sin),
            }),
          ),
          -1,
          true,
        ),
      );
    } else if (justClosed && mounted) {
      const dir = directionRef.current;
      // Lật direction cho lần mở tiếp theo
      directionRef.current = dir === 'rtl' ? 'ltr' : 'rtl';

      if (!animationsEnabled) {
        backdrop.value = 0;
        setMounted(false);
        return;
      }

      backdrop.value = withTiming(0, { duration: 420 });
      const exitX = dir === 'rtl' ? -SCREEN_W * 1.1 : SCREEN_W * 1.1;
      // Bay tiếp theo đúng hướng đã vào (không quay đầu)
      translateX.value = withTiming(
        exitX,
        { duration: EXIT_DURATION, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        },
      );
      // Rồng PNG thụt xuống đáy biến mất nhanh hơn card
      peek.value = withTiming(0, {
        duration: EXIT_DURATION * 0.6,
        easing: Easing.in(Easing.cubic),
      });
    }
  }, [
    isOpen,
    mounted,
    animationsEnabled,
    translateX,
    bob,
    wiggle,
    backdrop,
    dragonScale,
    peek,
    peekRotation,
    peekBob,
    peekWiggle,
  ]);

  // Recolor dragon theo palette monochrome — body neutral, wings xám, accent black/white
  const dragonColorFilters = useMemo(() => {
    const bodyColor = isDark ? '#FAFAFA' : '#1A1A1F';     // snow / eclipse
    const wingColor = isDark ? '#D4D4D8' : '#71717A';     // zinc-300 / zinc-500
    const accentColor = isDark ? '#FFFFFF' : '#000000';   // highlight cho eye/eyebrow

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

  // peek=0 → translateY = +peekHiddenOffset (ảnh ẩn hoàn toàn dưới cạnh màn hình)
  // peek=1 → translateY = 0 (ảnh ngồi yên với đáy ảnh sát cạnh dưới màn hình, fully visible)
  // Idle motion: peekBob (±5px translateY) + peekWiggle (±2° quanh tilt) cộng dồn.
  const peekStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: (1 - peek.value) * peekHiddenOffset + peekBob.value },
      { rotate: `${peekRotation.value + peekWiggle.value}deg` },
    ],
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
                animationsEnabled ? null : styles.cardNoClaw,
                {
                  backgroundColor: surface,
                  borderColor: divider,
                  shadowColor: foreground,
                } as ViewStyle,
              ]}
            >
              {children}
            </View>

            {/* Dragon chỉ render khi animations ON — không có anim thì rồng đứng hình
                trông kỳ. Khi off, card hiển thị đứng độc lập với padding chuẩn. */}
            {animationsEnabled ? (
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
            ) : null}
          </Animated.View>

          {/* Rồng PNG ngẫu nhiên ló từ cạnh dưới màn hình — sibling của cargo,
              KHÔNG slide ngang theo card, chỉ rise lên từ đáy screen */}
          {animationsEnabled ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.peekDragonWrap,
                {
                  left: PEEK_SLOT_CONFIG[peekSlot].left,
                  bottom: insets.bottom,
                },
                peekStyle,
              ]}
            >
              <Image
                source={PEEK_DRAGONS[peekIdx]?.src}
                style={styles.peekDragonImage}
                resizeMode="contain"
              />
            </Animated.View>
          ) : null}
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
  peekDragonWrap: {
    position: 'absolute',
    width: PEEK_WIDTH,
    height: PEEK_HEIGHT,
    // `left` + `bottom` được set inline theo slot + safe area insets.
    // Khi peek=1 (translateY=0): đáy ảnh ở cạnh dưới screen (cách bằng insets.bottom),
    // toàn bộ ảnh visible bên trên — đúng "vừa đủ nhô lên hết khỏi cạnh dưới màn hình".
  },
  peekDragonImage: {
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
  cardNoClaw: {
    // Khi không có dragon (animations OFF), padding top chuẩn
    paddingTop: 24,
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
