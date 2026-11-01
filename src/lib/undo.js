// Undo / redo for this session. Each change records how to put things back (and how to do it again).
// Rows are written back exactly as they were, so an undone delete comes back with the same id.
import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';

const past = [], future = [];
let listeners = new Set();
let busy = false;
const emit = () => { snap = { canUndo: past.length > 0, canRedo: future.length > 0, undoLabel: past[past.length - 1]?.label, redoLabel: future[future.length - 1]?.label, busy }; listeners.forEach((f) => f()); };
let snap = { canUndo: false, canRedo: false, busy: false };
let onChange = () => {};
export const setUndoReload = (f) => { onChange = f; };

/* record a change that already happened: { label, undo: async () => {}, redo: async () => {} } */
export function record(step) {
  past.push(step); if (past.length > 60) past.shift();
  future.length = 0; emit();
}
async function run(from, to, key) {
  if (busy || !from.length) return null;
  const step = from.pop(); busy = true; emit();
  try { await step[key](); to.push(step); } catch (e) { from.push(step); busy = false; emit(); throw e; }
  busy = false; emit(); onChange();
  return step.label;
}
export const undo = () => run(past, future, 'undo');
export const redo = () => run(future, past, 'redo');
export const useUndo = () => useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, () => snap);

const check = async (q) => { const { error } = await q; if (error) throw error; };
const pick = (row, keys) => Object.fromEntries(keys.map((k) => [k, row?.[k] ?? null]));

/* an update of one row by id: before / after hold only the changed fields */
export function recordUpdate(table, id, before, after, label) {
  record({ label, undo: () => check(supabase.from(table).update(before).eq('id', id)), redo: () => check(supabase.from(table).update(after).eq('id', id)) });
}
/* an insert: undo deletes it, redo puts the same row back */
export function recordInsert(table, row, label) {
  record({ label, undo: () => check(supabase.from(table).delete().eq('id', row.id)), redo: () => check(supabase.from(table).insert(row)) });
}
/* a delete: undo puts the whole row back */
export function recordDelete(table, row, label) {
  record({ label, undo: () => check(supabase.from(table).insert(row)), redo: () => check(supabase.from(table).delete().eq('id', row.id)) });
}
/* attendance marks, keyed by person + Sunday: rows before (null = there was no row) and after */
export function recordMarks(befores, afters, label) {
  const keys = ['status', 'called', 'reason', 'category', 'active'];
  const back = befores.filter((b) => b.row).map((b) => ({ person_id: b.person_id, sunday: b.sunday, ...pick(b.row, keys) })); // snapshot now
  afters = afters.map((a) => ({ ...a }));
  record({
    label,
    undo: async () => {
      if (back.length) await check(supabase.from('attendance').upsert(back, { onConflict: 'person_id,sunday' }));
      for (const b of befores.filter((x) => !x.row)) await check(supabase.from('attendance').update({ status: null, called: false, reason: null }).eq('person_id', b.person_id).eq('sunday', b.sunday));
    },
    redo: () => check(supabase.from('attendance').upsert(afters, { onConflict: 'person_id,sunday' })),
  });
}
