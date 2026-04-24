import { create } from 'zustand';

import type { ExpenseCategory } from '../config/constants';
import {
  createPreset,
  deletePreset,
  type ExpensePreset,
  fetchPresets,
  updatePreset,
} from '../services/preset.service';

interface PresetState {
  presets: ExpensePreset[];
  loading: boolean;
  loaded: boolean;

  loadPresets: () => Promise<void>;
  addPreset: (params: {
    title: string;
    amount: number;
    category: ExpenseCategory;
  }) => Promise<ExpensePreset>;
  editPreset: (
    id: string,
    params: {
      title: string;
      amount: number;
      category: ExpenseCategory;
    },
  ) => Promise<ExpensePreset>;
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
