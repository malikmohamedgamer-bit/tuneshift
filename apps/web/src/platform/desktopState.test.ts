import { describe, expect, it } from 'vitest';
import { toAccelerator } from './desktopState';

describe('toAccelerator', () => {
  it('maps settings combos to Tauri accelerators', () => {
    expect(toAccelerator('Ctrl+Alt+Right')).toBe('CommandOrControl+Alt+ArrowRight');
    expect(toAccelerator('Ctrl+Alt+left')).toBe('CommandOrControl+Alt+ArrowLeft');
    expect(toAccelerator('Ctrl+Shift+m')).toBe('CommandOrControl+Shift+M');
    expect(toAccelerator('Ctrl + Alt + Space')).toBe('CommandOrControl+Alt+Space');
    expect(toAccelerator('MediaPlayPause')).toBe('MediaPlayPause');
  });
});
