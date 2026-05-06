import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { Camera as CameraIcon, RefreshCcw, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [cameraReady, setCameraReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<CameraCaptureResult | null>(null);
  const [error, setError] = useState('');
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission]);

  const handleClose = () => {
    resolveAndClose(null);
  };

  const handleFlip = () => {
    setFacing((prev) => (prev === 'back' ? 'front' : 'back'));
    setCameraReady(false);
  };

  const handleCapture = async () => {
    if (busy || !cameraReady || !cameraRef.current) return;
    setBusy(true);
    setError('');
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
        skipProcessing: false,
      });
      if (!photo) throw new Error('Không chụp được ảnh');
      const side = Math.min(photo.width, photo.height);
      const originX = Math.floor((photo.width - side) / 2);
      const originY = Math.floor((photo.height - side) / 2);
      const cropped = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ crop: { originX, originY, width: side, height: side } }],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );
      setPreview({ uri: cropped.uri, width: cropped.width, height: cropped.height });
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

  if (!permission) {
    return (
      <View style={styles.root}>
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <Pressable onPress={handleClose} hitSlop={12} style={styles.iconBtn}>
            <X size={24} color="#FFFFFF" strokeWidth={2} />
          </Pressable>
        </View>
        <View style={styles.permissionBody}>
          <CameraIcon size={48} color="#FFFFFF" strokeWidth={1.6} />
          <AppText variant="title" style={styles.whiteText} center>
            Cần quyền truy cập camera
          </AppText>
          <AppText variant="body" style={styles.whiteMuted} center>
            Fair Pay cần camera để chụp ảnh hoá đơn hoặc avatar nhóm.
          </AppText>
          {permission.canAskAgain ? (
            <Pressable onPress={requestPermission} style={[styles.primaryBtn, styles.permissionBtn]}>
              <AppText variant="body" weight="semibold" style={styles.primaryBtnText}>
                Cấp quyền
              </AppText>
            </Pressable>
          ) : (
            <Pressable onPress={() => Linking.openSettings()} style={[styles.primaryBtn, styles.permissionBtn]}>
              <AppText variant="body" weight="semibold" style={styles.primaryBtnText}>
                Mở Cài đặt
              </AppText>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={handleClose} hitSlop={12} style={styles.iconBtn}>
          <X size={24} color="#FFFFFF" strokeWidth={2} />
        </Pressable>
        {!preview ? (
          <Pressable onPress={handleFlip} hitSlop={12} style={styles.iconBtn}>
            <RefreshCcw size={22} color="#FFFFFF" strokeWidth={2} />
          </Pressable>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>

      <View style={styles.viewfinderWrap}>
        <View style={[styles.viewfinder, { width: squareSize, height: squareSize }]}>
          {preview ? (
            <Image
              source={{ uri: preview.uri }}
              style={{ width: squareSize, height: squareSize }}
            />
          ) : (
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing={facing}
              onCameraReady={() => setCameraReady(true)}
              responsiveOrientationWhenOrientationLocked={false}
            />
          )}
          {!preview && !cameraReady ? (
            <View style={styles.cameraLoading}>
              <ActivityIndicator color="#FFFFFF" />
            </View>
          ) : null}
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
            disabled={busy || !cameraReady}
            style={({ pressed }) => [
              styles.shutterOuter,
              { opacity: !cameraReady || busy ? 0.5 : pressed ? 0.85 : 1 },
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
  permissionBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  permissionBtn: {
    flex: 0,
    alignSelf: 'stretch',
    marginTop: 8,
  },
  whiteText: {
    color: '#FFFFFF',
  },
  whiteMuted: {
    color: 'rgba(255,255,255,0.7)',
  },
});
