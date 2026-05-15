import { Alert, Linking } from 'react-native';
import { Camera as VisionCamera } from 'react-native-vision-camera';

function showSettingsAlert(): void {
  Alert.alert(
    'Cần quyền camera',
    'Fair Pay cần camera để chụp ảnh hoá đơn hoặc avatar nhóm. Bật trong Cài đặt để tiếp tục.',
    [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Mở Cài đặt', onPress: () => Linking.openSettings() },
    ],
  );
}

interface PermLike {
  granted: boolean;
  canAskAgain: boolean;
}

// VisionCamera permission API trả string status thay vì {granted, canAskAgain}.
// Sau khi requestCameraPermission trả 'denied' (đã bị từ chối, OS không show
// dialog nữa) → canAskAgain=false → fallback sang settings alert.
function visionCameraStatusToPermLike(status: string): PermLike {
  return {
    granted: status === 'granted',
    canAskAgain: status === 'not-determined',
  };
}

export async function ensureCameraPermission(): Promise<boolean> {
  const current = visionCameraStatusToPermLike(VisionCamera.getCameraPermissionStatus());
  if (current.granted) return true;

  // LUÔN gọi request() trước, KHÔNG gate sau canAskAgain. Trên Android,
  // shouldShowRequestPermissionRationale (= canAskAgain trong expo) trả false
  // CẢ KHI permission chưa từng được hỏi LẪN khi denied vĩnh viễn — không
  // phân biệt được 2 case. Nếu gate request() sau canAskAgain thì lần tap
  // đầu tiên sẽ skip dialog hệ thống và show "Mở Cài đặt" oan. Khi denied
  // thật, request() resolve ngay (không có UI), sau đó canAskAgain vẫn
  // false → fallback settings alert.
  const result = visionCameraStatusToPermLike(await VisionCamera.requestCameraPermission());
  if (result.granted) return true;
  if (!result.canAskAgain) showSettingsAlert();
  return false;
}
