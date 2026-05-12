import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { captureFromCamera } from '../components/common/CameraCaptureHost';
import { GROUP_AVATAR_MAX_BYTES } from '../config/constants';
import { ensureCameraPermission, ensureLibraryPermission } from './permissions';

export type AvatarSource = 'camera' | 'library';

export interface ProcessedAvatar {
  uri: string;
  sizeBytes: number;
  width: number;
}

export interface PickedImage {
  uri: string;
  width: number;
  height: number;
  sizeBytes: number;
}

interface Attempt {
  dimension: number | null;
  quality: number;
}

// Quality-first progressive degradation. Stops at the first attempt that
// produces a file ≤ GROUP_AVATAR_MAX_BYTES. dimension=null means keep
// original dimension (no resize). Cap at 2048 because avatar/expense image
// renders at ~150-400px max — anything larger is wasted storage on R2.
const ATTEMPTS: readonly Attempt[] = [
  { dimension: null, quality: 0.95 },
  { dimension: null, quality: 0.85 },
  { dimension: 2048, quality: 0.85 },
  { dimension: 1024, quality: 0.85 },
  { dimension: 512, quality: 0.8 },
];

function fileSize(uri: string): number {
  const f = new File(uri);
  // File extends Blob — `size` is sync.
  return f.size ?? 0;
}

async function processToTarget(
  srcUri: string,
  srcWidth: number,
  srcHeight: number
): Promise<ProcessedAvatar> {
  // Normalize EXIF rotation first — Android ImagePicker đôi khi trả
  // width/height đã xoay logic nhưng bitmap raw chưa xoay, gây crop vượt biên.
  // Pass mảng rỗng để manipulateAsync decode + re-encode → result.width/height
  // luôn khớp pixel dimensions thật.
  let normUri = srcUri;
  let normW = srcWidth;
  let normH = srcHeight;
  if (srcWidth !== srcHeight) {
    const norm = await ImageManipulator.manipulateAsync(srcUri, [], {
      format: ImageManipulator.SaveFormat.JPEG,
    });
    normUri = norm.uri;
    normW = norm.width;
    normH = norm.height;
  }

  const side = Math.min(normW, normH);
  const needsCrop = normW !== normH;
  const originX = needsCrop ? Math.floor((normW - side) / 2) : 0;
  const originY = needsCrop ? Math.floor((normH - side) / 2) : 0;

  for (const { dimension, quality } of ATTEMPTS) {
    const ops: ImageManipulator.Action[] = [];
    if (needsCrop) {
      ops.push({ crop: { originX, originY, width: side, height: side } });
    }
    if (dimension !== null && dimension < side) {
      ops.push({ resize: { width: dimension, height: dimension } });
    }
    const result = await ImageManipulator.manipulateAsync(normUri, ops, {
      compress: quality,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    const size = fileSize(result.uri);
    if (size > 0 && size <= GROUP_AVATAR_MAX_BYTES) {
      return { uri: result.uri, sizeBytes: size, width: result.width };
    }
  }
  throw new Error('Ảnh không thể nén dưới 2 MB, thử ảnh khác');
}

/**
 * Pick image from camera/library (1:1 square) WITHOUT compression.
 * Use this when you want the preview tức thì — defer compress to upload time
 * via `compressForUpload()`. Saves ~600ms-1.2s of UI block.
 *
 * Permission được pre-check qua helper trước khi mở camera/picker — tap →
 * native OS dialog hiện ngay. Khi denied vĩnh viễn helper tự show Alert
 * "Mở Cài đặt", caller chỉ cần handle null là silent skip.
 */
export async function pickImage(source: AvatarSource): Promise<PickedImage | null> {
  let workingUri: string;
  let workingWidth: number;
  let workingHeight: number;

  if (source === 'camera') {
    const granted = await ensureCameraPermission();
    if (!granted) return null;
    const captured = await captureFromCamera();
    if (!captured) return null;
    workingUri = captured.uri;
    workingWidth = captured.width;
    workingHeight = captured.height;
  } else {
    const granted = await ensureLibraryPermission();
    if (!granted) return null;
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
      mediaTypes: ['images'],
    });

    if (result.canceled || !result.assets?.[0]) return null;

    const asset = result.assets[0];
    workingUri = asset.uri;
    workingWidth = asset.width;
    workingHeight = asset.height;
    // Android's allowsEditing crop sometimes returns non-square dims — không
    // crop ở đây, để compressForUpload xử lý gộp 1 lần.
  }

  return {
    uri: workingUri,
    width: workingWidth,
    height: workingHeight,
    sizeBytes: fileSize(workingUri),
  };
}

/**
 * Compress image to fit GROUP_AVATAR_MAX_BYTES (2 MB). Center-crops to square
 * + resizes + compresses trong 1 lần manipulateAsync (1 decode+encode pass).
 * Should be called right before upload.
 */
export async function compressForUpload(
  uri: string,
  width: number,
  height: number
): Promise<ProcessedAvatar> {
  return processToTarget(uri, width, height);
}

/**
 * Backward-compat: pick + immediate compress. Used by group avatar flow
 * (GroupEditSheet) where we upload right away — no benefit to deferring.
 */
export async function pickAndProcessAvatar(
  source: AvatarSource
): Promise<ProcessedAvatar | null> {
  const picked = await pickImage(source);
  if (!picked) return null;
  return processToTarget(picked.uri, picked.width, picked.height);
}
