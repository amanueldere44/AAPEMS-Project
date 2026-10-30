import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, LoaderCircle, Trash2, X } from 'lucide-react';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);
  const [busy, setBusy] = useState(false);

  const confirm = useCallback((options = {}) => new Promise((resolve) => {
    setRequest({
      title: options.title || 'Confirm this action',
      message: options.message || 'Are you sure you want to continue?',
      itemName: options.itemName || '',
      confirmLabel: options.confirmLabel || 'Confirm',
      danger: options.danger !== false,
      resolve,
    });
  }), []);

  const settle = useCallback((result) => {
    if (!request) return;
    request.resolve(result);
    setRequest(null);
    setBusy(false);
  }, [request]);

  useEffect(() => {
    const previous = window.asemsConfirm;
    window.asemsConfirm = confirm;
    return () => {
      if (window.asemsConfirm === confirm) {
        if (previous) window.asemsConfirm = previous;
        else delete window.asemsConfirm;
      }
    };
  }, [confirm]);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {request && (
        <div className="asems-confirm-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busy) settle(false);
        }}>
          <section className="asems-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="asems-confirm-title" aria-describedby="asems-confirm-message">
            <button type="button" className="asems-confirm-close" onClick={() => settle(false)} disabled={busy} aria-label="Close confirmation"><X size={18} /></button>
            <div className={`asems-confirm-icon ${request.danger ? '' : 'asems-confirm-icon-neutral'}`}><AlertTriangle size={25} /></div>
            <h2 id="asems-confirm-title">{request.title}</h2>
            <p id="asems-confirm-message">{request.message}</p>
            {request.itemName ? <div className="asems-confirm-item">{request.itemName}</div> : null}
            <div className="asems-confirm-actions">
              <button type="button" className="asems-confirm-cancel" onClick={() => settle(false)} disabled={busy}>Cancel</button>
              <button type="button" className={request.danger ? 'asems-confirm-delete' : 'asems-confirm-primary'} onClick={() => settle(true)} disabled={busy}>
                {busy ? <LoaderCircle size={16} className="animate-spin" /> : request.danger ? <Trash2 size={16} /> : null}
                {request.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error('useConfirm must be used inside ConfirmProvider');
  return context.confirm;
}
