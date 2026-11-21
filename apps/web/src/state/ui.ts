import { create } from 'zustand';
import type { Track } from '@tuneshift/core';

export type NowTab = 'queue' | 'lyrics' | 'info';

export interface AssignTarget {
  kind: 'track' | 'playlist';
  id: string;
  name: string;
}

interface UiState {
  nowPanelOpen: boolean;
  nowTab: NowTab;
  fullPlayer: boolean;
  commandOpen: boolean;
  cheatSheetOpen: boolean;
  versionsFor: Track | null;
  assignFor: AssignTarget | null;
  exportFor: Track | null;
  addToPlaylist: Track[] | null;
  shareFor: { kind: 'sound' | 'playlist' | 'theme'; id: string } | null;
  set: (patch: Partial<Omit<UiState, 'set'>>) => void;
}

export const useUi = create<UiState>((set) => ({
  nowPanelOpen: true,
  nowTab: 'queue',
  fullPlayer: false,
  commandOpen: false,
  cheatSheetOpen: false,
  versionsFor: null,
  assignFor: null,
  exportFor: null,
  addToPlaylist: null,
  shareFor: null,
  set: (patch) => set(patch),
}));

export const ui = () => useUi.getState();
