// ── Modal helpers ─────────────────────────────────────────────────────────
const Modal = {
  el: null,
  box: null,
  title: null,
  body: null,
  footer: null,

  init() {
    this.el = document.getElementById('modal-overlay');
    this.box = document.getElementById('modal-box');
    this.title = document.getElementById('modal-title');
    this.body = document.getElementById('modal-body');
    this.footer = document.getElementById('modal-footer');
    document.getElementById('modal-close-btn').addEventListener('click', () => this.close());
    this.el.addEventListener('click', e => { if (e.target === this.el) this.close(); });
  },

  open({ title, body, footer = '', size = '' }) {
    this.title.textContent = title;
    this.body.innerHTML = body;
    this.footer.innerHTML = footer;
    this.box.className = 'modal-box' + (size ? ' modal-' + size : '');
    this.el.style.display = 'flex';
    // Focus first input
    const inp = this.body.querySelector('input,select,textarea');
    if (inp) setTimeout(() => inp.focus(), 50);
  },

  close() {
    this.el.style.display = 'none';
    this.body.innerHTML = '';
    this.footer.innerHTML = '';
  },

  setFooter(html) {
    this.footer.innerHTML = html;
  },

  // confirm(message, onConfirm, options)
  // options: { confirmText, confirmClass, icon }
  confirm(message, onConfirm, { confirmText = 'Confirm', confirmClass = 'btn-primary', icon = 'warning' } = {}) {
    const icons = {
      warning: `<svg viewBox="0 0 24 24" fill="currentColor" style="width:22px;height:22px;color:#f59e0b"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>`,
      danger:  `<svg viewBox="0 0 24 24" fill="currentColor" style="width:22px;height:22px;color:#ef4444"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
      info:    `<svg viewBox="0 0 24 24" fill="currentColor" style="width:22px;height:22px;color:#3b82f6"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>`,
    };
    this.open({
      title: '\u200b', // zero-width space — keeps header structure intact but visually empty
      size: 'sm',
      body: `
        <div style="display:flex;flex-direction:column;align-items:center;text-align:center;padding:0.5rem 0 0.25rem;gap:0.75rem">
          ${icons[icon] || icons.warning}
          <p style="font-size:0.92rem;color:#374151;line-height:1.55;margin:0">${message}</p>
        </div>
      `,
      footer: `
        <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
        <button class="btn ${confirmClass}" id="modal-confirm-btn">${confirmText}</button>
      `
    });

    document.getElementById('modal-confirm-btn').addEventListener('click', () => {
      this.close();
      onConfirm();
    });
  }
};
