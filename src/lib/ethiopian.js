// Ethiopian calendar helpers (same rules as the Google Sheet)
export const ET_MONTHS = ['Meskerem','Tikimt','Hidar','Tahsas','Tir','Yekatit','Megabit','Miyazya','Ginbot','Sene','Hamle','Nehase','Pagume'];

const DAY = 86400000;
const utc = (y, m, d) => Date.UTC(y, m, d);

// Gregorian date of Meskerem 1 for Ethiopian year y
export function etNewYear(y) {
  const g = y + 7;
  return utc(g, 8, 11 + ((y + 8) % 4 === 0 ? 1 : 0));
}

export function toEthiopian(date) {
  const t = typeof date === 'string' ? Date.parse(date + 'T00:00:00Z') : date;
  const g = new Date(t).getUTCFullYear();
  let y = g - 8;
  if (t >= etNewYear(g - 7)) y = g - 7;
  const o = Math.round((t - etNewYear(y)) / DAY);
  return { year: y, month: Math.floor(o / 30), day: (o % 30) + 1, offset: o };
}

export const pad = (n) => String(n).padStart(2, '0');

export function etLabel(date, withYear = false) {
  const e = toEthiopian(date);
  return `${ET_MONTHS[e.month]} ${pad(e.day)}${withYear ? ' ' + e.year : ''}`;
}

export function semesterOf(date) {
  const e = toEthiopian(date);
  return `${e.offset < 180 ? 'Meskerem' : 'Megabit'} ${e.year}`;
}

export const iso = (t) => new Date(t).toISOString().slice(0, 10);

// all Sundays of a semester like 'Meskerem 2019'
export function sundaysOf(semester) {
  const [half, ys] = semester.split(' ');
  const y = Number(ys);
  const start = etNewYear(y) + (half === 'Megabit' ? 180 : 0) * DAY;
  const end = half === 'Megabit' ? etNewYear(y + 1) : etNewYear(y) + 180 * DAY;
  const first = start + ((7 - new Date(start).getUTCDay()) % 7) * DAY;
  const out = [];
  for (let t = first; t < end; t += 7 * DAY) out.push(iso(t));
  return out;
}

export function currentSemester(today = new Date()) {
  return semesterOf(utc(today.getFullYear(), today.getMonth(), today.getDate()));
}

export function previousSemester(sem) {
  const [half, y] = sem.split(' ');
  return half === 'Megabit' ? `Meskerem ${y}` : `Megabit ${Number(y) - 1}`;
}

export function semesterList(from = 'Meskerem 2018', count = 6) {
  const out = [from];
  while (out.length < count) {
    const [h, y] = out[out.length - 1].split(' ');
    out.push(h === 'Meskerem' ? `Megabit ${y}` : `Meskerem ${Number(y) + 1}`);
  }
  return out;
}

// most recent Sunday on or before today
export function latestSunday(today = new Date()) {
  const t = utc(today.getFullYear(), today.getMonth(), today.getDate());
  return iso(t - new Date(t).getUTCDay() * DAY);
}

export function fmtGreg(d) {
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export const SEMESTERS = semesterList('Meskerem 2018', 12);

export const ET_MONTHS_AM = ['መስከረም','ጥቅምት','ኅዳር','ታኅሣሥ','ጥር','የካቲት','መጋቢት','ሚያዝያ','ግንቦት','ሰኔ','ሐምሌ','ነሐሴ','ጳጉሜ'];

// group a list of ISO Sundays by Ethiopian month, keeping order
export function groupByMonth(sundays) {
  const out = [];
  for (const s of sundays) {
    const e = toEthiopian(s);
    let g = out[out.length - 1];
    if (!g || g.month !== e.month) { g = { month: e.month, name: ET_MONTHS[e.month], am: ET_MONTHS_AM[e.month], days: [] }; out.push(g); }
    g.days.push({ sunday: s, day: e.day });
  }
  return out;
}

export const shortEt = (d) => { const e = toEthiopian(d); return `${ET_MONTHS[e.month].slice(0, 3)} ${e.day}`; };

// Sundays inside one Ethiopian month
export function sundaysOfMonth(year, month) {
  const start = etNewYear(year) + month * 30 * DAY;
  const len = month === 12 ? (etNewYear(year + 1) - start) / DAY : 30;
  const first = start + ((7 - new Date(start).getUTCDay()) % 7) * DAY;
  const out = [];
  for (let t = first; t < start + len * DAY; t += 7 * DAY) out.push(iso(t));
  return out;
}
export function monthOf(d) { const e = toEthiopian(d); return { year: e.year, month: e.month }; }
export function addMonths({ year, month }, n) {
  let m = month + n, y = year;
  while (m > 12) { m -= 13; y++; }
  while (m < 0) { m += 13; y--; }
  return { year: y, month: m };
}
export const monthLabel = ({ year, month }) => `${ET_MONTHS[month]} ${year}`;
export function semesterStart(sem) {
  const [half, y] = sem.split(' ');
  return iso(etNewYear(Number(y)) + (half === 'Megabit' ? 180 : 0) * DAY);
}
export function semesterEnd(sem) {
  const [half, y] = sem.split(' ');
  return iso((half === 'Megabit' ? etNewYear(Number(y) + 1) : etNewYear(Number(y)) + 180 * DAY) - DAY);
}
export const todayIso = () => { const t = new Date(); return iso(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())); };
