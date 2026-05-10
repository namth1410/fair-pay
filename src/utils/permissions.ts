import { Camera } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Alert, Linking } from 'react-native';

type PermKind = 'camera' | 'library' | 'mediaSave';

const MESSAGES: Record<PermKind, { title: string; message: string }> = {
  camera: {
    title: 'Cần quyền camera',
    message:
      'Fair Pay cần camera để chụp ảnh hoá đơn hoặc avatar nhóm. Bật trong Cài đặt để tiếp tục.',
  },
  library: {
    title: 'Cần quyền truy cập ảnh',
    message:
      'Fair Pay cần truy cập thư viện ảnh để chọn ảnh. Bật trong Cài đặt để tiếp tục.',
  },
  mediaSave: {
    title: 'Cần quyền lưu ảnh',
    message:
      'Fair Pay cần quyền truy cập thư viện ảnh để lưu ảnh xuất. Bật trong Cài đặt để tiếp tục.',
  },
};

function showSettingsAlert(kind: PermKind): void {
  const { title, message } = MESSAGES[kind];
  Alert.alert(title, message, [
    { text: 'Hủy', style: 'cancel' },
    { text: 'Mở Cài đặt', onPress: () => Linking.openSettings() },
  ]);
}

interface PermLike {
  granted: boolean;
  canAskAgain: boolean;
}

async function ensure(
  kind: PermKind,
  get: () => Promise<PermLike>,
  request: () => Promise<PermLike>,
): Promise<boolean> {
  const current = await get();
  if (current.granted) return true;

  if (current.canAskAgain) {
    const result = await request();
    if (result.granted) return true;
    if (!result.canAskAgain) showSettingsAlert(kind);
    return false;
  }

  showSettingsAlert(kind);
  return false;
}

export function ensureCameraPermission(): Promise<boolean> {
  return ensure(
    'camera',
    Camera.getCameraPermissionsAsync,
    Camera.requestCameraPermissionsAsync,
  );
}

export function ensureLibraryPermission(): Promise<boolean> {
  return ensure(
    'library',
    ImagePicker.getMediaLibraryPermissionsAsync,
    ImagePicker.requestMediaLibraryPermissionsAsync,
  );
}

export function ensureMediaSavePermission(): Promise<boolean> {
  return ensure(
    'mediaSave',
    MediaLibrary.getPermissionsAsync,
    MediaLibrary.requestPermissionsAsync,
  );
}
