import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Alert, Linking } from 'react-native';
import { Camera as VisionCamera } from 'react-native-vision-camera';

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

  // LUÔN gọi request() trước, KHÔNG gate sau canAskAgain. Trên Android,
  // shouldShowRequestPermissionRationale (= canAskAgain trong expo) trả false
  // CẢ KHI permission chưa từng được hỏi LẪN khi denied vĩnh viễn — không
  // phân biệt được 2 case. Nếu gate request() sau canAskAgain thì lần tap
  // đầu tiên sẽ skip dialog hệ thống và show "Mở Cài đặt" oan. Khi denied
  // thật, request() resolve ngay (không có UI), sau đó canAskAgain vẫn
  // false → fallback settings alert.
  const result = await request();
  if (result.granted) return true;
  if (!result.canAskAgain) showSettingsAlert(kind);
  return false;
}

// VisionCamera permission API trả string status thay vì {granted, canAskAgain}.
// Map sang PermLike để dùng chung pattern ensure(). Sau khi requestCameraPermission
// trả 'denied' (đã bị từ chối, OS không show dialog nữa) → canAskAgain=false →
// fallback sang settings alert.
function visionCameraStatusToPermLike(status: string): PermLike {
  return {
    granted: status === 'granted',
    canAskAgain: status === 'not-determined',
  };
}

export function ensureCameraPermission(): Promise<boolean> {
  return ensure(
    'camera',
    async () => visionCameraStatusToPermLike(VisionCamera.getCameraPermissionStatus()),
    async () => visionCameraStatusToPermLike(await VisionCamera.requestCameraPermission()),
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
