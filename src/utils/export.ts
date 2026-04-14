import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import { Alert } from 'react-native';
import type { RefObject } from 'react';
import type { View } from 'react-native';

/** Capture a component as image and save to device gallery */
export async function exportToImage(viewRef: RefObject<View | null>): Promise<boolean> {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Quyền truy cập', 'Cần quyền truy cập thư viện ảnh để lưu');
      return false;
    }

    const uri = await captureRef(viewRef, {
      format: 'png',
      quality: 1,
    });

    await MediaLibrary.saveToLibraryAsync(uri);
    Alert.alert('Thành công', 'Đã lưu ảnh vào thư viện');
    return true;
  } catch (err: any) {
    Alert.alert('Lỗi', 'Không thể lưu ảnh: ' + err.message);
    return false;
  }
}
