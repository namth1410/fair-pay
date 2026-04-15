import { Skeleton } from 'heroui-native';
import { View } from 'react-native';

interface ListSkeletonProps {
  count?: number;
}

export function ListSkeleton({ count = 3 }: ListSkeletonProps) {
  return (
    <View className="px-4 gap-2 pt-2">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </View>
  );
}
