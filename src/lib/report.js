// Parse an Amharic monthly program report, e.g.
//   መስከረም 10 - ፓ/ር ፍፄ - ትምህርት - ትንቢተ ሚልክያስ
// Line format: <month> <day> - <minister> - <program> - <topic>
import { etNewYear } from './ethiopian.js';

const MONTHS = [
  ['መስከረም', 'meskerem'], ['ጥቅምት', 'tikimt', 'tikemt'], ['ኅዳር', 'ህዳር', 'hidar'], ['ታኅሣሥ', 'ታህሳስ', 'ታሕሳስ', 'tahsas', 'tahesas'],
  ['ጥር', 'tir'], ['የካቲት', 'yekatit'], ['መጋቢት', 'megabit'], ['ሚያዝያ', 'ሚያዚያ', 'miyazya', 'miyazia'], ['ግንቦት', 'ginbot'],
  ['ሰኔ', 'sene'], ['ሐምሌ', 'ሀምሌ', 'hamle'], ['ነሐሴ', 'ነሀሴ', 'nehase'], ['ጳጉሜ', 'ጳጉሜን', 'ጷጉሜ', 'ጷጉሜን', 'pagume'],
];
const KINDS = [
  [/ትምህርት|teaching/i, 'Teaching'], [/አንድነት|ህብረት|ኅብረት|fellowship/i, 'Fellowship / get-together'],
  [/አምልኮ|worship|ወርሺፕ/i, 'Worship night'], [/ጸሎት|ፀሎት|prayer/i, 'Prayer'], [/ውይይት|discussion/i, 'Discussion'],
  [/ዲቮሽን|devotion/i, 'Devotion'], [/ስልጠና|ሥልጠና|training/i, 'Training'], [/ወንጌል|outreach|evangel/i, 'Outreach'],
  [/ጥናት|bible study|study/i, 'Bible study'],
];
const NONE = /የለም|no meeting|አልነበረም/i;
const KIND_WORDS = /^(የ\s*)?(ትምህርት|አንድነት|ህብረት|ኅብረት|አምልኮ|ፀሎት|ጸሎት|ውይይት|ዲቮሽን|ስልጠና|ሥልጠና|ጥናት)(\s*ጊዜ)?$/;
export const MINISTER_ALIASES = { 'ፓ/ር ፍፄ': 'ፓ/ር ፍፁም (Pastor Fitsum)', 'ፓር ፍፄ': 'ፓ/ር ፍፁም (Pastor Fitsum)' };

const monthIndex = (w) => MONTHS.findIndex((v) => v.some((n) => n.toLowerCase() === w.toLowerCase()));
const DAY = 86400000;

export function parseReport(text, year) {
  const rows = [], skipped = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^([^\s\d-]+)\s*(\d{1,2})\s*-?\s*(.*)$/);
    const mi = m ? monthIndex(m[1]) : -1;
    if (!m || mi < 0) { skipped.push(line); continue; }
    const parts = m[3].split(/\s+-\s*|\s*-\s+|^-|-$/).map((x) => x.trim());
    const filled = parts.filter(Boolean);
    if (!filled.length) { skipped.push(line); continue; }
    let kind, minister = '', topic = '', notes = null;
    if (filled.some((x) => NONE.test(x))) { kind = 'No meeting'; notes = filled.join(' – '); }
    else {
      const k = parts.findIndex((x) => x && !x.startsWith('(') && KINDS.some(([re]) => re.test(x)));
      if (k >= 0) {
        const kp = parts[k];
        kind = KINDS.find(([re]) => re.test(kp))[1];
        minister = parts.slice(0, k).filter(Boolean).join(' ');
        topic = parts.slice(k + 1).filter(Boolean).join(' - ');
        if (!KIND_WORDS.test(kp)) { if (!topic) topic = kp; else notes = kp; } // e.g. "ትምህርት እና ፀሎት"
      } else if (filled.length === 1) { kind = 'Special program'; topic = filled[0]; }
      else { kind = 'Special program'; minister = parts[0]; topic = parts.slice(1).filter(Boolean).join(' - '); }
    }
    const day = Number(m[2]);
    let t = etNewYear(year) + (mi * 30 + day - 1) * DAY;
    let isSunday = new Date(t).getUTCDay() === 0, label = `${m[1]} ${String(day).padStart(2, '0')}`;
    if (!isSunday) { // a report date one day off (e.g. Yekatit 02 for Yekatit 01) snaps to that Sunday
      const wd = new Date(t).getUTCDay();
      if (wd === 1 || wd === 6) { t += (wd === 1 ? -1 : 1) * DAY; isSunday = true; label += ' (moved to Sunday)'; }
    }
    rows.push({
      sunday: new Date(t).toISOString().slice(0, 10), isSunday, label,
      kind, topic, minister: MINISTER_ALIASES[minister] || minister, planned_by: 'HQ', notes,
    });
  }
  return { rows, skipped };
}

/* Events list, one per line:  "ጥቅምት 15 - የመሪዎች ስልጠና - ቦታ"  or a range "ጥቅምት 15-17 - Retreat - Bishoftu".
   A year written on the line (e.g. "ጥቅምት 15 2019") wins over the default year. */
export function parseEvents(text, year) {
  const rows = [], skipped = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim().replace(/^[-•*\d.)\s]+(?=[^\d\s])/, '');
    if (!line) continue;
    const m = line.match(/^([^\s\d-]+)\s*(\d{1,2})(?:\s*(?:-|–|እስከ)\s*(\d{1,2}))?(?:[\s,]+(20\d\d))?\s*[-–:]?\s*(.*)$/);
    const mi = m ? monthIndex(m[1]) : -1;
    if (!m || mi < 0 || !m[5]) { skipped.push(line); continue; }
    const y = Number(m[4] || year);
    const d1 = Number(m[2]), d2 = m[3] ? Number(m[3]) : null;
    const at = (d) => new Date(etNewYear(y) + (mi * 30 + d - 1) * DAY).toISOString().slice(0, 10);
    const [title, location, ...rest] = m[5].split(/\s+[-–]\s+/).map((s) => s.trim());
    rows.push({ starts_on: at(d1), ends_on: d2 && d2 > d1 ? at(d2) : null, title, location: location || null, notes: rest.join(' – ') || null, label: `${m[1]} ${d1}${d2 ? '–' + d2 : ''}` });
  }
  return { rows, skipped };
}
