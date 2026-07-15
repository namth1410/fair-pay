// Màn cấu hình widget — chạy như 1 RN root RIÊNG (RNWidgetConfigurationActivity),
// KHÔNG có HeroUINativeProvider / stores / SafeAreaProvider. Vì vậy: RN thuần +
// tự initDatabase + tự lấy theme qua useColorScheme.

import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SectionList,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import type { WidgetConfigurationScreenProps } from 'react-native-android-widget';

import { initDatabase } from '../db/database';
import * as tripRepo from '../repositories/trip.repo';
import { getAuthUserId } from '../services/auth.helper';
import type { TripWithGroup } from '../types/database.types';
import { renderTripWidget } from './TripWidget';
import { setBinding, setSnapshot } from './widgetBridge';
import { buildTripSnapshot } from './widgetSnapshot';

const LIGHT = {
  bg: '#F7F7F7',
  card: '#FFFFFF',
  pressed: '#ECECEC',
  border: '#E4E4E7',
  textPrimary: '#18181B',
  muted: '#71717A',
  accent: '#10B981',
  overlay: 'rgba(255,255,255,0.6)',
};
const DARK = {
  bg: '#111114',
  card: '#1F1F26',
  pressed: '#2A2A33',
  border: '#2E2E36',
  textPrimary: '#FAFAFA',
  muted: '#A1A1AA',
  accent: '#34D399',
  overlay: 'rgba(0,0,0,0.5)',
};

interface Section {
  title: string;
  data: TripWithGroup[];
}

export function TripWidgetConfigScreen({
  widgetInfo,
  renderWidget,
  setResult,
}: WidgetConfigurationScreenProps) {
  const isDark = useColorScheme() === 'dark';
  const c = isDark ? DARK : LIGHT;

  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<TripWithGroup[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await initDatabase();
        const userId = await getAuthUserId();
        if (!userId) {
          if (alive) {
            setError('Bạn cần đăng nhập Fair Pay trước.');
            setLoading(false);
          }
          return;
        }
        const list = await tripRepo.listWithGroup(userId);
        if (alive) {
          setTrips(list);
          setLoading(false);
        }
      } catch {
        if (alive) {
          setError('Không tải được danh sách chuyến đi.');
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const sections = useMemo<Section[]>(() => {
    const byGroup = new Map<string, Section>();
    for (const t of trips) {
      const existing = byGroup.get(t.group_id);
      if (existing) existing.data.push(t);
      else byGroup.set(t.group_id, { title: t.group_name, data: [t] });
    }
    return [...byGroup.values()];
  }, [trips]);

  async function handlePick(tripId: string) {
    if (saving) return;
    setSaving(true);
    try {
      const snap = await buildTripSnapshot(tripId);
      await setBinding(widgetInfo.widgetId, tripId);
      if (snap) await setSnapshot(snap);
      renderWidget(renderTripWidget(snap, tripId));
      setResult('ok');
    } catch {
      setSaving(false);
      setError('Không lưu được. Thử lại nhé.');
    }
  }

  const topPad = (StatusBar.currentHeight ?? 24) + 8;

  return (
    <View style={[styles.root, { backgroundColor: c.bg, paddingTop: topPad }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.textPrimary }]}>Chọn chuyến đi</Text>
        <Pressable onPress={() => setResult('cancel')} hitSlop={12}>
          <Text style={[styles.cancel, { color: c.muted }]}>Hủy</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.msg, { color: c.muted }]}>{error}</Text>
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.msg, { color: c.muted }]}>
            Chưa có chuyến đi nào. Mở Fair Pay để tạo trước nhé.
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <Text style={[styles.section, { color: c.muted }]}>{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => handlePick(item.id)}
              disabled={saving}
              style={({ pressed }) => [
                styles.item,
                { backgroundColor: pressed ? c.pressed : c.card, borderColor: c.border },
              ]}
            >
              <Text style={[styles.itemText, { color: c.textPrimary }]} numberOfLines={1}>
                {item.name}
              </Text>
            </Pressable>
          )}
          contentContainerStyle={styles.listContent}
        />
      )}

      {saving && (
        <View style={[styles.savingOverlay, { backgroundColor: c.overlay }]}>
          <ActivityIndicator color={c.accent} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
  },
  title: { fontSize: 20, fontWeight: '700' },
  cancel: { fontSize: 16, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  msg: { textAlign: 'center', fontSize: 15 },
  section: { fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  item: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  itemText: { fontSize: 16, fontWeight: '500' },
  listContent: { paddingBottom: 24 },
  savingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
