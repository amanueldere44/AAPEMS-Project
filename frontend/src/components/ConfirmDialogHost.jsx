import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export default function ConfirmDialogHost() {
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    function openDialog(event) {
      setDialog(event.detail);
    }
    window.addEventListener('asems:confirm', openDialog);
    return () => window.removeEventListener('asems:confirm', openDialog);
  }, []);

  useEffect(() => {
    if (!dialog) return undefined;
    function onKeyDown(event) {
      if (event.key === 'Escape') finish(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // The active dialog is intentionally captured for this modal lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog]);

  function finish(confirmed) {
    if (!dialog) return;
    dialog.resolve(confirmed);
    setDialog(null);
  }

  if (!dialog) return null;
  const text = String(dialog.message || 'Are you sure?');
  const isDestructive = /delete|remove|discard|deactivate|cannot be undone/i.test(text);

  return (
    <div className="asems-confirm-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) finish(false);
    }}>
      <section className="asems-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="asems-confirm-title" aria-describedby="asems-confirm-message">
        <div className={`asems-confirm-icon ${isDestructive ? 'is-danger' : 'is-neutral'}`}>
          <AlertTriangle size={23} aria-hidden="true" />
        </div>
        <button type="button" className="asems-confirm-close" aria-label="Cancel confirmation" onClick={() => finish(false)}>
          <X size={19} aria-hidden="true" />
        </button>
        <h2 id="asems-confirm-title">{isDestructive ? 'Please confirm this action' : 'Are you sure?'}</h2>
        <p id="asems-confirm-message">{text}</p>
        <div className="asems-confirm-actions">
          <button type="button" className="asems-confirm-cancel" onClick={() => finish(false)}>Cancel</button>
          <button type="button" className={`asems-confirm-accept ${isDestructive ? 'is-danger' : ''}`} onClick={() => finish(true)}>
            {isDestructive ? 'Confirm action' : 'Continue'}
          </button>
        </div>
      </section>
    </div>
  );
}
