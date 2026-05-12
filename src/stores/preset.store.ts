import { create } from 'zustand';

import {
  createPreset,
  deletePreset,
  type ExpensePreset,
  fetchPresets,
  type PresetCreateParams,
  updatePreset,
} from '../services/preset.service';

interface PresetState {
  presets: ExpensePreset[];
  loading: boolean;
  loaded: boolean;

  loadPresets: () => Promise<void>;
  addPreset: (params: PresetCreateParams) => Promise<ExpensePreset>;
  editPreset: (id: string, params: PresetCreateParams) => Promise<ExpensePreset>;
  removePreset: (id: string) => Promise<void>;
  reset: () => void;
}

export const usePresetStore = create<PresetState>((set, get) => ({
  presets: [],
  loading: false,
  loaded: false,

  loadPresets: async () => {
    set({ loading: true });
    try {
      const presets = await fetchPresets();
      set({ presets, loaded: true });
    } finally {
      set({ loading: false });
    }
  },

  addPreset: async (params) => {
    const preset = await createPreset(params);
    set({ presets: [preset, ...get().presets] });
    return preset;
  },

  editPreset: async (id, params) => {
    const updated = await updatePreset(id, params);
    set({
      presets: [updated, ...get().presets.filter((p) => p.id !== id)],
    });
    return updated;
  },

  removePreset: async (id) => {
    await deletePreset(id);
    set({ presets: get().presets.filter((p) => p.id !== id) });
  },

  reset: () => set({ presets: [], loaded: false }),
}));

/**
 * Filter + sort presets theo context navigation.
 *  - Home (tripId=null): hiện ALL preset, sort trip-pinned (recent) > global.
 *  - In-trip (tripId=X): hiện CHỈ global + trip-pinned-của-X. Sort trip-pinned-X > global.
 *
 * Selector này là pure function, dễ test. Component gọi:
 *   const presets = usePresetStore((s) => getPresetsForContext(s.presets, { tripId }));
 */
export function getPresetsForContext(
  allPresets: ExpensePreset[],
  ctx: { tripId?: string | null },
): ExpensePreset[] {
  const tripId = ctx.tripId ?? null;

  const filtered = allPresets.filter((p) => {
    if (p.trip_id === null) return true; // global luôn hiện
    if (tripId === null) return true; // home: hiện cả trip-pinned khác
    return p.trip_id === tripId; // in-trip: chỉ preset của trip này
  });

  return filtered.slice().sort((a, b) => {
    const aIsContext = tripId !== null && a.trip_id === tripId;
    const bIsContext = tripId !== null && b.trip_id === tripId;
    if (aIsContext !== bIsContext) return aIsContext ? -1 : 1;

    const aPinned = a.trip_id !== null;
    const bPinned = b.trip_id !== null;
    if (aPinned !== bPinned) return aPinned ? -1 : 1;

    return b.updated_at.localeCompare(a.updated_at);
  });
}
