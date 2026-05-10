import * as MediaLibrary from 'expo-media-library';
import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { ensureMediaSavePermission } from './permissions';

export interface ExportResult {
  success: boolean;
  message: string;
}

/** Capture a component as image and save to device gallery */
export async function exportToImage(viewRef: RefObject<View | null>): Promise<ExportResult> {
  try {
    const granted = await ensureMediaSavePermission();
    if (!granted) {
      // Helper đã show Alert "Mở Cài đặt" nếu cần. Caller chỉ cần biết failed.
      return { success: false, message: 'Cần quyền truy cập thư viện ảnh để lưu' };
    }

    const uri = await captureRef(viewRef, {
      format: 'png',
      quality: 1,
    });

    await MediaLibrary.saveToLibraryAsync(uri);
    return { success: true, message: 'Đã lưu ảnh vào thư viện' };
  } catch (err: unknown) {
    return { success: false, message: 'Không thể lưu ảnh: ' + (err instanceof Error ? err.message : 'Lỗi không xác định') };
  }
}
