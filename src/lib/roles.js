import { DEFAULT_CONFIG, CAPS, CENTER_ROLE_KEYS, HQ_ROLE_KEYS } from './config';
// Who can do what. The database enforces the same rules (can_read / can_mark / can_manage).
// Only the Coordinator (አገልግሎት አስተባባሪ), the Follow-up leader and the admin change data; everyone else views.
export const ROLES = [
  ['admin', 'Admin', 'Everything, every center, approves users, backup & restore'],
  ['founder', 'Founder / Visionary', 'Sees every center (HQ view)'],
  ['director', 'Director', 'Sees every center (HQ view)'],
  ['hq_followup', 'HQ Follow-up', 'Sees every center (HQ view), profiles'],
  ['hq_staff', 'HQ staff', 'Sees every center (HQ view)'],
  ['coordinator', 'Coordinator (አገልግሎት አስተባባሪ)', 'Runs the center: edits everything, approves the center’s users'],
  ['followup_leader', 'Follow-up leader', 'Edits attendance, people, follow-up and plans'],
  ['center_leader', 'Center leader', 'Sees the whole center (view only)'],
  ['leader', 'Leader', 'Sees the center (view only)'],
  ['viewer', 'Viewer', 'Sees the center, no profiles (view only)'],
  ['former', 'Former leader', 'No access – record kept'],
  ['pending', 'Waiting for approval', 'No access yet'],
];
let NAMES = {};
export const setRoleNames = (n) => { NAMES = n || {}; };
export const roleName = (r) => NAMES[r] || ROLES.find((x) => x[0] === r)?.[1] || r;
export const HQ_ROLES = ['admin', 'founder', 'director', 'hq_followup', 'hq_staff'];
const HQ_ONLY = ['founder', 'director', 'hq_followup', 'hq_staff'];
export const ROLE_SIDE = {};   // role → 'center' | 'hq'
const fill = (arr, items) => { arr.splice(0, arr.length, ...items); };
/* roles come from the app_roles table (Settings → Roles); the lists above are updated in place so every page sees them */
export function setRoles(rows) {
  if (!rows?.length) return;
  const sorted = [...rows].sort((a, b) => (a.side === b.side ? 0 : a.side === 'hq' ? -1 : 1) || (a.sort ?? 100) - (b.sort ?? 100) || a.name.localeCompare(b.name));
  fill(ROLES, [ROLES.find((r) => r[0] === 'admin'), ...sorted.map((r) => [r.key, r.name, r.description || '']), ['former', 'Former leader', 'No access – record kept'], ['pending', 'Waiting for approval', 'No access yet']]);
  const hq = sorted.filter((r) => r.side === 'hq').map((r) => r.key), center = sorted.filter((r) => r.side === 'center').map((r) => r.key);
  fill(HQ_ROLES, ['admin', ...hq]); fill(HQ_ONLY, hq); fill(HQ_ROLE_KEYS, hq); fill(CENTER_ROLE_KEYS, center);
  for (const r of rows) ROLE_SIDE[r.key] = r.side;
}

/* the account's HQ role: its main role when it is HQ only, else the extra HQ role (or none) */
export const hqRoleOf = (p) => (HQ_ONLY.includes(p?.role) ? p.role : p?.hq_role || null);
/* does this account have both a center side and an HQ side? */
export const hasBothSides = (p) => p?.role === 'admin' || (!!p?.hq_role && !HQ_ROLES.includes(p?.role) && !['pending', 'former'].includes(p?.role));

/* opts.studio: the detailed mode. opts.side: 'hq' | 'center' for accounts with both sides.
   opts.config: the Settings page (what each role can do). A center role's rights apply on the center side,
   the HQ role's rights on the HQ side – one never adds to the other. */
export const can = (profile, opts = {}) => {
  const r = profile?.role;
  const caps = opts.config?.caps || DEFAULT_CONFIG.caps;
  const admin = r === 'admin';
  const read = !!r && !['pending', 'former'].includes(r);
  const hqRole = hqRoleOf(profile);
  const both = hasBothSides(profile);
  const hqSide = read && (admin ? opts.side === 'hq' : HQ_ONLY.includes(r) || (both && opts.side === 'hq'));
  const sideRole = hqSide && !admin ? hqRole : r;       // whose abilities apply right now
  const has = (c) => admin || (read && !!caps[sideRole]?.has(c));
  const centerHas = (c) => admin || (read && !HQ_ONLY.includes(r) && !!caps[r]?.has(c));
  return {
    role: r, read, admin, hqRole, both,
    mark: centerHas('mark'),
    manage: centerHas('manage'),
    edit: centerHas('mark') || centerHas('manage'),
    users: admin || centerHas('approve'),
    hq: HQ_ROLES.includes(r) || !!hqRole,
    // the HQ lens: leaders, members and informal members only; no new comer names, no plan status
    hqView: HQ_ONLY.includes(r) || (hqSide && !admin),
    profiles: has('phones'),
    finance: has('finance'),
    download: has('download'),
    meetingBanner: !hqSide && has('reminders'),
    switchCenter: HQ_ROLES.includes(r),
    canStudio: has('studio'),
    studio: has('studio') && !!opts.studio,
    hqSide,
    hqEdit: admin || (!!hqRole && (profile?.hq_access ?? (HQ_ONLY.includes(r) ? 'edit' : 'view')) === 'edit'),
    backup: has('backup'),
    restore: admin,
  };
};

/* what each role can do – from the Settings page */
export const accessTable = (config) => CAPS.map(([cap, label, side]) => [label, ['admin', ...Object.keys(config.caps).filter((r) => config.caps[r].has(cap))], side]);
