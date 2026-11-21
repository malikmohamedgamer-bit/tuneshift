/** Runtime platform detection. */

export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const isIOS = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as Mac; touch points give it away.
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
};

export const isStandalonePwa = (): boolean =>
  typeof matchMedia !== 'undefined' &&
  (matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true);

export const supportsFileSystemAccess = (): boolean =>
  typeof window !== 'undefined' &&
  'showOpenFilePicker' in window &&
  'showDirectoryPicker' in window;

export const supportsOpfs = (): boolean =>
  typeof navigator !== 'undefined' && 'storage' in navigator && 'getDirectory' in navigator.storage;

export const isMobileWidth = (): boolean =>
  typeof matchMedia !== 'undefined' && matchMedia('(max-width: 767px)').matches;
