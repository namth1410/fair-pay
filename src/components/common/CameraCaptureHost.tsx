import { X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, useCameraDevice } from 'react-native-vision-camera';

import { AppText } from '../ui';

export interface CameraCaptureResult {
  uri: string;
  width: number;
  height: number;
}

type Resolver = (result: CameraCaptureResult | null) => void;

let activeResolver: Resolver | null = null;
let setHostVisible: ((v: boolean) => void) | null = null;

export function captureFromCamera(): Promise<CameraCaptureResult | null> {
  if (!setHostVisible) {
    return Promise.resolve(null);
  }
  if (activeResolver) {
    activeResolver(null);
    activeResolver = null;
  }
  return new Promise((resolve) => {
    activeResolver = resolve;
    setHostVisible!(true);
  });
}

function resolveAndClose(result: CameraCaptureResult | null) {
  const r = activeResolver;
  activeResolver = null;
  setHostVisible?.(false);
  r?.(result);
}

export function CameraCaptureHost() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setHostVisible = setVisible;
    return () => {
      setHostVisible = null;
    };
  }, []);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={() => resolveAndClose(null)}
      statusBarTranslucent
      transparent={false}
    >
      {visible ? <CameraCaptureScreen /> : null}
    </Modal>
  );
}

function CameraCaptureScreen() {
  const window = useWindowDimensions();
  const squareSize = window.width;
  const device = useCameraDevice('back');

  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<CameraCaptureResult | null>(null);
  const [error, setError] = useState('');
  const cameraRef = useRef<Camera>(null);

  const handleClose = () => {
    resolveAndClose(null);
  };

  // takeSnapshot trên Android = GPU view screenshot (~16ms), trên iOS lấy
  // frame từ video pipeline (cần video={true}). Khác hẳn expo-camera
  // takePictureAsync vốn block ~500-1500ms do full-res JPEG encode trên
  // native thread. Đây là cách TikTok/Instagram đạt "chụp phát ăn luôn".
  const handleCapture = async () => {
    if (busy || !cameraRef.current) return;
    setBusy(true);
    setError('');
    try {
      const snap = await cameraRef.current.takeSnapshot({ quality: 90 });
      // path là local filesystem path, cần file:// prefix cho RN <Image>.
      const uri = snap.path.startsWith('file://') ? snap.path : `file://${snap.path}`;
      setPreview({ uri, width: snap.width, height: snap.height });
    } catch (err) {
      setError((err as Error)?.message ?? 'Không chụp được ảnh');
    } finally {
      setBusy(false);
    }
  };

  const handleRetake = () => {
    setPreview(null);
    setError('');
  };

  const handleConfirm = () => {
    if (preview) resolveAndClose(preview);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={handleClose} hitSlop={12} style={styles.iconBtn}>
          <X size={24} color="#FFFFFF" strokeWidth={2} />
        </Pressable>
      </View>

      <View style={styles.viewfinderWrap}>
        <View style={[styles.viewfinder, { width: squareSize, height: squareSize }]}>
          {preview ? (
            <Image
              source={{ uri: preview.uri }}
              style={{ width: squareSize, height: squareSize }}
              resizeMode="cover"
            />
          ) : device ? (
            <Camera
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={true}
              photo={true}
              video={true}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.cameraLoading}>
              <ActivityIndicator color="#FFFFFF" />
            </View>
          )}
        </View>

        {error ? (
          <View style={styles.errorPill}>
            <AppText variant="caption" style={styles.whiteText} center>
              {error}
            </AppText>
          </View>
        ) : null}
      </View>

      <View style={styles.bottomBar}>
        {preview ? (
          <View style={styles.confirmRow}>
            <Pressable onPress={handleRetake} style={styles.secondaryBtn} hitSlop={8}>
              <AppText variant="body" weight="semibold" style={styles.whiteText}>
                Chụp lại
              </AppText>
            </Pressable>
            <Pressable onPress={handleConfirm} style={styles.primaryBtn} hitSlop={8}>
              <AppText variant="body" weight="semibold" style={styles.primaryBtnText}>
                Dùng ảnh
              </AppText>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={handleCapture}
            disabled={busy || !device}
            style={({ pressed }) => [
              styles.shutterOuter,
              { opacity: !device || busy ? 0.5 : pressed ? 0.85 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Chụp ảnh"
          >
            <View style={styles.shutterInner}>
              {busy ? <ActivityIndicator color="#000000" /> : null}
            </View>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'android' ? 12 : 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  viewfinderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewfinder: {
    overflow: 'hidden',
    backgroundColor: '#111111',
    borderRadius: 24,
  },
  cameraLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorPill: {
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(220,53,69,0.85)',
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmRow: {
    flexDirection: 'row',
    gap: 12,
    alignSelf: 'stretch',
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  primaryBtn: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  primaryBtnText: {
    color: '#000000',
  },
  whiteText: {
    color: '#FFFFFF',
  },
});
