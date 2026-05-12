import { useLocalSearchParams } from 'expo-router';

import { PresetFormScreen } from '../../components/preset/PresetFormScreen';

export default function PresetFormRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <PresetFormScreen presetId={id} />;
}
