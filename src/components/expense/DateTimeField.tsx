import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import Calendar from 'lucide-react-native/dist/esm/icons/calendar';
import React, { useCallback, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { fonts } from '../../config/fonts';
import { useAppTheme } from '../../hooks/useAppTheme';
import { formatDateTimeVN } from '../../utils/format';
import { AppText } from '../ui';
import { FloatingLabelContainer } from '../ui/floating';

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
        const dateOnly = picked;
        DateTimePickerAndroid.open({
          value: dateOnly,
          mode: 'time',
          is24Hour: true,
          onChange: (evt2: DateTimePickerEvent, picked2?: Date) => {
            if (evt2.type !== 'set' || !picked2) return;
            const combined = new Date(
              dateOnly.getFullYear(),
              dateOnly.getMonth(),
              dateOnly.getDate(),
              picked2.getHours(),
              picked2.getMinutes(),
              0,
              0,
            );
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

  const formatted = formatDateTimeVN(value);

  return (
    <View>
      <FloatingLabelContainer
        label={label}
        isFocused={iosOpen}
        hasValue
        onPress={handlePress}
        accessibilityLabel={`${label}: ${formatted}`}
      >
        <View style={styles.row}>
          <Calendar size={18} color={c.muted} />
          <AppText
            variant="body"
            style={[styles.text, { color: c.foreground, fontFamily: fonts.regular }]}
          >
            {formatted}
          </AppText>
        </View>
      </FloatingLabelContainer>

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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
