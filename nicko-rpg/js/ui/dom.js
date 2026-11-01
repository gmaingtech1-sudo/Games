// Shared UI helpers: element creation, screens, toasts, banners, modals,
// confirmation dialogs, tooltips and a re-entry guard against rapid clicks.

import { escapeHtml } from '../utils.js';
import { sfx } from '../audio.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export { escapeHtml as esc };

export function html(strings, ...vals) {
  // Tagged template: values are escaped unless wrapped with raw().
  return strings.reduce((out, s, i) => {
    const v = vals[i - 1];
    const val = v && v.__raw ? v.html : Array.isArray(v) ? v.map((x) => (x && x.__raw ? x.html : escapeHtml(x))).join('') : escapeHtml(v ?? '');
    return out + val + s;
  });
}
export const raw = (h) => ({ __raw: true, html: String(h ?? '') });

let currentScreen = null;
const screenHooks = {};
export function onScreen(id, fn) { screenHooks[id] = fn; }
export function showScreen(id) {
  for (const el of $$('.screen')) el.classList.toggle('active', el.id === `screen-${id}`);
  currentScreen = id;
  window.scrollTo(0, 0);
  hideTooltip();
  if (screenHooks[id]) screenHooks[id]();
}
export function activeScreen() { return currentScreen; }

/* ---------------- Rapid-click protection ---------------- */
// Wrap a handler so it can't run again until the previous run (sync or async)
// has finished, plus a short cooldown. Prevents duplicate purchases etc.
export function guard(fn, cooldown = 250) {
  let busy = false;
  return async function guarded(...args) {
    if (busy) return undefined;
    busy = true;
    try { return await fn.apply(this, args); }
    finally { setTimeout(() => { busy = false; }, cooldown); }
  };
}

// Screens re-render after most actions, so the button under a second rapid
// click is often a brand-new element. A global lock keyed on the action and
// its data attributes rejects repeats of the same action within a short window,
// and nothing runs while a previous action is still in progress.
let actionBusy = false;
let lastAction = { key: '', t: 0 };
const REPEAT_MS = 350;
if (typeof window !== 'undefined') window.__nickoClickState = () => ({ actionBusy: !!actionBusy, lastAction });

/** Delegated click handling: data-action="name" on any element inside root. */
export function delegate(root, handlers) {
  root.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-action]');
    if (!el || !root.contains(el) || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    const action = el.dataset.action;
    if (!handlers[action]) return;
    ev.preventDefault();
    const key = action + '|' + JSON.stringify(el.dataset);
    const now = performance.now();
    if (actionBusy || (key === lastAction.key && now - lastAction.t < REPEAT_MS)) return;
    lastAction = { key, t: now };
    // The lock covers the synchronous part of an action and short async work.
    // It always releases within 800ms so a slow or stalled handler can never
    // freeze the interface. Combat has its own busy flag, and open dialogs
    // block the page behind them, so longer flows stay protected.
    const token = {};
    actionBusy = token;
    const release = () => { if (actionBusy === token) actionBusy = false; };
    const timer = setTimeout(release, 800);
    try { await handlers[action](el, ev); }
    catch (err) { console.error(err); }
    finally { clearTimeout(timer); release(); }
  });
}

/* ---------------- Toasts and banners ---------------- */
export function toast(message, { type = '', icon = '', timeout = 2600 } = {}) {
  const box = $('#toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = (icon ? `<span class="icon-box">${icon}</span>` : '') + `<span>${escapeHtml(message)}</span>`;
  box.appendChild(el);
  while (box.children.length > 5) box.firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, timeout);
}

const bannerQueue = [];
let bannerBusy = false;
export function banner(title, subtitle = '') {
  bannerQueue.push({ title, subtitle });
  if (!bannerBusy) nextBanner();
}
function nextBanner() {
  const item = bannerQueue.shift();
  const root = $('#banner');
  if (!item || !root) { bannerBusy = false; return; }
  bannerBusy = true;
  root.innerHTML = `<div class="banner"><h2>${escapeHtml(item.title)}</h2>${item.subtitle ? `<p>${escapeHtml(item.subtitle)}</p>` : ''}</div>`;
  setTimeout(() => { root.innerHTML = ''; nextBanner(); }, 2600);
}

