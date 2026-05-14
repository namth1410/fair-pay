import { BottomSheetView } from '@gorhom/bottom-sheet';
import { BottomSheet, Button } from 'heroui-native';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';

import { TRIP_NAME_MAX_LENGTH } from '../../config/constants';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTripStore } from '../../stores/trip.store';
import { getErrorMessage } from '../../utils/error';
import { AppText, DismissKeyboardView } from '../ui';
import { FloatingBottomSheetInput } from '../ui/floating';

interface CreateTripSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  onSuccess?: (name: string) => void;
}

export function CreateTripSheet({
  isOpen,
  onOpenChange,
  groupId,
  onSuccess,
}: CreateTripSheetProps) {
  const c = useAppTheme();
  const addTrip = useTripStore((s) => s.addTrip);

  const nameRef = useRef('');
  const [resetKey, setResetKey] = useState(0);
  const [hasContent, setHasContent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    nameRef.current = '';
    setResetKey((k) => k + 1);
    setHasContent(false);
    setBusy(false);
    setFormError('');
  }, [isOpen]);

  const handleChangeText = (text: string) => {
    nameRef.current = text;
    const next = text.trim().length > 0;
    setHasContent((prev) => (prev === next ? prev : next));
  };

  const handleSubmit = async () => {
    const trimmed = nameRef.current.trim();
    if (!trimmed || busy) return;
    Keyboard.dismiss();
    setFormError('');
    setBusy(true);
    try {
      await addTrip(groupId, trimmed);
      onOpenChange(false);
      onSuccess?.(trimmed);
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
          snapPoints={['45%', '90%']}
          keyboardBehavior="extend"
          keyboardBlurBehavior="restore"
          android_keyboardInputMode="adjustResize"
        >
          <BottomSheetView style={styles.container}>
            <DismissKeyboardView>
              <View style={styles.header}>
                <BottomSheet.Title>Tạo chuyến đi mới</BottomSheet.Title>
              </View>

              <View style={styles.body}>
                <AppText variant="caption" tone="muted" style={styles.hint}>
                  Đặt tên gợi nhớ để dễ tìm trong danh sách (VD: địa điểm + thời gian).
                </AppText>
                <FloatingBottomSheetInput
                  key={resetKey}
                  label="Tên chuyến"
                  defaultValue=""
                  onChangeText={handleChangeText}
                  maxLength={TRIP_NAME_MAX_LENGTH}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                  accessibilityLabel="Tên chuyến đi"
                  surfaceColor={c.surface}
                />
                {formError ? (
                  <View style={[styles.errorBox, { backgroundColor: c.dangerSoft }]}>
                    <AppText variant="caption" tone="danger">{formError}</AppText>
                  </View>
                ) : null}
                <Button
                  variant="primary"
                  size="lg"
                  onPress={handleSubmit}
                  isDisabled={busy || !hasContent}
                >
                  <Button.Label>{busy ? 'Đang tạo...' : 'Tạo chuyến'}</Button.Label>
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
    gap: 14,
  },
  hint: {
    marginBottom: 2,
  },
  errorBox: {
    padding: 12,
    borderRadius: 10,
  },
});
