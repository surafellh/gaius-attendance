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
export const roleName = (r) => ROLES.find((x) => x[0] === r)?.[1] || r;
export const HQ_ROLES = ['admin', 'founder', 'director', 'hq_followup', 'hq_staff'];
const EDIT = ['admin', 'coordinator', 'followup_leader'];

/* opts.studio: the detailed mode (every center user can switch it on; editing still follows the role).
   opts.side: 'hq' | 'center' – the admin can use either side; HQ roles always get the HQ side. */
export const can = (profile, opts = {}) => {
  const r = profile?.role;
  const edit = EDIT.includes(r);
  return {
    role: r,
    read: !!r && !['pending', 'former'].includes(r),
    mark: edit,
    manage: edit,
    edit,
    users: ['admin', 'coordinator'].includes(r),
    admin: r === 'admin',
    hq: HQ_ROLES.includes(r),
    // the HQ lens: leaders, members and informal members only; no new comer names, no plan status
    hqView: HQ_ROLES.includes(r) && r !== 'admin',
    profiles: ['admin', 'founder', 'director', 'hq_followup', 'coordinator', 'center_leader', 'followup_leader', 'leader'].includes(r),
    finance: r !== 'viewer',
    meetingBanner: ['admin', 'coordinator', 'center_leader', 'followup_leader', 'leader'].includes(r),
    switchCenter: HQ_ROLES.includes(r),
    studio: !!r && !!opts.studio,
    canStudio: !!r,
    // the HQ side is its own app: every center at once, HQ's own plans. The admin can switch sides.
    hqSide: HQ_ROLES.includes(r) && (r !== 'admin' || opts.side === 'hq'),
    hqEdit: HQ_ROLES.includes(r),        // HQ plans & activities, HQ events, HQ teaching plan, messages as HQ
    backup: ['admin', 'coordinator'].includes(r),
    restore: r === 'admin',
  };
};

/* what each role can do – shown on the App admin page */
const ALL = ROLES.filter(([k]) => !['former', 'pending'].includes(k)).map(([k]) => k);
export const ACCESS = [
  ['See attendance, dashboard & reports', ALL],
  ['HQ view: every center, leaders / members / informal members only', ['founder', 'director', 'hq_followup', 'hq_staff']],
  ['Profiles and phone numbers', ['admin', 'founder', 'director', 'hq_followup', 'coordinator', 'center_leader', 'followup_leader', 'leader']],
  ['Edit: attendance, people, programs, plans, finance, calls', EDIT],
  ['Studio mode (full detail)', ALL],
  ['HQ side: all centers at once, HQ plans & activities', HQ_ROLES],
  ['HQ events, HQ teaching plan, messages as HQ', HQ_ROLES],
  ['Approve users and set roles', ['admin', 'coordinator']],
  ['Backup', ['admin', 'coordinator']],
  ['Restore a backup', ['admin']],
];
