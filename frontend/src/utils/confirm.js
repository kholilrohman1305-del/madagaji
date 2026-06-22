const CONFIRM_EVENT = 'app-confirm';
const CONFIRM_RESOLVE = 'app-confirm-resolve';

let _resolve = null;

export function showConfirm(options) {
  return new Promise((resolve) => {
    _resolve = resolve;
    window.dispatchEvent(new CustomEvent(CONFIRM_EVENT, { detail: options }));
  });
}

export function resolveConfirm(value) {
  if (_resolve) {
    _resolve(value);
    _resolve = null;
  }
}

export function onConfirmRequest(handler) {
  const listener = (e) => handler(e.detail);
  window.addEventListener(CONFIRM_EVENT, listener);
  return () => window.removeEventListener(CONFIRM_EVENT, listener);
}
