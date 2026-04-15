import { Redirect } from 'expo-router';

import { useAuthStore } from '../stores/auth.store';

export default function Index() {
  const session = useAuthStore((s) => s.session);

  if (session) {
    return <Redirect href="/(main)" />;
  }
  return <Redirect href="/(auth)/login" />;
}
