import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Auth from './Auth';
import { Mark, Sheet } from './common';

/* what shows if the landing text has not been loaded (or the release 5 SQL has not been run yet) */
export const SITE_DEFAULTS = {
  tagline: 'Here to reveal the true image of Jesus Christ in our youth’s lives.',
  vision: 'To see young people trained, equipped and lead a life of discipleship.',
  verse: 'My friend, I pray that you may prosper in all things and be in health, just as your soul prospers.',
  verse_ref: '3 John 2',
  about: 'Gaius Ministry is a Bible-based Christian spiritual institution focused on the holistic development and transformation of youth. Established in February 2018 G.C., it has worked on youth matters since 2014 G.C., together with Evangelical churches, EVASUE and Scripture Union – youth conferences, addiction awareness, and weekly Sunday youth programs in its centers.',
  logo: 'https://gaiusministry.org/wp-content/uploads/2023/02/cropped-gaius_logo-270x270.png',
  website: 'https://gaiusministry.org',
  telegram: 'https://t.me/Gaiusministry',
};

/* The page anyone with the link sees first. Signing in takes each person straight to their own center (HQ to the overview). */
export default function Landing() {
  const [site, setSite] = useState(SITE_DEFAULTS);
  const [centers, setCenters] = useState([]);
  const [auth, setAuth] = useState(null); // 'in' | 'up'
  const [badLogo, setBadLogo] = useState(false);
  useEffect(() => {
    supabase.from('site_info').select('key,value').then(({ data }) => { if (data?.length) setSite((s) => ({ ...s, ...Object.fromEntries(data.filter((r) => r.value).map((r) => [r.key, r.value])) })); });
    supabase.rpc('public_centers').then(({ data }) => setCenters(data || []));
  }, []);
  const logo = (size) => (site.logo && !badLogo ? <img className="logo-img" src={site.logo} alt="Gaius Ministry logo" width={size} height={size} onError={() => setBadLogo(true)} /> : <Mark size={size} />);

  return (
    <div className="landing">
      <header className="land-top">
        <div className="land-top-inner">
          <div className="brand">{logo(38)}<div><div className="brand-name">Gaius Ministry</div><div className="brand-sub">for our youth</div></div></div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost small land-btn" onClick={() => setAuth('in')}>Sign in</button>
            <button className="btn small land-btn dark" onClick={() => setAuth('up')}>Sign up</button>
          </div>
        </div>
      </header>

      <section className="land-hero">
        <div className="land-hero-inner">
          <div className="land-logo">{logo(120)}</div>
          <h1>Gaius Ministry</h1>
          <p className="land-tag">{site.tagline}</p>
          <div className="row" style={{ gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn dark" onClick={() => setAuth('in')}>Sign in to your center</button>
            <button className="btn ghost land-light" onClick={() => setAuth('up')}>New leader? Sign up</button>
          </div>
        </div>
        <div className="band" aria-hidden="true" />
      </section>

      <main className="land-main">
        <section className="land-verse">
          <span className="land-kicker">Key verse</span>
          <blockquote>“{site.verse}”</blockquote>
          <cite>{site.verse_ref}</cite>
        </section>
        <div className="land-two">
          <section className="land-card"><span className="land-kicker">Our vision</span><p className="land-big">{site.vision}</p></section>
          <section className="land-card"><span className="land-kicker">About Gaius</span><p>{site.about}</p></section>
        </div>
        {centers.length > 0 && (
          <section className="land-card">
            <span className="land-kicker">HQ &amp; centers</span>
            <div className="land-centers">
              <div><b>HQ</b><span>Addis Ababa</span></div>
              {centers.map((c) => <div key={c.id}><b>{c.name}</b><span className="am">{c.name_am}</span></div>)}
            </div>
            <p className="small muted" style={{ margin: '10px 0 0' }}>Sunday youth program in every center. Sign in and you go straight to your own center.</p>
          </section>
        )}
      </main>
      <footer className="land-foot">
        <span>© Gaius Ministry</span>
        {site.website && <a href={site.website} target="_blank" rel="noreferrer">Website</a>}
        {site.telegram && <a href={site.telegram} target="_blank" rel="noreferrer">Telegram</a>}
      </footer>
      {auth && <Sheet title="" onClose={() => setAuth(null)}><Auth embedded start={auth} key={auth} site={site} /></Sheet>}
    </div>
  );
}
