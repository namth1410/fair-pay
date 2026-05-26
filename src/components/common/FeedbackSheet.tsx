import { BottomSheetView } from '@gorhom/bottom-sheet';
import { BottomSheet, Button } from 'heroui-native';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import {
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_MIN_LENGTH,
  sanitizeFeedback,
  submitFeedback,
} from '../../services/feedback.service';
import { getErrorMessage } from '../../utils/error';
import { showSuccess } from '../../utils/toast';
import { AppText, DismissKeyboardView } from '../ui';
import { FloatingBottomSheetInput } from '../ui/floating';

interface FeedbackSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FeedbackSheet({ isOpen, onOpenChange }: FeedbackSheetProps) {
  const c = useAppTheme();

  const messageRef = useRef('');
  const [resetKey, setResetKey] = useState(0);
  const [canSubmit, setCanSubmit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    messageRef.current = '';
    setResetKey((k) => k + 1);
    setCanSubmit(false);
    setBusy(false);
    setFormError('');
  }, [isOpen]);

  // Boundary flip duy nhất khi vượt qua min length — tránh re-render mỗi keystroke
  // (sẽ phá IME tiếng Việt khi compose dấu, theo CLAUDE.md §TextInput trong BottomSheet).
  const handleChangeText = (text: string) => {
    messageRef.current = text;
    const next = sanitizeFeedback(text).length >= FEEDBACK_MIN_LENGTH;
    setCanSubmit((prev) => (prev === next ? prev : next));
  };

  const handleSubmit = async () => {
    if (busy) return;
    Keyboard.dismiss();
    setFormError('');
    setBusy(true);
    try {
      await submitFeedback(messageRef.current);
      onOpenChange(false);
      showSuccess('Đã gửi góp ý', 'Cảm ơn bạn rất nhiều!');
    } catch (e: unknown) {
      setFormError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          enableDynamicSizing={false}
          snapPoints={['55%', '90%']}
          keyboardBehavior="extend"
          keyboardBlurBehavior="restore"
          android_keyboardInputMode="adjustResize"
        >
          <BottomSheetView style={styles.container}>
            <DismissKeyboardView>
            <View style={styles.header}>
              <BottomSheet.Title>Gửi góp ý</BottomSheet.Title>
            </View>

            <View style={styles.body}>
              <AppText variant="caption" tone="muted" style={styles.hint}>
                Mọi phản hồi của bạn đều giúp app tốt hơn. Hãy chia sẻ những gì bạn thấy chưa ổn hoặc tính năng bạn mong muốn.
              </AppText>
              <FloatingBottomSheetInput
                key={resetKey}
                label="Viết góp ý của bạn..."
                defaultValue=""
                onChangeText={handleChangeText}
                multiline
                maxLength={FEEDBACK_MAX_LENGTH}
                accessibilityLabel="Nội dung góp ý"
                surfaceColor={c.surface}
                minHeight={140}
              />
              <AppText variant="meta" tone="muted" style={styles.lengthHint}>
                Tối thiểu {FEEDBACK_MIN_LENGTH}, tối đa {FEEDBACK_MAX_LENGTH} ký tự
              </AppText>
              {formError ? (
                <View style={[styles.errorBox, { backgroundColor: c.dangerSoft }]}>
                  <AppText variant="caption" tone="danger">{formError}</AppText>
                </View>
              ) : null}
              <Button
                variant="primary"
                size="lg"
                onPress={handleSubmit}
                isDisabled={busy || !canSubmit}
              >
                <Button.Label>{busy ? 'Đang gửi...' : 'Gửi góp ý'}</Button.Label>
              </Button>
            </View>
            </DismissKeyboardView>
          </BottomSheetView>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  header: {
    paddingVertical: 8,
  },
  body: {
    paddingTop: 8,
    gap: 12,
  },
  hint: {
    marginBottom: 2,
  },
  lengthHint: {
    textAlign: 'right',
    marginTop: -4,
  },
  errorBox: {
    padding: 12,
    borderRadius: 10,
  },
});
