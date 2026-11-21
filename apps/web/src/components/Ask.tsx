import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { Button } from '@tuneshift/ui';
import { Modal } from './Modal';

/**
 * In-app replacements for window.prompt/confirm (accessible, themed, non-blocking).
 * `askText(...)` and `confirmAction(...)` resolve when the user answers.
 */

interface TextRequest {
  kind: 'text';
  title: string;
  label: string;
  placeholder?: string;
  initial?: string;
  inputMode?: 'text' | 'numeric';
  validate?: (v: string) => string | null;
  resolve: (v: string | null) => void;
}

interface ConfirmRequest {
  kind: 'confirm';
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  resolve: (v: boolean) => void;
}

const useAsk = create<{ req: TextRequest | ConfirmRequest | null }>(() => ({ req: null }));

export function askText(opts: Omit<TextRequest, 'kind' | 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => useAsk.setState({ req: { ...opts, kind: 'text', resolve } }));
}

export function confirmAction(opts: Omit<ConfirmRequest, 'kind' | 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => useAsk.setState({ req: { ...opts, kind: 'confirm', resolve } }));
}

export function AskHost() {
  const req = useAsk((s) => s.req);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setValue(req?.kind === 'text' ? (req.initial ?? '') : '');
    setError(null);
  }, [req]);
  if (!req) return null;
  const close = (answer: string | null | boolean) => {
    useAsk.setState({ req: null });
    if (req.kind === 'text') req.resolve(typeof answer === 'string' ? answer : null);
    else req.resolve(answer === true);
  };
  if (req.kind === 'confirm') {
    return (
      <Modal
        open
        onOpenChange={(o) => !o && close(false)}
        title={req.title}
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button
              variant={req.danger ? 'danger' : 'primary'}
              onClick={() => close(true)}
              autoFocus
            >
              {req.confirmLabel}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">{req.body}</p>
      </Modal>
    );
  }
  const submit = () => {
    const err = req.validate?.(value) ?? null;
    if (err) {
      setError(err);
      return;
    }
    close(value);
  };
  return (
    <Modal
      open
      onOpenChange={(o) => !o && close(null)}
      title={req.title}
      footer={
        <>
          <Button variant="ghost" onClick={() => close(null)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!value.trim()}>
            OK
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="block text-sm font-semibold">
          {req.label}
          <input
            autoFocus
            value={value}
            inputMode={req.inputMode}
            placeholder={req.placeholder}
            onChange={(e) => (setValue(e.target.value), setError(null))}
            aria-invalid={Boolean(error)}
            className="mt-1 h-11 w-full rounded-ctl border border-line bg-bg px-3 text-sm font-normal"
          />
        </label>
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-300">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
