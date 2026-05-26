(() => {
    if (window.__uiFeedbackInstalled) return;
    window.__uiFeedbackInstalled = true;

    const style = document.createElement('style');
    style.textContent = `
        .ui-toast-wrap{position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:10px}
        .ui-toast{min-width:280px;max-width:420px;background:#0f172a;color:#fff;border-radius:14px;padding:12px 14px;box-shadow:0 14px 30px rgba(15,23,42,.25);border:1px solid rgba(255,255,255,.08);opacity:0;transform:translateY(-8px);transition:.2s}
        .ui-toast.show{opacity:1;transform:translateY(0)}
        .ui-toast.success{background:linear-gradient(135deg,#047857,#0ea5a4)}
        .ui-toast.error{background:linear-gradient(135deg,#b91c1c,#ef4444)}
        .ui-toast.warn{background:linear-gradient(135deg,#92400e,#f59e0b)}
        .ui-toast .t{font-weight:800;font-size:13px;margin-bottom:2px}
        .ui-toast .m{font-size:12px;opacity:.95;line-height:1.35}
        .ui-overlay{position:fixed;inset:0;background:rgba(2,6,23,.46);backdrop-filter:blur(4px);z-index:9998;display:flex;align-items:center;justify-content:center;padding:16px}
        .ui-dialog{width:min(520px,96vw);background:#fff;border-radius:16px;border:1px solid #e2e8f0;box-shadow:0 22px 44px rgba(15,23,42,.22);overflow:hidden}
        .ui-head{padding:14px 16px;border-bottom:1px solid #f1f5f9;font-weight:800;color:#0f172a}
        .ui-body{padding:16px;color:#334155;font-size:14px;line-height:1.45}
        .ui-input{width:100%;margin-top:10px;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;outline:none}
        .ui-input:focus{border-color:#6366f1;box-shadow:0 0 0 4px rgba(99,102,241,.16)}
        .ui-foot{padding:12px 16px;border-top:1px solid #f1f5f9;display:flex;justify-content:flex-end;gap:8px}
        .ui-btn{border:0;border-radius:10px;padding:8px 14px;font-weight:700;cursor:pointer}
        .ui-btn.sub{background:#f8fafc;color:#334155;border:1px solid #e2e8f0}
        .ui-btn.main{background:linear-gradient(90deg,#4f46e5,#2563eb);color:#fff}
        .ui-legacy-backdrop{background:rgba(2,6,23,.52)!important;backdrop-filter:blur(4px)}
        .ui-legacy-panel{
            border-radius:18px!important;
            border:1px solid #e2e8f0!important;
            box-shadow:0 24px 54px rgba(15,23,42,.24)!important;
        }
        .ui-legacy-head{
            background:linear-gradient(180deg,#f8fafc 0%,#ffffff 100%)!important;
            border-bottom:1px solid #e2e8f0!important;
        }
        .ui-legacy-foot{
            background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%)!important;
            border-top:1px solid #e2e8f0!important;
        }
        .ui-legacy-modal:not(.hidden) .ui-legacy-panel{
            animation:uiLegacyIn .18s ease-out;
        }
        @keyframes uiLegacyIn{
            from{opacity:.82;transform:translateY(8px) scale(.992)}
            to{opacity:1;transform:translateY(0) scale(1)}
        }
    `;
    document.head.appendChild(style);

    const toastWrap = document.createElement('div');
    toastWrap.className = 'ui-toast-wrap';
    document.body.appendChild(toastWrap);

    function uiNotify(message, type = 'success', title = null, timeout = 2600) {
        const el = document.createElement('div');
        el.className = `ui-toast ${type}`;
        el.innerHTML = `<div class="t">${title || (type === 'error' ? 'Terjadi Masalah' : type === 'warn' ? 'Perhatian' : 'Berhasil')}</div><div class="m">${String(message || '')}</div>`;
        toastWrap.appendChild(el);
        requestAnimationFrame(() => el.classList.add('show'));
        setTimeout(() => {
            el.classList.remove('show');
            setTimeout(() => el.remove(), 220);
        }, timeout);
    }

    function openDialog({ title, message, mode = 'alert', placeholder = '', defaultValue = '' }) {
        return new Promise((resolve) => {
            const isPinPrompt = mode === 'prompt' && (
                /pin/i.test(String(title || '')) ||
                /pin/i.test(String(message || '')) ||
                String(placeholder || '').includes('######')
            );
            const overlay = document.createElement('div');
            overlay.className = 'ui-overlay';
            const box = document.createElement('div');
            box.className = 'ui-dialog';
            box.innerHTML = `
                <div class="ui-head">${title}</div>
                <div class="ui-body">
                    <div>${String(message || '')}</div>
                    ${mode === 'prompt' ? `<input class="ui-input" id="ui-dialog-input" placeholder="${placeholder || ''}" value="${defaultValue || ''}" ${isPinPrompt ? 'type="password" inputmode="numeric" maxlength="6" pattern="[0-9]*"' : 'type="text"'} />` : ''}
                </div>
                <div class="ui-foot">
                    ${mode !== 'alert' ? '<button class="ui-btn sub" data-act="cancel">Batal</button>' : ''}
                    <button class="ui-btn main" data-act="ok">OK</button>
                </div>
            `;
            overlay.appendChild(box);
            document.body.appendChild(overlay);

            const input = box.querySelector('#ui-dialog-input');
            if (input) {
                if (isPinPrompt) {
                    input.setAttribute('autocomplete', 'off');
                    input.setAttribute('autocorrect', 'off');
                    input.setAttribute('autocapitalize', 'off');
                    input.setAttribute('spellcheck', 'false');
                    input.setAttribute('name', `pin_${Date.now()}`);
                    input.setAttribute('data-lpignore', 'true');
                    input.setAttribute('data-1p-ignore', 'true');
                    input.setAttribute('data-form-type', 'other');
                }
                input.focus();
                input.select();
            }
            const close = (val) => {
                overlay.remove();
                resolve(val);
            };
            box.querySelector('[data-act="ok"]').onclick = () => {
                if (mode === 'prompt') return close(input ? input.value : '');
                if (mode === 'confirm') return close(true);
                return close(undefined);
            };
            const cancelBtn = box.querySelector('[data-act="cancel"]');
            if (cancelBtn) cancelBtn.onclick = () => close(mode === 'prompt' ? null : false);
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) close(mode === 'prompt' ? null : false);
            });
            box.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') close(mode === 'prompt' ? null : false);
                if (e.key === 'Enter' && mode !== 'alert') {
                    e.preventDefault();
                    box.querySelector('[data-act="ok"]').click();
                }
            });
        });
    }

    window.uiNotify = uiNotify;
    window.uiSuccess = (message, title = 'Berhasil', timeout = 2600) => uiNotify(message, 'success', title, timeout);
    window.uiError = (message, title = 'Terjadi Masalah', timeout = 3600) => uiNotify(message, 'error', title, timeout);
    window.uiWarn = (message, title = 'Perhatian', timeout = 3200) => uiNotify(message, 'warn', title, timeout);
    window.uiAlert = async (message, title = 'Informasi') => openDialog({ title, message, mode: 'alert' });
    window.uiConfirm = async (message, title = 'Konfirmasi') => openDialog({ title, message, mode: 'confirm' });
    window.uiPrompt = async (message, title = 'Input Diperlukan', placeholder = '', defaultValue = '') =>
        openDialog({ title, message, mode: 'prompt', placeholder, defaultValue });

    // Replace browser alert with toast notification to avoid legacy blocking popup UX.
    window.alert = function(message) {
        const text = String(message || '');
        const lower = text.toLowerCase();
        if (lower.includes('gagal') || lower.includes('error') || lower.includes('tidak bisa') || lower.includes('invalid')) {
            window.uiError(text);
            return;
        }
        if (lower.includes('berhasil') || lower.includes('sukses') || lower.includes('tersimpan') || lower.includes('ditambahkan')) {
            window.uiSuccess(text);
            return;
        }
        window.uiWarn(text, 'Informasi');
    };

    function enhanceLegacyModals() {
        const modals = document.querySelectorAll('div[id^="modal-"].fixed.inset-0');
        modals.forEach((modal) => {
            modal.classList.add('ui-legacy-modal');
            modal.querySelectorAll(':scope > .absolute.inset-0').forEach((backdrop) => {
                backdrop.classList.add('ui-legacy-backdrop');
            });
            const panel = modal.querySelector('.bg-white');
            if (panel) {
                panel.classList.add('ui-legacy-panel');
                const head = panel.querySelector(':scope > .p-5.border-b, :scope > .p-4.border-b, :scope > .p-6.border-b');
                const foot = panel.querySelector(':scope > .p-5.border-t, :scope > .p-4.border-t, :scope > .p-6.border-t');
                if (head) head.classList.add('ui-legacy-head');
                if (foot) foot.classList.add('ui-legacy-foot');
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', enhanceLegacyModals);
    } else {
        enhanceLegacyModals();
    }
})();
