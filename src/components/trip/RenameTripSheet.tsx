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

interface RenameTripSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  currentName: string;
  onSuccess?: () => void;
}

export function RenameTripSheet({
  isOpen,
  onOpenChange,
  tripId,
  currentName,
  onSuccess,
}: RenameTripSheetProps) {
  const c = useAppTheme();
  const renameTrip = useTripStore((s) => s.renameTrip);

  const nameRef = useRef(currentName);
  const [resetKey, setResetKey] = useState(0);
  const [hasChange, setHasChange] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    nameRef.current = currentName;
    setResetKey((k) => k + 1);
    setHasChange(false);
    setBusy(false);
    setFormError('');
  }, [isOpen, currentName]);

  const handleChangeText = (text: string) => {
    nameRef.current = text;
    const trimmed = text.trim();
    const next = trimmed.length > 0 && trimmed !== currentName.trim();
    setHasChange((prev) => (prev === next ? prev : next));
  };

  const handleSubmit = async () => {
    const trimmed = nameRef.current.trim();
    if (!trimmed || busy) return;
    if (trimmed === currentName.trim()) {
      onOpenChange(false);
      return;
    }
    Keyboard.dismiss();
    setFormError('');
    setBusy(true);
    try {
      await renameTrip(tripId, trimmed);
      onOpenChange(false);
      onSuccess?.();
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
              <BottomSheet.Title>Đổi tên chuyến đi</BottomSheet.Title>
            </View>

            <View style={styles.body}>
              <AppText variant="caption" tone="muted" style={styles.hint}>
                Tên mới sẽ hiển thị ở danh sách nhóm và mọi nơi liên quan đến chuyến đi.
              </AppText>
              <FloatingBottomSheetInput
                key={resetKey}
                label="Tên chuyến đi"
                defaultValue={currentName}
                onChangeText={handleChangeText}
                maxLength={TRIP_NAME_MAX_LENGTH}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
                accessibilityLabel="Tên chuyến đi mới"
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
                isDisabled={busy || !hasChange}
              >
                <Button.Label>{busy ? 'Đang lưu...' : 'Lưu tên mới'}</Button.Label>
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
