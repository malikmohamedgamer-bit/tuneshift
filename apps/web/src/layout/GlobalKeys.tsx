import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { presetSettings, SOUND_PRESETS } from '@tuneshift/core';
import { toast } from 'sonner';
import { player } from '../player/controller';
import { getPlayer } from '../state/player';
import { useSettings } from '../state/settings';
import { useUi } from '../state/ui';
import { toggleLike } from '../db/library';
import { comboFromEvent, effectiveShortcuts, isTypingTarget } from '../lib/shortcuts';

/** Global keyboard shortcuts (configurable). Never steals keys from text fields or sliders. */
export function GlobalKeys() {
  const nav = useNavigate();
  const overrides = useSettings((s) => s.shortcuts);
  useEffect(() => {
    const map = effectiveShortcuts(overrides);
    const onDown = (e: KeyboardEvent) => {
      const combo = comboFromEvent(e);
      const def = map.get(combo);
      if (!def) return;
      const typing = isTypingTarget(e.target);
      if (typing && def.id !== 'palette') return;
      const t = e.target as HTMLElement | null;
      const interactive = t?.closest(
        'button, a, [role="slider"], input[type="range"], [role="menuitem"], [role="tab"], [role="option"]',
      );
      if (
        interactive &&
        ['playPause', 'seekBack', 'seekForward', 'volUp', 'volDown'].includes(def.id)
      )
        return;
      if (
        document.querySelector('[role="dialog"][data-state="open"], [cmdk-root]') &&
        def.id !== 'palette'
      )
        return;
      e.preventDefault();
      const ui = useUi.getState();
      const st = useSettings.getState();
      switch (def.id) {
        case 'playPause':
          void player.togglePlay();
          break;
        case 'seekBack':
          player.seekBy(-5);
          break;
        case 'seekForward':
          player.seekBy(5);
          break;
        case 'prev':
          void player.prev();
          break;
        case 'next':
          void player.next();
          break;
        case 'volUp':
          st.set({ volume: Math.min(1, st.volume + 0.05), muted: false });
          break;
        case 'volDown':
          st.set({ volume: Math.max(0, st.volume - 0.05) });
          break;
        case 'mute':
          st.set({ muted: !st.muted });
          break;
        case 'like': {
          const c = getPlayer().current;
          if (c)
            void toggleLike(c).then((on) =>
              toast.success(on ? 'Liked' : 'Removed from Liked songs'),
            );
          break;
        }
        case 'shuffle':
          player.toggleShuffle();
          break;
        case 'repeat':
          player.setRepeatMode();
          break;
        case 'search':
          void nav('/search');
          setTimeout(() => document.getElementById('search-input')?.focus(), 50);
          break;
        case 'palette':
          ui.set({ commandOpen: !ui.commandOpen });
          break;
        case 'lab':
          void nav('/lab');
          break;
        case 'compare':
          if (!e.repeat) player.setCompare(true);
          break;
        case 'fullscreen':
          ui.set({ fullPlayer: !ui.fullPlayer });
          break;
        case 'lyrics':
          ui.set({ nowPanelOpen: true, nowTab: 'lyrics' });
          if (window.matchMedia('(max-width: 1279px)').matches) void nav('/lyrics');
          break;
        case 'cheatsheet':
          ui.set({ cheatSheetOpen: true });
          break;
        default:
          if (def.id.startsWith('preset')) {
            const p = SOUND_PRESETS[Number(def.id.slice(6)) - 1];
            if (p) {
              player.applySound(presetSettings(p.id), { kind: 'preset', id: p.id }, p.name);
              toast.message(`Sound: ${p.name}`);
            }
          }
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const def = map.get(comboFromEvent(e));
      if (def?.id === 'compare') player.setCompare(false);
    };
    const onBlur = () => player.setCompare(false);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [nav, overrides]);
  return null;
}
