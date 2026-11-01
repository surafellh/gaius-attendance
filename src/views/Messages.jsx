import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { etLabel } from '../lib/ethiopian';
import { Icon } from './common';

/* HQ ↔ center conversations. A center writes to HQ; HQ writes to one center or to every center. */
export default function Messages({ D, perm, profile, reload, setError }) {
  const asHq = perm.switchCenter;
  const cid = D.center?.id || 1;
  const [open, setOpen] = useState(null);
  const [draft, setDraft] = useState({ subject: '', body: '', all: false });
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const threads = useMemo(() => {
    const top = D.messages.filter((m) => !m.parent_id);
    return top.map((t) => {
      const replies = D.messages.filter((m) => m.parent_id === t.id);
      const all = [t, ...replies];
      const last = all[all.length - 1];
      const unread = all.filter((m) => m.from_hq !== asHq && !D.reads.some((r) => r.message_id === m.id && r.user_id === profile.user_id)).length;
      return { t, replies, last, unread };
    }).sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));
  }, [D.messages, D.reads, asHq, profile.user_id]);
  const cur = threads.find((x) => x.t.id === open);

  useEffect(() => { // opening a thread marks it read
    if (!cur || !cur.unread) return;
    const ids = [cur.t, ...cur.replies].filter((m) => m.from_hq !== asHq).map((m) => ({ message_id: m.id, user_id: profile.user_id }));
    supabase.from('message_reads').upsert(ids, { onConflict: 'message_id,user_id', ignoreDuplicates: true }).then(() => reload());
  }, [open]); // eslint-disable-line

  async function send(e) {
    e.preventDefault();
    if (!draft.body.trim()) return;
    setBusy(true);
    const { error } = await supabase.from('messages').insert({ center_id: asHq && draft.all ? null : cid, from_hq: asHq, author_name: profile.full_name, subject: draft.subject.trim() || null, body: draft.body.trim() });
    setBusy(false);
    if (error) return setError(`Not sent: ${error.message}`);
    setDraft({ subject: '', body: '', all: false }); reload();
  }
  async function sendReply() {
    if (!reply.trim()) return;
    const { error } = await supabase.from('messages').insert({ center_id: cur.t.center_id ?? (asHq ? null : cid), from_hq: asHq, author_name: profile.full_name, body: reply.trim(), parent_id: cur.t.id });
    if (error) return setError(`Not sent: ${error.message}`);
    setReply(''); reload();
  }
  const canWrite = asHq || perm.mark;
  const who = (m) => `${m.from_hq ? 'HQ' : D.center?.name || 'Center'}${m.author_name ? ` · ${m.author_name}` : ''}`;
  const when = (m) => `${etLabel(m.created_at.slice(0, 10), true)} ${new Date(m.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;

  return (
    <div className="page">
      <div className="page-head">
        <div><h1 className="page-title">Messages</h1><p className="page-sub">{asHq ? `Conversations with ${D.center?.name} center. Pick a center above, or write to every center at once.` : 'Conversations between our center and HQ.'}</p></div>
      </div>
      <div className="msg-layout">
        <section className="card flush msg-threads">
          {canWrite && (
            <form className="form msg-new" onSubmit={send}>
              <input placeholder="Subject" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
              <textarea rows={3} placeholder={asHq ? `Write to ${draft.all ? 'every center' : D.center?.name}…` : 'Write to HQ…'} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
              <div className="row" style={{ justifyContent: 'space-between' }}>
                {asHq ? <label className="check"><input type="checkbox" checked={draft.all} onChange={(e) => setDraft({ ...draft, all: e.target.checked })} /> Send to every center</label> : <span />}
                <button className="btn lime small" disabled={busy || !draft.body.trim()}><Icon.bell width="16" height="16" /> Send</button>
              </div>
            </form>
          )}
          {threads.length === 0 && <div className="empty">No messages yet.</div>}
          {threads.map(({ t, replies, last, unread }) => (
            <button key={t.id} className={`msg-thread ${open === t.id ? 'on' : ''}`} onClick={() => setOpen(t.id)}>
              <span className={`msg-from ${t.from_hq ? 'hq' : ''}`}>{t.from_hq ? 'HQ' : D.center?.name?.[0] || 'C'}</span>
              <span className="pinfo">
                <span className="pname">{t.subject || t.body.slice(0, 50)}{t.center_id == null && <span className="tag lime" style={{ marginLeft: 6 }}>all centers</span>}</span>
                <span className="pmeta">{who(last)} · {when(last)} · {replies.length} repl{replies.length === 1 ? 'y' : 'ies'}</span>
              </span>
              {unread > 0 && <span className="badge">{unread}</span>}
            </button>
          ))}
        </section>
        <section className="card msg-view">
          {!cur ? <div className="empty">Choose a conversation.</div> : (
            <>
              <div className="card-title">{cur.t.subject || 'Message'}</div>
              <div className="msg-list">
                {[cur.t, ...cur.replies].map((m) => (
                  <div key={m.id} className={`bubble ${m.from_hq === asHq ? 'mine' : ''} ${m.from_hq ? 'hq' : ''}`}>
                    <div className="bubble-who">{who(m)} · {when(m)}</div>
                    <div className="bubble-body">{m.body}</div>
                  </div>
                ))}
              </div>
              {canWrite && (
                <div className="row" style={{ gap: 8, marginTop: 10 }}>
                  <textarea className="grow" rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply…" />
                  <button className="btn lime" disabled={!reply.trim()} onClick={sendReply}>Reply</button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
