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
  ['compare', 'Compared with a year earlier', true, true],
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
  ['rate', 'Leaders & members rate', true, false],
  ['leaders', 'Leaders', true, true],
  ['members', 'Members', true, true],
  ['informalnc', 'Informal & new comers (together)', true, false],
  ['informal', 'Informal members', false, true],
  ['others', 'Others', false, true],
  ['firsttime', 'First-time comers', false, true],
  ['needcall', 'Need a call', true, true],
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
    tiles: pick(KPI_TILES, settings.tiles, ['center', 'hq']),
    hqCards: pick(HQ_CARDS, settings.hq_dashboard, ['on']),
    people: pick(PEOPLE_COLS, settings.people_columns, ['simple', 'studio']),
    downloads: Object.fromEntries(DOWNLOADS.map(([k]) => [k, { on: true, hide: [], roles: null, ...(settings.downloads?.[k] || {}) }])),
    roleNames: settings.role_names || {},
  };
}
export const DEFAULT_CONFIG = buildConfig(null);
