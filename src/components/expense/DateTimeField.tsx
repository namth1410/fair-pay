import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Calendar } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { fonts } from '../../config/fonts';
import { useAppTheme } from '../../hooks/useAppTheme';
import { formatDateTimeVN } from '../../utils/format';
import { AppText } from '../ui';

interface DateTimeFieldProps {
  value: Date;
  onChange: (d: Date) => void;
  maxDate?: Date;
  label?: string;
}

export function DateTimeField({
  value,
  onChange,
  maxDate,
  label = 'Ngày & giờ',
}: DateTimeFieldProps) {
  const c = useAppTheme();
  const [iosOpen, setIosOpen] = useState(false);

  const openAndroidPicker = useCallback(() => {
    DateTimePickerAndroid.open({
      value,
      mode: 'date',
      maximumDate: maxDate,
      onChange: (event: DateTimePickerEvent, picked?: Date) => {
        if (event.type !== 'set' || !picked) return;
        // Bước 2: chọn giờ. Giữ ngày vừa pick, mặc định giờ = giờ trong `value` cũ.
        const dateOnly = picked;
        DateTimePickerAndroid.open({
          value: dateOnly,
          mode: 'time',
          is24Hour: true,
          onChange: (evt2: DateTimePickerEvent, picked2?: Date) => {
            if (evt2.type !== 'set' || !picked2) return;
            // Combine date từ bước 1 + giờ/phút từ bước 2
            const combined = new Date(
              dateOnly.getFullYear(),
              dateOnly.getMonth(),
              dateOnly.getDate(),
              picked2.getHours(),
              picked2.getMinutes(),
              0,
              0,
            );
            // Clamp về maxDate nếu vượt
            if (maxDate && combined.getTime() > maxDate.getTime()) {
              onChange(maxDate);
            } else {
              onChange(combined);
            }
          },
        });
      },
    });
  }, [value, maxDate, onChange]);

  const handlePress = useCallback(() => {
    if (Platform.OS === 'ios') {
      setIosOpen(true);
    } else {
      openAndroidPicker();
    }
  }, [openAndroidPicker]);

  const handleIosChange = useCallback(
    (_event: DateTimePickerEvent, picked?: Date) => {
      if (!picked) return;
      if (maxDate && picked.getTime() > maxDate.getTime()) {
        onChange(maxDate);
      } else {
        onChange(picked);
      }
    },
    [maxDate, onChange],
  );

  return (
    <View>
      <AppText variant="meta" tone="muted" style={styles.label}>
        {label}
      </AppText>
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${formatDateTimeVN(value)}`}
        style={({ pressed }) => [
          styles.field,
          {
            borderColor: c.divider,
            backgroundColor: c.surface,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Calendar size={18} color={c.muted} />
        <AppText
          variant="body"
          style={[styles.text, { color: c.foreground, fontFamily: fonts.regular }]}
        >
          {formatDateTimeVN(value)}
        </AppText>
      </Pressable>

      {Platform.OS === 'ios' && iosOpen ? (
        <Modal
          transparent
          animationType="fade"
          visible={iosOpen}
          onRequestClose={() => setIosOpen(false)}
        >
          <Pressable style={styles.iosBackdrop} onPress={() => setIosOpen(false)}>
            <Pressable
              style={[styles.iosSheet, { backgroundColor: c.surface }]}
              onPress={(e) => e.stopPropagation()}
            >
              <DateTimePicker
                value={value}
                mode="datetime"
                display="inline"
                maximumDate={maxDate}
                onChange={handleIosChange}
                themeVariant={c.isDark ? 'dark' : 'light'}
              />
              <Pressable
                style={[styles.iosDone, { backgroundColor: c.primary }]}
                onPress={() => setIosOpen(false)}
              >
                <AppText variant="body" weight="semibold" style={{ color: c.inverseForeground }}>
                  Xong
                </AppText>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    marginTop: 4,
    marginBottom: 4,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
  },
  text: {
    fontSize: 15,
  },
  iosBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  iosSheet: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  iosDone: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
  },
});
