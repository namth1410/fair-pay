import { Button } from 'heroui-native';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { BouncyDialog, GoogleIcon } from '../ui';

interface RegisterNoticeDialogProps {
  isOpen: boolean;
  /** "Vẫn đăng ký bằng email" — đóng dialog, ở lại màn đăng ký */
  onClose: () => void;
  /** "Đăng nhập với Google" — khuyến khích để né giới hạn email */
  onUseGoogle: () => void;
  googleLoading?: boolean;
}

/**
 * Hiện ngay khi user vào màn đăng ký email. Giải thích server free-tier giới hạn
 * ~4 email/giờ (dễ lỗi) và khuyến khích đăng nhập bằng Google. Xem CLAUDE.md
 * mục rate limit / Google sign-in.
 */
export function RegisterNoticeDialog({
  isOpen,
  onClose,
  onUseGoogle,
  googleLoading = false,
}: RegisterNoticeDialogProps) {
  const c = useAppTheme();
  return (
    <BouncyDialog isOpen={isOpen} onClose={onClose} dismissOnBackdrop={false}>
      <BouncyDialog.Title>Một lưu ý nhỏ 🐉</BouncyDialog.Title>
      <BouncyDialog.Description>
        Fair Pay là app làm cho vui, nên toàn bộ tài nguyên máy chủ đều xài gói
        miễn phí. Vì vậy cả hệ thống chỉ gửi được khoảng 4 email mỗi giờ — đăng ký
        bằng email rất dễ gặp lỗi.{'\n\n'}
        Để vào app nhanh và ổn định hơn, bạn nên đăng nhập bằng Google nhé!
      </BouncyDialog.Description>
      <View style={styles.actions}>
        <Button
          variant="outline"
          size="lg"
          onPress={onUseGoogle}
          isDisabled={googleLoading}
          style={[
            styles.googleButton,
            {
              backgroundColor: c.isDark ? c.surface : '#FFFFFF',
              borderColor: c.divider,
            },
          ]}
        >
          <GoogleIcon size={20} />
          <Button.Label style={{ color: c.foreground }}>
            {googleLoading ? 'Đang đăng nhập...' : 'Đăng nhập với Google'}
          </Button.Label>
        </Button>
        <Button
          variant="ghost"
          size="md"
          onPress={onClose}
          isDisabled={googleLoading}
        >
          <Button.Label>Vẫn đăng ký bằng email</Button.Label>
        </Button>
      </View>
    </BouncyDialog>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: 8,
  },
  googleButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
  },
});
