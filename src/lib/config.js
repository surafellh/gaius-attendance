// Everything the admin can change on the Settings page, with the defaults the app ships with.
// Saved in Supabase: role_caps (what each role can do – the database enforces mark / manage / approve / finance)
// and app_settings (dashboard cards, People columns, downloads, role names) as JSON.

/* abilities a role can have. db: the database checks it too, not only the screen */
export const CAPS = [
  ['mark', 'Mark attendance, register & edit people, calls', 'center', true],
  ['manage', 'Programs, plans, calendar, teaching plan, meetings, money & assets', 'center', true],
  ['approve', 'Approve new accounts and set center roles (own center)', 'center', true],
  ['phones', 'See profiles and phone numbers', 'both', false],
  ['finance', 'See Finance', 'both', true],
  ['download', 'Downloads (Excel / PDF)', 'both', false],
  ['backup', 'Download a backup', 'both', false],
  ['studio', 'Studio mode (full detail)', 'both', false],
  ['reminders', 'Meeting and plan reminders on the dashboard', 'center', false],
];
export const CENTER_ROLE_KEYS = ['coordinator', 'followup_leader', 'center_leader', 'leader', 'viewer'];
export const HQ_ROLE_KEYS = ['founder', 'director', 'hq_followup', 'hq_staff'];

/* the same defaults as v10_roles_settings.sql – used until the SQL has been run */
export const DEFAULT_CAPS = {
  coordinator: ['mark', 'manage', 'approve', 'phones', 'finance', 'download', 'backup', 'studio', 'reminders'],
  followup_leader: ['mark', 'manage', 'phones', 'finance', 'download', 'studio', 'reminders'],
  center_leader: ['phones', 'finance', 'download', 'studio', 'reminders'],
  leader: ['phones', 'finance', 'download', 'studio', 'reminders'],
  viewer: ['download', 'studio'],
  founder: ['phones', 'finance', 'download', 'studio'],
  director: ['phones', 'finance', 'download', 'studio'],
  hq_followup: ['phones', 'finance', 'download', 'studio'],
  hq_staff: ['finance', 'download', 'studio'],
};

/* center dashboard: cards, in order; simple / studio = shown in that mode */
export const DASH_CARDS = [
  ['kpis', 'Number tiles (top)', true, true],
  ['bars', 'Who came each Sunday (bar chart)', true, true],
  ['rate', 'Leaders & members rate (lines)', true, true],
  ['compare', 'This month compared with the month before', true, true],
  ['groups', 'Groups on the Sunday (table)', false, true],
  ['newcomers', 'New comers', true, true],
  ['programs', 'Programs', true, true],
  ['months', 'Month by month', true, true],
  ['ranking', 'Most faithful / needs encouragement', true, true],
  ['promising', 'Promising members', false, false],
  ['periods', 'A period picker on each card', false, true],
];
/* number tiles; center = the center's own dashboard, hq = a center opened from the HQ side */
export const KPI_TILES = [
  ['rate', 'Leaders & members rate', true, false, true],
  ['leaders', 'Leaders', true, true, true],
  ['members', 'Members', true, true, true],
  ['informalnc', 'Informal & new comers (together)', true, false, true],
  ['informal', 'Informal members', false, true, true],
  ['others', 'Others', false, true, true],
  ['firsttime', 'First-time comers', false, true, false],
  ['needcall', 'Need a call', true, true, false],
];
/* HQ overview cards */
export const HQ_CARDS = [
  ['kpis', 'Number tiles (all centers)', true],
  ['board', 'Every center, last Sunday (table)', true],
  ['bars', 'Present each Sunday, by center', true],
  ['rate', 'Leaders & members rate, by center', true],
  ['months', 'Month by month, by center', true],
  ['ranking', 'Most faithful / needs encouragement', true],
  ['promising', 'Promising members', true],
  ['upcoming', 'Coming up', true],
];
/* People page columns (keys match People.jsx); simple / studio */
export const PEOPLE_COLS = [
  ['gender', 'Sex', true, true], ['phone', 'Phone', true, true], ['invited_by', 'Invited by', false, true], ['week_joined', 'First Sunday', true, true],
  ['full_name', 'Full name', false, true], ['church', 'Church', false, true], ['education', 'Education', false, true], ['work', 'Work', false, true],
  ['passion', 'Passion / talent', false, true], ['area', 'Area', false, true], ['birth_date', 'Date of birth', false, true], ['age', 'Age', false, true],
  ['level', 'Level', false, true], ['start_teaching', 'First teaching', true, true], ['stay', 'Time with us', true, true], ['responsible', 'Responsible', true, true], ['notes', 'Notes', true, true],
];
/* downloads (keys match ExportSheet.jsx) */
export const DOWNLOADS = [
  ['month', 'Monthly attendance'], ['semester', '6-month (semester) summary'], ['plansrep', 'Plans: done / not done'], ['planslist', 'Plans list'],
  ['teachplan', 'Teaching plan'], ['programs', 'Programs only'], ['profiles', 'Member profiles'], ['history', 'Attendance history'], ['calls', 'Follow-up calls'],
  ['changes', 'Group & responsible changes'], ['roadmap', 'Teaching roadmap'], ['events', 'Events'], ['meetings', 'Leaders’ meetings'], ['finance', 'Money & assets'], ['everything', 'Everything'],
];

