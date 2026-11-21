import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { Button } from '@tuneshift/ui';
import { AlertTriangle } from 'lucide-react';

/** Router-level error element (every route has one — spec §0.1.6). */
export function RouteError() {
  const err = useRouteError();
  const notFound = isRouteErrorResponse(err) && err.status === 404;
  const message = isRouteErrorResponse(err)
    ? `${err.status} ${err.statusText}`
    : err instanceof Error
      ? err.message
      : 'Unknown error';
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-lg flex-col items-center gap-4 px-6 py-16 text-center"
    >
      <AlertTriangle size={36} className="text-amber-400" aria-hidden="true" />
      <h1 className="font-display text-2xl font-bold">
        {notFound ? 'Page not found' : 'This screen crashed'}
      </h1>
      <p className="text-sm text-muted">
        {notFound ? "There's nothing at this address." : message}
      </p>
      <div className="flex gap-2">
        <Button variant="primary" onClick={() => window.location.reload()}>
          Reload
        </Button>
        <Link
          to="/"
          className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm font-semibold hover:bg-surface-hover"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

/** Unknown paths render inside the shell (navigation stays usable). */
export function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-6 py-16 text-center">
      <h1 className="font-display text-2xl font-bold">Page not found</h1>
      <p className="text-sm text-muted">There&apos;s nothing at this address.</p>
      <Link
        to="/"
        className="inline-flex h-10 items-center rounded-full bg-accent-fill px-5 text-sm font-semibold text-on-accent"
      >
        Go home
      </Link>
    </div>
  );
}

/** Component-level boundary for widgets that must not take the page down. */
export class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode; name?: string },
  { error: Error | null }
> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.name ?? 'boundary'}]`, error, info.componentStack);
  }
  override render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div role="alert" className="rounded-card border border-red-500/30 p-4 text-sm">
            <p className="font-semibold">Something went wrong here.</p>
            <p className="text-muted">{this.state.error.message}</p>
            <Button size="sm" className="mt-2" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
