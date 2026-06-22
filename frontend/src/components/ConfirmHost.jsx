import { useState, useEffect } from 'react';
import { onConfirmRequest, resolveConfirm } from '../utils/confirm';
import { AlertTriangle, Trash2, Info } from 'lucide-react';

export default function ConfirmHost() {
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    return onConfirmRequest((opts) => setDialog(opts));
  }, []);

  if (!dialog) return null;

  const { title, message, confirmLabel = 'Ya, Lanjutkan', cancelLabel = 'Batal', danger = false, icon } = dialog;

  const handle = (value) => {
    setDialog(null);
    resolveConfirm(value);
  };

  const Icon = icon === 'trash' ? Trash2 : danger ? AlertTriangle : Info;
  const iconBg = danger ? '#fee2e2' : '#eff6ff';
  const iconColor = danger ? '#dc2626' : '#2563eb';
  const confirmBg = danger ? 'linear-gradient(135deg,#ef4444,#dc2626)' : 'linear-gradient(135deg,#3b82f6,#2563eb)';

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        animation: 'fadeIn 0.18s ease'
      }}
      onClick={(e) => { if (e.target === e.currentTarget) handle(false); }}
    >
      <div style={{
        background: '#fff', borderRadius: 20, padding: '32px 28px',
        width: '100%', maxWidth: 420,
        boxShadow: '0 25px 60px rgba(0,0,0,.2), 0 8px 24px rgba(0,0,0,.12)',
        border: '1px solid rgba(255,255,255,.6)',
        animation: 'slideUp 0.25s cubic-bezier(0.16,1,0.3,1)'
      }}>
        {/* Icon */}
        <div style={{
          width: 52, height: 52, borderRadius: 14, background: iconBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 18
        }}>
          <Icon size={26} color={iconColor} strokeWidth={2} />
        </div>

        {/* Title */}
        {title && (
          <div style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
            {title}
          </div>
        )}

        {/* Message */}
        <div style={{ fontSize: 14, color: '#475569', lineHeight: 1.6, marginBottom: 24 }}>
          {message}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={() => handle(false)}
            style={{
              padding: '9px 20px', borderRadius: 10, border: '1.5px solid #e2e8f0',
              background: '#f8fafc', color: '#475569', fontWeight: 600, fontSize: 14,
              cursor: 'pointer', transition: 'all 0.15s'
            }}
            onMouseEnter={e => e.target.style.background = '#f1f5f9'}
            onMouseLeave={e => e.target.style.background = '#f8fafc'}
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => handle(true)}
            style={{
              padding: '9px 20px', borderRadius: 10, border: 'none',
              background: confirmBg, color: '#fff', fontWeight: 600, fontSize: 14,
              cursor: 'pointer', boxShadow: danger ? '0 4px 14px rgba(220,38,38,.35)' : '0 4px 14px rgba(37,99,235,.3)',
              transition: 'all 0.15s'
            }}
            onMouseEnter={e => { e.target.style.opacity = '0.9'; e.target.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.target.style.opacity = '1'; e.target.style.transform = 'translateY(0)'; }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