export const DEFAULT_IN_CATS = ['From HQ', 'Contribution / offering', 'Fund-raising', 'Donation', 'Other'];
export const DEFAULT_OUT_CATS = ['Program', 'Department plan', 'Purchase', 'Transport', 'Tea & coffee', 'Rent / utilities', 'Other'];

/* settings as stored + defaults → what the app uses */
export function buildConfig(capRows, settings = {}) {
  const caps = {};
  if (capRows) for (const { role, cap } of capRows) (caps[role] ||= new Set()).add(cap);
  else for (const [r, list] of Object.entries(DEFAULT_CAPS)) caps[r] = new Set(list);
  const pick = (defs, saved, n) => { // [{key,label,...flags}] in saved order, new ones appended
    const by = Object.fromEntries((saved || []).map((x) => [x.key, x]));
    const known = defs.map(([key, label, ...f]) => ({ key, label, ...Object.fromEntries(n.map((name, i) => [name, by[key]?.[name] ?? f[i]])) }));
    const order = (saved || []).map((x) => x.key).filter((k) => known.some((y) => y.key === k));
    return [...order.map((k) => known.find((y) => y.key === k)), ...known.filter((y) => !order.includes(y.key))];
  };
  return {
    fromDb: !!capRows,
    caps,
    dash: pick(DASH_CARDS, settings.dashboard, ['simple', 'studio']),
    tiles: pick(KPI_TILES, settings.tiles, ['center', 'hq', 'delta']),
    hqCards: pick(HQ_CARDS, settings.hq_dashboard, ['on']),
    people: pick(PEOPLE_COLS, settings.people_columns, ['simple', 'studio']),
    downloads: Object.fromEntries(DOWNLOADS.map(([k]) => [k, { on: true, hide: [], roles: null, ...(settings.downloads?.[k] || {}) }])),
    roleNames: settings.role_names || {},
    calendar: { overlap: 2, ...(settings.calendar || {}) },
    finance: { inCats: DEFAULT_IN_CATS, outCats: DEFAULT_OUT_CATS, ...(settings.finance || {}) },
    lists: { pageSize: 40, top: 10, ...(settings.lists || {}) },
  };
}
export const DEFAULT_CONFIG = buildConfig(null);

/* parts of the app a center can have; turned off per center on Settings → Centers */
export const FEATURES = [
  ['calls', 'Follow-up calls'], ['leadership', 'Leadership evaluations'], ['roadmap', 'Teaching roadmap'], ['calendar', 'Calendar & events'],
  ['plans', 'Plans & budget'], ['meeting', 'Leaders’ meetings'], ['departments', 'Departments'], ['finance', 'Admin & finance'], ['messages', 'Messages with HQ'],
];
export const featureOn = (center, key) => !center?.features || center.features[key] !== false;
export const CURRENCIES = [['ETB', 'Birr (ETB)'], ['USD', 'US dollar (USD)'], ['EUR', 'Euro (EUR)'], ['GBP', 'Pound (GBP)'], ['KES', 'Kenyan shilling (KES)'], ['AED', 'Dirham (AED)'], ['SAR', 'Riyal (SAR)'], ['CAD', 'Canadian dollar (CAD)']];
const SYMBOL = { ETB: 'birr', USD: '$', EUR: '€', GBP: '£', KES: 'KSh', AED: 'AED', SAR: 'SAR', CAD: 'CA$' };
/* an amount in a center's currency, e.g. "1,500 birr" or "$1,500" */
export function money(n, cur = 'ETB', zero = '–') {
  if (!n && n !== 0) return zero;
  if (!Number(n)) return zero;
  const v = Number(n).toLocaleString('en-US', { maximumFractionDigits: cur === 'ETB' ? 0 : 2 });
  const s = SYMBOL[cur] || cur;
  return cur === 'ETB' || s.length > 2 ? `${v} ${s}` : `${s}${v}`;
}
export const curOf = (center) => center?.currency || 'ETB';
