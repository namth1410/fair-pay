import { BottomSheetTextInput, BottomSheetView } from '@gorhom/bottom-sheet';
import { BottomSheet, Button, useToast } from 'heroui-native';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import {
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_MIN_LENGTH,
  sanitizeFeedback,
  submitFeedback,
} from '../../services/feedback.service';
import { getErrorMessage } from '../../utils/error';
import { AppText } from '../ui';

interface FeedbackSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FeedbackSheet({ isOpen, onOpenChange }: FeedbackSheetProps) {
  const c = useAppTheme();
  const { toast } = useToast();

  const messageRef = useRef('');
  const [resetKey, setResetKey] = useState(0);
  const [showInput, setShowInput] = useState(false);
  const [canSubmit, setCanSubmit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setShowInput(false);
      return;
    }
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
    setFormError('');
    setBusy(true);
    try {
      await submitFeedback(messageRef.current);
      onOpenChange(false);
      toast.show({
        variant: 'success',
        label: 'Đã gửi góp ý',
        description: 'Cảm ơn bạn rất nhiều!',
      });
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
          onChange={(index) => setShowInput(index >= 0)}
        >
          <BottomSheetView style={styles.container}>
            <View style={styles.header}>
              <BottomSheet.Title>Gửi góp ý</BottomSheet.Title>
            </View>

            <View style={styles.body}>
              <AppText variant="caption" tone="muted" style={styles.hint}>
                Mọi phản hồi của bạn đều giúp app tốt hơn. Hãy chia sẻ những gì bạn thấy chưa ổn hoặc tính năng bạn mong muốn.
              </AppText>
              {showInput ? (
                <BottomSheetTextInput
                  key={resetKey}
                  placeholder="Viết góp ý của bạn..."
                  placeholderTextColor={c.muted}
                  defaultValue=""
                  onChangeText={handleChangeText}
                  multiline
                  maxLength={FEEDBACK_MAX_LENGTH}
                  textAlignVertical="top"
                  accessibilityLabel="Nội dung góp ý"
                  style={[
                    styles.input,
                    {
                      color: c.foreground,
                      backgroundColor: c.surfaceAlt,
                      borderColor: c.divider,
                    },
                  ]}
                />
              ) : (
                <View
                  style={[
                    styles.input,
                    {
                      backgroundColor: c.surfaceAlt,
                      borderColor: c.divider,
                    },
                  ]}
                />
              )}
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
  input: {
    minHeight: 140,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
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
