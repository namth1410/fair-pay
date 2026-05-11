/**
 * Xuất PDF diễn giải trip — orchestration layer.
 *
 * Build HTML qua util thuần → printToFileAsync (expo-print) → shareAsync (expo-sharing).
 * Hai mode: cả nhóm hoặc 1 thành viên chỉ định.
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import {
  buildTripGroupHtml,
  buildTripPersonHtml,
  type TripExportData,
} from '../utils/exportHtml';

export type ExportScope = { type: 'group' } | { type: 'person'; memberId: string };

/**
 * Tên file gợi ý cho PDF — bỏ ký tự không phù hợp filesystem, giới hạn độ dài.
 * iOS/Android share sheet hiển thị filename này.
 */
function buildFileName(data: TripExportData, scope: ExportScope): string {
  const tripPart = data.tripName.replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 60) || 'Trip';
  if (scope.type === 'group') {
    return `FairPay - ${tripPart} - ca nhom.pdf`;
  }
  const member = data.members.find((m) => m.id === scope.memberId);
  const namePart = (member?.displayName ?? 'thanh-vien')
    .replace(/[\\/:*?"<>|]+/g, '')
    .trim()
    .slice(0, 40);
  return `FairPay - ${tripPart} - ${namePart}.pdf`;
}

export interface ExportPdfResult {
  /** Đường dẫn file PDF (tạm thời) sau khi render. */
  uri: string;
  /** Tên file gợi ý hiển thị trên share sheet. */
  fileName: string;
}

/**
 * Build PDF từ data + scope, không share. Trả về URI tạm.
 * Nếu muốn auto share thì gọi `exportTripPdfAndShare`.
 */
export async function buildTripPdf(
  data: TripExportData,
  scope: ExportScope,
): Promise<ExportPdfResult> {
  const html =
    scope.type === 'group'
      ? buildTripGroupHtml(data)
      : buildTripPersonHtml(data, scope.memberId);

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  return { uri, fileName: buildFileName(data, scope) };
}

/**
 * Build PDF rồi mở share sheet OS. Trả về true nếu mở được share, false nếu thiết bị
 * không hỗ trợ (rất hiếm — emulator cũ). Không throw nếu user huỷ share sheet.
 */
export async function exportTripPdfAndShare(
  data: TripExportData,
  scope: ExportScope,
): Promise<boolean> {
  const { uri, fileName } = await buildTripPdf(data, scope);

  const available = await Sharing.isAvailableAsync();
  if (!available) return false;

  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: fileName,
    UTI: 'com.adobe.pdf',
  });
  return true;
}