/* ---------------- Modals ---------------- */
const modalStack = [];
export function modal({ title = '', body = '', buttons = [{ label: 'Close', value: null }], dismissible = true, className = '' }) {
  return new Promise((resolve) => {
    const root = $('#modal-root');
    const back = document.createElement('div');
    back.className = 'backdrop';
    back.innerHTML = `<div class="modal panel ${className}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      ${title ? `<h2>${escapeHtml(title)}</h2>` : ''}
      <div class="modal-body">${body}</div>
      <div class="actions-row">${buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-i="${i}" ${b.disabled ? 'disabled' : ''}>${escapeHtml(b.label)}</button>`).join('')}</div>
    </div>`;
    const prevFocus = document.activeElement;
    let closed = false;
    const close = (val) => {
      if (closed) return;
      closed = true;
      back.remove();
      modalStack.splice(modalStack.indexOf(entry), 1);
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      resolve(val);
    };
    const entry = { close, dismissible };
    modalStack.push(entry);
    back.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (b && back.contains(b)) { sfx('click'); close(buttons[+b.dataset.i].value); return; }
      if (e.target === back && dismissible) close(null);
    });
    root.appendChild(back);
    const first = back.querySelector('.actions-row .btn.primary, .actions-row .btn');
    if (first) first.focus();
    if (buttons.onMount) buttons.onMount(back);
  });
}

export function modalOpen() { return modalStack.length > 0; }
export function closeTopModal() {
  const top = modalStack[modalStack.length - 1];
  if (top && top.dismissible) { top.close(null); return true; }
  return false;
}

export function confirmDialog(title, text, { ok = 'Confirm', danger = false } = {}) {
  return modal({
    title,
    body: `<p>${escapeHtml(text)}</p>`,
    buttons: [{ label: 'Cancel', value: false }, { label: ok, value: true, cls: danger ? 'danger' : 'primary' }],
  }).then((v) => v === true);
}

/* ---------------- Tooltips ---------------- */
let tipTimer = null;
export function hideTooltip() {
  const t = $('#tooltip');
  if (t) t.classList.remove('show');
}
function showTooltip(target) {
  const t = $('#tooltip');
  const content = target.dataset.tipHtml || (target.dataset.tip ? escapeHtml(target.dataset.tip) : '');
  if (!t || !content) return;
  t.innerHTML = content;
  t.classList.add('show');
  const r = target.getBoundingClientRect();
  const tw = t.offsetWidth, th = t.offsetHeight;
  let x = r.left + r.width / 2 - tw / 2;
  let y = r.top - th - 8;
  if (y < 6) y = r.bottom + 8;
  x = Math.max(6, Math.min(window.innerWidth - tw - 6, x));
  t.style.left = `${x}px`;
  t.style.top = `${y}px`;
}
export function initTooltips() {
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-tip],[data-tip-html]');
    if (el) showTooltip(el); else hideTooltip();
  });
  document.addEventListener('focusin', (e) => {
    const el = e.target.closest('[data-tip],[data-tip-html]');
    if (el) showTooltip(el);
  });
  document.addEventListener('focusout', hideTooltip);
  // Touch: long-press to show a tooltip.
  document.addEventListener('touchstart', (e) => {
    const el = e.target.closest('[data-tip],[data-tip-html]');
    clearTimeout(tipTimer);
    hideTooltip();
    if (el) tipTimer = setTimeout(() => showTooltip(el), 450);
  }, { passive: true });
  document.addEventListener('touchend', () => { clearTimeout(tipTimer); setTimeout(hideTooltip, 1600); }, { passive: true });
  window.addEventListener('scroll', hideTooltip, { passive: true });
}

/* ---------------- Bars ---------------- */
export function barHtml(kind, value, max, { label = true, cls = '', markers = [] } = {}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const low = kind === 'hp' && pct < 30 ? ' low' : '';
  return `<div class="bar ${kind}${low} ${cls}" role="progressbar" aria-valuemin="0" aria-valuemax="${Math.round(max)}" aria-valuenow="${Math.round(value)}">
    <div class="ghost-fill" style="width:${pct}%"></div><div class="fill" style="width:${pct}%"></div>
    ${markers.map((m) => `<div class="marker" style="left:${m * 100}%"></div>`).join('')}
    ${label ? `<div class="label">${Math.max(0, Math.round(value))} / ${Math.round(max)}</div>` : ''}
  </div>`;
}

export function setBar(el, value, max) {
  if (!el) return;
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const fill = el.querySelector('.fill');
  const ghost = el.querySelector('.ghost-fill');
  if (fill) fill.style.width = `${pct}%`;
  if (ghost) ghost.style.width = `${pct}%`;
  if (el.classList.contains('hp')) el.classList.toggle('low', pct < 30);
  const lab = el.querySelector('.label');
  if (lab) lab.textContent = `${Math.max(0, Math.round(value))} / ${Math.round(max)}`;
  el.setAttribute('aria-valuenow', Math.round(value));
  el.setAttribute('aria-valuemax', Math.round(max));
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
