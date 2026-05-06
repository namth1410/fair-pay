import { Button } from 'heroui-native';

import { BouncyDialog } from '../ui';

interface WelcomeDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WelcomeDialog({ isOpen, onClose }: WelcomeDialogProps) {
  return (
    <BouncyDialog isOpen={isOpen} onClose={onClose} dismissOnBackdrop={false}>
      <BouncyDialog.Title>Cảm ơn bạn đã đến với Fair Pay</BouncyDialog.Title>
      <BouncyDialog.Description>
        Cảm ơn bạn đã dành thời gian trải nghiệm app. Mong bạn có những giây phút chia tiền nhóm thật nhẹ nhàng.{'\n\n'}
        Khi nào có góp ý cải thiện, bạn có thể vào phần Cài đặt → Gửi góp ý nhé!
      </BouncyDialog.Description>
      <BouncyDialog.Actions>
        <Button variant="primary" size="md" onPress={onClose}>
          <Button.Label>Bắt đầu</Button.Label>
        </Button>
      </BouncyDialog.Actions>
    </BouncyDialog>
  );
}
