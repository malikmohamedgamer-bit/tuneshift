/** Lets non-React code (deep links, tray commands) navigate the app router. */
type Navigate = (to: string) => void;

let navigate: Navigate | null = null;
let pending: string | null = null;

export function setNavigator(fn: Navigate): void {
  navigate = fn;
  if (pending) {
    fn(pending);
    pending = null;
  }
}

export function navigateTo(to: string): void {
  if (navigate) navigate(to);
  else pending = to;
}
