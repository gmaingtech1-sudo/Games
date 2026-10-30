// Tiny DOM helpers. h('div.cls', {attrs}, children...) builds elements
// without innerHTML, so text is always inserted safely.

export const $ = (sel, root = document) => root.querySelector(sel);

export function h(tag, attrs, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function icon(id) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', `#${id}`);
  svg.append(use);
  return svg;
}

export function toast(message, { kind = 'info', action, actionLabel, ms = 4200 } = {}) {
  const box = $('#toasts');
  const el = h(`div.toast.${kind}`, h('span', message), action ? h('button.btn.btn-small', { type: 'button', onclick: () => { action(); el.remove(); } }, actionLabel || 'OK') : null);
  box.append(el);
  while (box.children.length > 3) box.firstElementChild.remove();
  setTimeout(() => el.remove(), ms);
  return el;
}

export function formatTime(ms) {
  const d = new Date(ms);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

// In-app confirmation dialog (WebViews render window.confirm inconsistently).
// With `typed`, the user must type that word to confirm.
export function confirmDialog(message, { confirmLabel = 'Confirm', danger = false, typed = null } = {}) {
  return new Promise((resolve) => {
    const input = typed ? h('input.inline-input', { type: 'text', placeholder: `Type ${typed}`, autocomplete: 'off' }) : null;
    const ok = h(`button.btn${danger ? '.btn-danger' : '.btn-primary'}`, { type: 'button' }, confirmLabel);
    const cancel = h('button.btn', { type: 'button' }, 'Cancel');
    const modal = h('div.modal', { role: 'dialog', 'aria-modal': 'true' },
      h('div.modal-card', h('p', message), input, h('div.modal-actions', ok, cancel)));
    const close = (v) => { modal.remove(); resolve(v); };
    ok.addEventListener('click', () => {
      if (typed && input.value.trim().toUpperCase() !== typed) { input.focus(); input.style.borderColor = 'var(--danger)'; return; }
      close(true);
    });
    cancel.addEventListener('click', () => close(false));
    modal.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(false); });
    document.body.append(modal);
    (input || ok).focus();
  });
}

// Copy text using the async clipboard API, falling back to a hidden textarea.
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
