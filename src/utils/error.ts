/**
 * Map lỗi kỹ thuật → message thân thiện tiếng Việt.
 * Không bao giờ hiển thị lỗi raw cho người dùng.
 */

const ERROR_MAP: Record<string, string> = {
  // Supabase Auth
  'Invalid login credentials': 'Email hoặc mật khẩu không đúng',
  'Email not confirmed': 'Email chưa được xác nhận',
  'User already registered': 'Email này đã được đăng ký',
  'Password should be at least 6 characters':
    'Mật khẩu phải có ít nhất 6 ký tự',
  'Email rate limit exceeded': 'Gửi quá nhiều yêu cầu, vui lòng thử lại sau',
  'User not found': 'Không tìm thấy tài khoản với email này',
  'New password should be different from the old password':
    'Mật khẩu mới phải khác mật khẩu cũ',
  'Token has expired or is invalid':
    'Link đặt lại mật khẩu đã hết hạn, vui lòng gửi lại',
  'Auth session missing':
    'Phiên xác thực không hợp lệ, vui lòng mở lại link từ email',

  // Supabase RLS / DB
  'new row violates row-level security policy':
    'Không có quyền thực hiện thao tác này',
  'duplicate key value violates unique constraint':
    'Dữ liệu đã tồn tại',
  'violates foreign key constraint': 'Dữ liệu liên quan không tồn tại',
  'JWT expired': 'Phiên đăng nhập hết hạn, vui lòng đăng nhập lại',

  // RPC custom error codes (clear_trip / delete_trip / create_expense / approve_join_request)
  not_admin: 'Chỉ admin mới có quyền thực hiện thao tác này',
  not_authorized: 'Bạn không có quyền thực hiện thao tác này',
  not_authenticated: 'Vui lòng đăng nhập lại',
  trip_not_found: 'Chuyến đi không tồn tại',
  trip_not_in_group: 'Chuyến không thuộc nhóm này',
  trip_closed: 'Chuyến đã đóng, không thể thêm khoản chi',
  cannot_modify_closed_trip: 'Chuyến đã đóng — mở lại chuyến đi để chỉnh sửa.',
  payer_not_in_group: 'Người trả không thuộc nhóm này',
  member_not_in_group: 'Người trả/người nhận không thuộc nhóm này',
  same_member: 'Người trả và người nhận không được giống nhau',
  invalid_title: 'Tên không hợp lệ',
  invalid_amount: 'Số tiền không hợp lệ',
  invalid_splits: 'Chia tiền không hợp lệ',
  splits_sum_mismatch: 'Tổng chia tiền không khớp số tiền',
  invalid_date_future: 'Không thể chọn ngày trong tương lai',
  request_not_found: 'Yêu cầu không tồn tại hoặc đã được xử lý',
  invalid_invite_code: 'Mã mời không hợp lệ',
  already_member: 'Bạn đã là thành viên nhóm này',
  invalid_group_name: 'Tên nhóm không hợp lệ',

  // RPC custom — update_user_settings (validate jsonb shape)
  invalid_settings_shape: 'Dữ liệu cài đặt không hợp lệ',
  invalid_settings_type: 'Giá trị cài đặt không đúng kiểu',
  invalid_dark_mode: 'Chế độ giao diện không hợp lệ',
  invalid_base_updated_at: 'Phiên cài đặt đã hết hạn, vui lòng thử lại',

  // RPC custom — optimistic concurrency (P3) + LWW (P5) + delete_payment (P2)
  version_conflict:
    'Dữ liệu vừa bị thay đổi bởi người khác. Hãy làm mới và thử lại.',
  lww_stale:
    'Cài đặt đã được cập nhật ở thiết bị khác. Kéo xuống để đồng bộ.',
  payment_not_found: 'Khoản thanh toán này không tồn tại hoặc đã bị xóa.',
  member_not_found: 'Thành viên này không tồn tại hoặc đã rời nhóm.',
  preset_not_found: 'Preset không tồn tại hoặc đã bị xóa.',
  user_not_found: 'Tài khoản người dùng không tồn tại.',
  group_not_found: 'Nhóm không tồn tại hoặc đã bị xóa.',
  not_owner: 'Bạn không phải chủ sở hữu preset này.',

  // RPC custom — invitation flow (invite_member_by_email / respond_to_invitation / revoke_invitation)
  email_invalid_or_not_found: 'Không thể mời. Vui lòng kiểm tra lại email.',
  cannot_invite_self: 'Bạn không thể tự mời chính mình',
  already_invited: 'Đã có lời mời đang chờ phản hồi',
  invitation_not_found: 'Lời mời không tồn tại hoặc đã được xử lý',
  invitation_not_pending: 'Lời mời đã được xử lý',
  invalid_action: 'Hành động không hợp lệ',

  // Feedback rate limit (DB trigger — xem migration feedback_daily_limit_trigger)
  feedback_daily_limit_exceeded:
    'Bạn đã gửi tối đa 3 góp ý hôm nay, vui lòng quay lại vào ngày mai',

  // Pinned trips (pin_trip / unpin_trip / reorder_pinned_trips RPCs)
  max_pinned_reached: 'Chỉ được ghim tối đa 2 chuyến đi',
  forbidden: 'Bạn không có quyền thực hiện thao tác này',
  'reorder requires exactly 2 trip ids': 'Cần đúng 2 chuyến đi để sắp xếp',
  'reorder requires 2 distinct trip ids': 'Hai chuyến đi phải khác nhau',
  'pin not found': 'Chuyến đi chưa được ghim',

  // Network
  'Failed to fetch': 'Không có kết nối mạng',
  'Network request failed': 'Không có kết nối mạng',
  'TypeError: Network request failed': 'Không có kết nối mạng',

  // Google Sign-In (native)
  'unacceptable audience in id_token':
    'Cấu hình Google Sign-In không khớp. Vui lòng báo team hỗ trợ.',
};

export function getErrorMessage(error: unknown): string {
  if (!error) return 'Đã xảy ra lỗi';

  const raw =
    typeof error === 'string'
      ? error
      : (error as Error)?.message || (error as Record<string, string>)?.error_description || '';

  // Check exact matches first
  for (const [key, msg] of Object.entries(ERROR_MAP)) {
    if (raw.includes(key)) return msg;
  }

  // Service layer thường throw Error với message tiếng Việt đã thân thiện
  // (vd: "Mã mời không hợp lệ"). Pass-through để không bị che bởi fallback generic.
  // Heuristic: có ký tự non-ASCII → đã là message hiển thị được.
  if (raw && /[^\x00-\x7F]/.test(raw)) return raw;

  // Fallback — generic message, log raw error for debugging
  console.error('[Error]', raw);
  return 'Đã xảy ra lỗi, vui lòng thử lại';
}
