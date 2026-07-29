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
  }
};
