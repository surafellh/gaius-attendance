// Find who someone means by a name: "Eneyew", "eneyew tsegaye", "Beki", "Bereket D", "Kal (m)"…
// Looks at the list name, the full name, first names, initials and the bracket note (who invited them).
const norm = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s()]/gu, ' ').replace(/\s+/g, ' ').trim();
const plain = (s) => norm(s).replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
const NICK = { beki: 'bereket', heni: 'henok', zeki: 'zekarias', minte: 'mintesinot', seni: 'senait', kidu: 'kidist', birukti: 'biruktawit', theo: 'theodora', yordi: 'yordanos', mercy: 'miheret', hani: 'hanna', sami: 'samuel', nati: 'natnael', kal: 'kalkidan', yomi: 'yohannes', abuki: 'abraham', fre: 'frehiwot', nuha: 'nuhamin', lem: 'lemlem', sur: 'surafel' };

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function tokensOf(p) {
  const words = new Set();
  for (const src of [p.name, p.full_name]) for (const w of plain(src).split(' ')) if (w) { words.add(w); if (NICK[w]) words.add(NICK[w]); }
  return words;
}

/* score how well `query` points at person p (0 = no match) */
export function matchScore(query, p) {
  const q = plain(query);
  if (!q) return 0;
  const name = plain(p.name), full = plain(p.full_name);
  if (q === name || q === full) return 100;
  const qs = q.split(' ').map((w) => NICK[w] || w);
  const words = tokensOf(p);
  let hit = 0;
  for (const w of qs) {
    if (words.has(w)) hit += 2;
    else if ([...words].some((x) => x.startsWith(w) && w.length >= 2)) hit += 1.4;
    else if (w.length === 1 && [...words].some((x) => x[0] === w)) hit += 0.6; // initial, e.g. "Bereket D"
    else if (w.length >= 4 && [...words].some((x) => lev(w, x.slice(0, Math.max(w.length, Math.min(x.length, w.length + 1)))) <= (w.length >= 6 ? 2 : 1))) hit += 1; // spelling: enyew → eneyew
    else return 0;
  }
  let s = 40 + (hit / qs.length) * 25;
  // a word that only appears in brackets is a note about who invited them ("Bethelehem (nuha)"), not their name
  const bracket = ((p.name || '').match(/\(([^)]*)\)/)?.[1] || '').toLowerCase();
  const outside = plain((p.name || '').replace(/\(.*?\)/g, ' ') + ' ' + (p.full_name || '')).split(' ');
  if (bracket && qs.every((w) => !outside.some((x) => x.startsWith(w) || (NICK[x] || '').startsWith(w)))) s -= 25;
  if (name.startsWith(q) || full.startsWith(q)) s += 15;
  if (p.category && p.category !== 'New Comer') s += 3; // leaders/members invite more often
  return Math.min(99, s);
}

export function findPeople(query, people, limit = 6) {
  return people.filter((p) => !p.archived)
    .map((p) => ({ p, s: matchScore(query, p) })).filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || (a.p.sn ?? 1e9) - (b.p.sn ?? 1e9)).slice(0, limit);
}

/* best single match, only when it is clearly the one meant */
export function bestMatch(query, people) {
  const [a, b] = findPeople(query, people, 2);
  if (!a) return null;
  if (a.s >= 100 || (a.s >= 60 && (!b || a.s - b.s >= 10))) return a.p;
  return null;
}
