import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Lock, X } from 'lucide-react';

interface NoteLockModalProps {
  open: boolean;
  noteTitle: string;
  isLocked: boolean;
  isUnlocked: boolean;
  onClose: () => void;
  onLock: (password: string) => Promise<void>;
  onUnlock: (password: string) => Promise<boolean>;
  onRemoveLock: (currentPassword: string) => Promise<boolean>;
  onRelock: () => void;
  testIdPrefix?: string;
}

export function NoteLockModal({
  open,
  noteTitle,
  isLocked,
  isUnlocked,
  onClose,
  onLock,
  onUnlock,
  onRemoveLock,
  onRelock,
  testIdPrefix = 'note-lock',
}: NoteLockModalProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setPassword('');
      setConfirmPassword('');
      setError(null);
      setBusy(false);
    }
  }, [open, noteTitle, isLocked, isUnlocked]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    if (!isLocked) {
      if (!password.trim()) {
        setError('enter a password');
        return;
      }
      if (password !== confirmPassword) {
        setError('passwords do not match');
        return;
      }
      setBusy(true);
      try {
        await onLock(password);
        onClose();
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!password) {
      setError('enter current password');
      return;
    }

    setBusy(true);
    try {
      const ok = isUnlocked
        ? await onRemoveLock(password)
        : await onUnlock(password);
      if (!ok) {
        setError('incorrect password');
      } else {
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="unified-note-lock-modal"
          role="dialog"
          aria-modal="true"
          aria-label={!isLocked ? 'Set note password' : isUnlocked ? 'Note lock settings' : 'Unlock note'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.56)' }}
        >
          <motion.form
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmit}
            data-testid={`${testIdPrefix}-modal`}
            className="w-full max-w-sm rounded-lg border p-5 shadow-2xl"
            style={{
              backgroundColor: 'var(--neuron-surface)',
              borderColor: 'var(--neuron-border)',
              color: 'var(--neuron-text)',
            }}
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Lock
                  size={14}
                  className="shrink-0"
                  style={{ color: 'var(--neuron-accent)' }}
                  aria-hidden="true"
                />
                <span className="truncate text-sm font-semibold lowercase">
                  {!isLocked
                    ? 'set note password'
                    : isUnlocked
                      ? 'note lock settings'
                      : 'unlock note'}
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="cursor-pointer rounded p-1 opacity-60 transition-opacity hover:opacity-100"
                style={{ color: 'var(--neuron-muted)' }}
                aria-label="Close password modal"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>

            <p
              className="mb-3 truncate text-xs"
              style={{ color: 'var(--neuron-muted)' }}
            >
              {!isLocked
                ? `choose a password for "${noteTitle}"`
                : isUnlocked
                  ? `"${noteTitle}" · enter password to remove lock`
                  : `"${noteTitle}" · enter password to unlock`}
            </p>

            {!isLocked ? (
              <div className="flex flex-col gap-2.5">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="password"
                  autoFocus
                  aria-label="Password"
                  data-testid={`${testIdPrefix}-pass-input`}
                  className="border-b bg-transparent px-1 py-1.5 text-sm outline-none transition-colors focus:border-[var(--neuron-accent)]"
                  style={{
                    borderColor: 'var(--neuron-border)',
                    color: 'var(--neuron-text)',
                  }}
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="confirm password"
                  aria-label="Confirm password"
                  data-testid={`${testIdPrefix}-confirm-input`}
                  className="border-b bg-transparent px-1 py-1.5 text-sm outline-none transition-colors focus:border-[var(--neuron-accent)]"
                  style={{
                    borderColor: 'var(--neuron-border)',
                    color: 'var(--neuron-text)',
                  }}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {isUnlocked && (
                  <button
                    type="button"
                    onClick={() => {
                      onRelock();
                      onClose();
                    }}
                    data-testid={`${testIdPrefix}-relock-btn`}
                    className="cursor-pointer rounded-md border px-3 py-1.5 text-left text-xs lowercase transition-colors hover:border-[var(--neuron-accent)]"
                    style={{
                      borderColor: 'var(--neuron-border)',
                      color: 'var(--neuron-text)',
                    }}
                  >
                    lock note now
                  </button>
                )}
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder={
                    isUnlocked
                      ? 'enter password to remove lock'
                      : 'enter password to unlock'
                  }
                  autoFocus
                  aria-label="Note password"
                  data-testid={`${testIdPrefix}-pass-input`}
                  className="border-b bg-transparent px-1 py-1.5 text-sm outline-none transition-colors focus:border-[var(--neuron-accent)]"
                  style={{
                    borderColor: 'var(--neuron-border)',
                    color: 'var(--neuron-text)',
                  }}
                />
              </div>
            )}

            {error && (
              <p
                className="mt-2.5 text-xs"
                style={{ color: 'var(--neuron-accent)' }}
                role="alert"
              >
                {error}
              </p>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="cursor-pointer rounded px-2.5 py-1 text-xs lowercase transition-opacity hover:opacity-80"
                style={{ color: 'var(--neuron-muted)' }}
              >
                cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                data-testid={`${testIdPrefix}-submit-btn`}
                className="cursor-pointer rounded-md border px-3 py-1 text-xs font-medium lowercase transition-opacity hover:opacity-85 disabled:opacity-50"
                style={{
                  borderColor: 'var(--neuron-accent)',
                  color: 'var(--neuron-accent)',
                }}
              >
                {!isLocked
                  ? 'lock'
                  : isUnlocked
                    ? 'remove lock'
                    : 'unlock'}
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
