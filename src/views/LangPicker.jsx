import { useState } from 'react';
import { LANG_PAGES, DEFAULT_LANG, langFor, missingTexts, tr } from '../lib/i18n';

const OPTS = [['en', 'English'], ['am', 'አማርኛ']];
/* my language (Account): the ministry's choice, all English, all Amharic, or my own page by page */
export function MyLanguage({ myLang, setMyLang, ministry, hq }) {
  const [open, setOpen] = useState(myLang.mode === 'pages');
  const pages = LANG_PAGES.filter(([k]) => (hq ? k.startsWith('hq-') || ['menu', 'downloads', 'templates', 'users'].includes(k) : !k.startsWith('hq-')));
  return (
    <div className="lang-pick" data-notr>
      <div className="form-section">Language · ቋንቋ</div>
      <div className="seg wrap">
        {[['ministry', 'As the ministry set it'], ['en', 'English'], ['am', 'አማርኛ'], ['pages', 'Page by page']].map(([k, l]) => (
          <button key={k} type="button" className={myLang.mode === k ? 'on' : ''} onClick={() => { setMyLang({ ...myLang, mode: k }); setOpen(k === 'pages'); }}>{l}</button>
        ))}
      </div>
      {open && (
        <table className="gtable left lang-table">
          <tbody>{pages.map(([k, l]) => {
            const v = langFor(k, myLang, ministry);
            return (
              <tr key={k}><td>{l}</td><td>
                <div className="seg">{(k === 'templates' ? [...OPTS, ['both', 'Both']] : OPTS).map(([o, ol]) => <button key={o} type="button" className={v === o ? 'on' : ''} onClick={() => setMyLang({ mode: 'pages', pages: { ...(myLang.pages || {}), [k]: o } })}>{ol}</button>)}</div>
              </td></tr>
            );
          })}</tbody>
        </table>
      )}
      <p className="tiny muted" style={{ margin: '6px 0 0' }}>Names and what people typed stay as they were written. Saved on this device.</p>
    </div>
  );
}

/* the ministry's default (Settings, admin): one language for everything, then any page in the other language */
export function MinistryLanguage({ value, save }) {
  const v = { ...DEFAULT_LANG, ...(value || {}), pages: { ...DEFAULT_LANG.pages, ...(value?.pages || {}) } };
  const put = (n) => save('language', n, 'language');
  return (
    <section className="card" data-notr>
      <div className="card-head"><div><div className="card-title">Language · ቋንቋ</div><div className="card-sub">The language everyone sees, unless they choose their own in Account. Today’s practice is set as the start: profiles, names and attendance in English, plans and the calendar in Amharic, templates in both.</div></div></div>
      <div className="row" style={{ gap: 8, marginBottom: 10 }}><b className="small">Everything else</b>
        <div className="seg">{OPTS.map(([o, l]) => <button key={o} type="button" className={v.default === o ? 'on' : ''} onClick={() => put({ ...v, default: o })}>{l}</button>)}</div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="gtable left lang-table">
          <thead><tr><th>Page</th><th>Language</th></tr></thead>
          <tbody>{LANG_PAGES.map(([k, l]) => {
            const cur = v.pages[k] || v.default;
            return (
              <tr key={k}><td>{l}</td><td><div className="seg">{(k === 'templates' ? [...OPTS, ['both', 'Both']] : OPTS).map(([o, ol]) => <button key={o} type="button" className={cur === o ? 'on' : ''} onClick={() => put({ ...v, pages: { ...v.pages, [k]: o } })}>{ol}</button>)}</div></td></tr>
            );
          })}</tbody>
        </table>
      </div>
    </section>
  );
}

/* your own words (Settings → Language): correct a translation, or translate text the app showed in English on an Amharic page */
export function Translations({ value, save }) {
  const [q, setQ] = useState('');
  const [show, setShow] = useState('missing');
  const mine = value || {};
  const missing = missingTexts().filter((t) => !mine[t]);
  const rows = (show === 'missing' ? missing : Object.keys(mine)).filter((t) => !q || t.toLowerCase().includes(q.toLowerCase()) || (mine[t] || '').includes(q));
  const put = (en, am) => { const n = { ...mine }; if (am.trim()) n[en] = am.trim(); else delete n[en]; save('translations', n, 'translation'); };
  const [add, setAdd] = useState({ en: '', am: '' });
  return (
    <section className="card" data-notr>
      <div className="card-head"><div><div className="card-title">Your translations · ትርጉሞች</div><div className="card-sub">Change any Amharic word the app uses, or translate text that still shows in English. “Not translated yet” lists English the app showed on Amharic pages since you opened it – open those pages in Amharic first. Names and data can be ignored.</div></div></div>
      <div className="fin-filters">
        <div className="seg"><button className={show === 'missing' ? 'on' : ''} onClick={() => setShow('missing')}>Not translated yet ({missing.length})</button><button className={show === 'mine' ? 'on' : ''} onClick={() => setShow('mine')}>Mine ({Object.keys(mine).length})</button></div>
        <input className="grow" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="row" style={{ gap: 6, margin: '8px 0' }}>
        <input placeholder="English text, exactly as shown" value={add.en} onChange={(e) => setAdd({ ...add, en: e.target.value })} style={{ flex: 1 }} />
        <input className="am" placeholder="በአማርኛ" value={add.am} onChange={(e) => setAdd({ ...add, am: e.target.value })} style={{ flex: 1 }} />
        <button className="btn lime small" disabled={!add.en.trim() || !add.am.trim()} onClick={() => { put(add.en.trim(), add.am); setAdd({ en: '', am: '' }); }}>Add</button>
      </div>
      <div className="card-scroll" style={{ maxHeight: 460 }}>
        <table className="gtable left">
          <thead><tr><th>English</th><th>Amharic</th></tr></thead>
          <tbody>
            {rows.slice(0, 300).map((t) => (
              <tr key={t}><td className="small">{t}</td><td><input className="am" defaultValue={mine[t] || ''} placeholder={tr(t, 'am') !== t ? tr(t, 'am') : 'በአማርኛ…'} onBlur={(e) => e.target.value !== (mine[t] || '') && put(t, e.target.value)} /></td></tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={2} className="muted small">{show === 'missing' ? 'Nothing waiting – open pages in Amharic to collect text that still needs a translation.' : 'No translations of your own yet.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
