import { useEffect, useState } from 'react';
import { onToast } from '../utils/toast';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

let toastId = 1;

const toastIcons = {
  success: CheckCircle2,
  error: XCircle,
  warn: AlertTriangle,
  info: Info
};

export default function ToastHost() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const off = onToast((payload) => {
      const id = toastId++;
      const item = { id, ...payload };
      setItems((prev) => [...prev, item]);
      setTimeout(() => {
        setItems((prev) => prev.filter((it) => it.id !== id));
      }, 4200);
    });
    return () => off();
  }, []);

  const remove = (id) => setItems((prev) => prev.filter((it) => it.id !== id));

  return (
    <div className="toast-host">
      {items.map((item) => {
        const type = item.type || 'info';
        const IconComponent = toastIcons[type] || Info;

        return (
          <div key={item.id} className={`toast toast-${type}`}>
            <div className="toast-icon">
              <IconComponent size={24} />
            </div>
            <div className="toast-content">
              <div className="toast-title">{item.message || 'Notifikasi'}</div>
              {item.description && <div className="toast-desc">{item.description}</div>}
            </div>
            <button className="toast-close" onClick={() => remove(item.id)} aria-label="Tutup">
              <X size={16} />
            </button>
            <div className="toast-progress" />
          </div>
        );
      })}
    </div>
  );
}
