import { GlassCapsuleHeader } from './GlassCapsuleHeader';

// Helper render header trong từng tab screen — header thuộc scene → slide
// cùng nội dung khi đổi tab. GlassCapsuleHeader expect NativeStackHeaderProps;
// tabs không có Stack thật → fake props với route.name = routeName để
// useHeaderSlots resolve đúng (vd routeName='presets' → render nút "+").
export function TabHeader({
  routeName,
  title,
}: {
  routeName: string;
  title: string;
}) {
  const fakeProps = {
    route: { key: routeName, name: routeName, params: undefined },
    options: { title },
    navigation: undefined,
    back: undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return <GlassCapsuleHeader {...fakeProps} />;
}
