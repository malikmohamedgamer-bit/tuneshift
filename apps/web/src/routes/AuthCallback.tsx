import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { LoaderCircle } from 'lucide-react';
import { ErrorState } from '../components/common';
import { completeAuthFromUrl } from '../lib/social';

/** Magic-link / email-confirmation landing page (web + installed PWA). */
export function AuthCallback() {
  const nav = useNavigate();
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    void completeAuthFromUrl(window.location.href)
      .then(() => nav('/friends', { replace: true }))
      .catch(setError);
  }, [nav]);
  if (error)
    return (
      <ErrorState
        title="Sign-in didn't finish"
        error={error}
        onRetry={() => void nav('/friends')}
      />
    );
  return (
    <div className="flex items-center justify-center gap-2 py-24 text-muted" role="status">
      <LoaderCircle className="animate-spin" /> Signing you in…
    </div>
  );
}
