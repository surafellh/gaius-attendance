// Who can do what. The database enforces the same rules (can_read / can_mark / can_manage).
export const ROLES = [
  ['admin', 'Admin', 'Everything, all centers, approves users'],
  ['founder', 'Founder / Visionary', 'Sees every center (read only)'],
  ['director', 'Director', 'Sees every center (read only)'],
  ['hq_followup', 'HQ Follow-up', 'Sees every center, profiles and follow-up (read only)'],
  ['hq_staff', 'HQ staff', 'Sees every center (read only)'],
  ['center_leader', 'Center leader', 'Runs the center: people, groups, departments, users'],
  ['followup_leader', 'Follow-up leader', 'Manages people, groups, responsible persons'],
  ['leader', 'Leader', 'Marks attendance, records programs, registers new comers'],
  ['viewer', 'Viewer', 'Sees the center, cannot change anything'],
  ['former', 'Former leader', 'No access – record kept'],
  ['pending', 'Waiting for approval', 'No access yet'],
];
export const roleName = (r) => ROLES.find((x) => x[0] === r)?.[1] || r;
const HQ = ['admin', 'founder', 'director', 'hq_followup', 'hq_staff'];
export const can = (profile) => {
  const r = profile?.role;
  return {
    read: r && !['pending', 'former'].includes(r),
    mark: ['admin', 'center_leader', 'followup_leader', 'leader'].includes(r),
    manage: ['admin', 'center_leader', 'followup_leader'].includes(r),
    users: ['admin', 'center_leader'].includes(r),
    admin: r === 'admin',
    hq: HQ.includes(r),
    profiles: ['admin', 'founder', 'director', 'hq_followup', 'center_leader', 'followup_leader', 'leader'].includes(r),
  };
};
