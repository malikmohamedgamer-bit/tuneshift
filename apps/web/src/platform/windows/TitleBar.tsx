import { useEffect, useState } from 'react';
import { Copy, Minus, PictureInPicture2, Square, X } from 'lucide-react';
import { tauriInvoke } from '../tauriBridge';

const btn =
  'grid h-9 w-11 place-items-center text-muted transition hover:bg-surface-hover hover:text-fg';

/** Custom title bar for the frameless main window (drag region + min/max/close). */
export function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    let off: (() => void) | undefined;
    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const w = getCurrentWindow();
      setMaximized(await w.isMaximized());
      off = await w.onResized(() => void w.isMaximized().then(setMaximized));
    });
    return () => off?.();
  }, []);
  const win = async () => (await import('@tauri-apps/api/window')).getCurrentWindow();
  return (
    <div className="flex h-9 shrink-0 select-none items-center bg-bg" data-tauri-drag-region>
      <img
        src={`${import.meta.env.BASE_URL}favicon.svg`}
        alt=""
        className="pointer-events-none ml-3 h-4 w-4"
      />
      <span className="pointer-events-none ml-2 text-xs font-semibold text-muted">Tuneshift</span>
      <div className="flex-1" data-tauri-drag-region />
      <button
        type="button"
        className={btn}
        aria-label="Toggle mini player"
        title="Mini player (Ctrl+Alt+M)"
        onClick={() => void tauriInvoke('toggle_window', { label: 'mini' })}
      >
        <PictureInPicture2 size={15} />
      </button>
      <button
        type="button"
        className={btn}
        aria-label="Minimise"
        onClick={() => void win().then((w) => w.minimize())}
      >
        <Minus size={16} />
      </button>
      <button
        type="button"
        className={btn}
        aria-label={maximized ? 'Restore' : 'Maximise'}
        onClick={() => void win().then((w) => w.toggleMaximize())}
      >
        {maximized ? <Copy size={13} /> : <Square size={13} />}
      </button>
      <button
        type="button"
        className={`${btn} hover:bg-red-600 hover:text-white`}
        aria-label="Close"
        onClick={() => void win().then((w) => w.close())}
      >
        <X size={16} />
      </button>
    </div>
  );
}
