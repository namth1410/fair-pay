import type { ToastComponentProps } from 'heroui-native';
import { Toast } from 'heroui-native';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { ToastActionHelpers, ToastVariantName } from './types';
import { TOAST_VARIANT_CONFIG } from './variantConfig';

interface DarkPillToastProps extends ToastComponentProps {
  variant: ToastVariantName;
  label: string;
  description?: string;
  icon?: ReactNode;
  actionLabel?: string;
  onActionPress?: (helpers: ToastActionHelpers) => void;
}

export function DarkPillToast(props: DarkPillToastProps) {
  const {
    variant,
    label,
    description,
    icon,
    actionLabel,
    onActionPress,
    id,
    hide,
    ...toastComponentProps
  } = props;

  const { circleBg, Icon } = TOAST_VARIANT_CONFIG[variant];
  const renderedIcon = icon ?? <Icon size={18} color="#fff" />;

  const handleActionPress = () => {
    onActionPress?.({ hide: () => hide(id) });
  };

  return (
    <Toast
      id={id}
      hide={hide}
      {...toastComponentProps}
      isAnimatedStyleActive
      className="bg-neutral-900 rounded-2xl px-4 py-3 shadow-lg border border-white/5"
    >
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        className="flex-row items-center gap-3"
      >
        <View
          className="w-8 h-8 rounded-full items-center justify-center"
          style={{ backgroundColor: circleBg }}
        >
          {renderedIcon}
        </View>

        <View className="flex-1 min-w-0">
          <Text
            className="text-white font-semibold text-[15px]"
            numberOfLines={2}
          >
            {label}
          </Text>
          {description ? (
            <Text
              className="text-white/70 text-[13px] mt-0.5"
              numberOfLines={3}
            >
              {description}
            </Text>
          ) : null}
        </View>

        {actionLabel ? (
          <Pressable
            onPress={handleActionPress}
            className="px-2 py-1 rounded-lg"
            hitSlop={8}
          >
            <Text className="text-blue-400 font-semibold text-[14px]">
              {actionLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Toast>
  );
}
