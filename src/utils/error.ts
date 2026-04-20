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

  // Network
  'Failed to fetch': 'Không có kết nối mạng',
  'Network request failed': 'Không có kết nối mạng',
  'TypeError: Network request failed': 'Không có kết nối mạng',
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

  // Fallback — generic message, log raw error for debugging
  console.error('[Error]', raw);
  return 'Đã xảy ra lỗi, vui lòng thử lại';
}
