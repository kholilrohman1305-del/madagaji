const TOAST_EVENT = 'app-toast';

const emit = (detail) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail }));
};

export const toast = {
  success: (message, description) => emit({ type: 'success', message, description }),
  error: (message, description) => emit({ type: 'error', message, description }),
  info: (message, description) => emit({ type: 'info', message, description }),
  warn: (message, description) => emit({ type: 'warn', message, description })
};

export const onToast = (handler) => {
  const listener = (event) => handler(event.detail);
  window.addEventListener(TOAST_EVENT, listener);
  return () => window.removeEventListener(TOAST_EVENT, listener);
};
