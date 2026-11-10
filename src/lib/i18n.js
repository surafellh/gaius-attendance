// Language: English or Amharic, for the whole app or page by page.
// The app is written in English; text inside an element marked data-lang="am" is shown in Amharic
// using the dictionary in am.js. People's names, plan titles and other data are left as they are.
import { AM, AM_WORDS } from './am';

const WORD = Object.fromEntries(AM_WORDS);
const WORD_RE = new RegExp(`\\b(${AM_WORDS.map(([w]) => w).sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'g');

/* translations added on Settings → Language (they win over the built-in ones) */
const EXTRA = {};
export function setTranslations(d) { for (const k of Object.keys(EXTRA)) delete EXTRA[k]; Object.assign(EXTRA, d || {}); }
const word = (t) => EXTRA[t] || AM[t];
/* English text seen on Amharic pages without a translation, for Settings → Language */
const MISSING = new Map();
export const missingTexts = () => [...MISSING.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);

/* one piece of text in a language */
export function tr(s, lang) {
  if (lang !== 'am' || s == null || s === '') return s;
  const str = String(s);
  const t = str.trim();
  if (word(t)) return str.replace(t, word(t));
  if (/\d/.test(t) && /[A-Za-z]/.test(t)) return str.replace(WORD_RE, (m) => WORD[m] || m); // dates and numbers: "Tikimt 08", "1,500 birr"
  return str;
}
/* a whole download (title, sheet names, headings, and the app's own words in the cells) */
export function trReport(rep, lang) {
  if (lang !== 'am') return rep;
  return { ...rep, title: tr(rep.title, lang), sub: tr(rep.sub, lang),
    sheets: rep.sheets.map((sh) => ({ ...sh, name: tr(sh.name, lang), head: sh.head?.map((h) => tr(h, lang)), body: sh.body?.map((r) => (Array.isArray(r) ? r.map((v) => (typeof v === 'string' && word(v.trim()) ? tr(v, lang) : v)) : r)) })) };
}

/* ── the translator: watches the page and swaps text in Amharic areas ─────────────────────────── */
const orig = new WeakMap();          // text node → { en, am }
const origAttr = new WeakMap();      // element → { placeholder/title: { en, am } }
const ATTRS = ['placeholder', 'title'];
const skip = (el) => !el || el.closest('input,textarea,script,style,[data-notr],.am,.cell-ro-data');
const langAt = (el) => el?.closest('[data-lang]')?.getAttribute('data-lang') || 'en';
function doText(n) {
  const el = n.parentElement; if (skip(el)) return;
  const lang = langAt(el), cur = n.nodeValue, o = orig.get(n);
  if (lang === 'am') {
    if (o && o.am === cur) return;
    const out = tr(cur, 'am');
    if (out !== cur) { orig.set(n, { en: cur, am: out }); n.nodeValue = out; } else {
      orig.delete(n);
      const t = cur.trim();
      if (/[A-Za-z]{3}/.test(t) && !/\d/.test(t) && t.length < 140 && MISSING.size < 800) MISSING.set(t, (MISSING.get(t) || 0) + 1);
    }
  } else if (o && o.am === cur) { n.nodeValue = o.en; orig.delete(n); }
}
function doAttrs(el) {
  if (el.closest('[data-notr]')) return;
  const lang = langAt(el); let m = origAttr.get(el);
  for (const a of ATTRS) {
    const cur = el.getAttribute(a); if (cur == null) continue;
    const o = m?.[a];
    if (lang === 'am') { if (o && o.am === cur) continue; const out = tr(cur, 'am'); if (out !== cur) { m ||= {}; m[a] = { en: cur, am: out }; origAttr.set(el, m); el.setAttribute(a, out); } }
    else if (o && o.am === cur) { el.setAttribute(a, o.en); delete m[a]; }
  }
}
function walk(root) {
  if (root.nodeType === 3) return doText(root);
  if (root.nodeType !== 1) return;
  if (ATTRS.some((a) => root.hasAttribute(a))) doAttrs(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n; while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else if (ATTRS.some((a) => n.hasAttribute(a))) doAttrs(n); }
}
let obs = null, busy = false;
export function startTranslator() {
  if (obs || typeof MutationObserver === 'undefined') return;
  obs = new MutationObserver((list) => {
    if (busy) return; busy = true;
    try {
      for (const m of list) {
        if (m.type === 'characterData') doText(m.target);
        else if (m.type === 'attributes') { if (m.attributeName === 'data-lang') walk(m.target); else doAttrs(m.target); }
        else m.addedNodes.forEach(walk);
      }
    } finally { obs.takeRecords(); busy = false; }
  });
  obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-lang', ...ATTRS] });
  walk(document.body);
}
export const retranslate = () => { busy = true; try { walk(document.body); } finally { obs?.takeRecords(); busy = false; } };

/* ── which language where ────────────────────────────────────────────────────────────────────── */
/* the pages a language can be chosen for; 'menu' = the header and menus */
export const LANG_PAGES = [
  ['menu', 'Header & menus'], ['home', 'Dashboard'], ['attendance', 'Attendance'], ['calls', 'Calls'], ['people', 'People'], ['leadership', 'Leadership'], ['roadmap', 'Roadmap'],
  ['calendar', 'Calendar'], ['plans', 'Plans & budget'], ['meeting', 'Meetings'], ['departments', 'Departments'], ['finance', 'Finance'], ['messages', 'Messages'],
  ['users', 'App admin'], ['downloads', 'Downloads (files)'], ['templates', 'Excel templates'],
  ['hq-overview', 'HQ · Overview'], ['hq-attendance', 'HQ · Attendance'], ['hq-people', 'HQ · People'], ['hq-plans', 'HQ · Plans'], ['hq-finance', 'HQ · Finance'], ['hq-messages', 'HQ · Messages'],
];
/* the ministry's way today: profiles and names in English, plans in Amharic */
export const DEFAULT_LANG = { default: 'en', pages: { plans: 'am', calendar: 'am', templates: 'both', 'hq-plans': 'am' } };
const KEY = 'gaius-lang';
export function loadMyLang() { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || { mode: 'ministry', pages: {} }; } catch { return { mode: 'ministry', pages: {} }; } }
export function saveMyLang(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ } }
/* mine: { mode: 'ministry' | 'en' | 'am' | 'pages', pages } · ministry: { default, pages } (Settings) */
export function langFor(page, mine, ministry = DEFAULT_LANG) {
  if (mine?.mode === 'en' || mine?.mode === 'am') return page === 'templates' ? mine.mode : mine.mode;
  const m = { ...DEFAULT_LANG, ...ministry, pages: { ...DEFAULT_LANG.pages, ...(ministry?.pages || {}) } };
  const v = (mine?.mode === 'pages' && mine.pages?.[page]) || m.pages[page] || m.default;
  return page === 'templates' ? v : v === 'both' ? 'en' : v;
}
