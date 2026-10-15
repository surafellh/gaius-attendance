// Parse an Amharic monthly program report, e.g.
//   መስከረም 10 - ፓ/ር ፍፄ - ትምህርት - ትንቢተ ሚልክያስ
// Line format: <month> <day> - <minister> - <program> - <topic>
import { etNewYear } from './ethiopian.js';

const MONTHS = [
  ['መስከረም', 'meskerem'], ['ጥቅምት', 'tikimt', 'tikemt'], ['ኅዳር', 'ህዳር', 'hidar'], ['ታኅሣሥ', 'ታህሳስ', 'ታሕሳስ', 'tahsas', 'tahesas'],
  ['ጥር', 'tir'], ['የካቲት', 'yekatit'], ['መጋቢት', 'megabit'], ['ሚያዝያ', 'ሚያዚያ', 'miyazya', 'miyazia'], ['ግንቦት', 'ginbot'],
  ['ሰኔ', 'sene'], ['ሐምሌ', 'ሀምሌ', 'hamle'], ['ነሐሴ', 'ነሀሴ', 'nehase'], ['ጳጉሜ', 'ጳጉሜን', 'pagume'],
];
const KINDS = [
  [/ትምህርት|teaching/i, 'Teaching'], [/አንድነት|ህብረት|ኅብረት|fellowship/i, 'Fellowship / get-together'],
  [/አምልኮ|worship/i, 'Worship night'], [/ጸሎት|ፀሎት|prayer/i, 'Prayer'], [/ውይይት|discussion/i, 'Discussion'],
  [/ዲቮሽን|devotion/i, 'Devotion'], [/ስልጠና|ሥልጠና|training/i, 'Training'], [/ወንጌል|outreach|evangel/i, 'Outreach'],
  [/የለም|no meeting|ፕሮግራም የለም/i, 'No meeting'],
];
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
    const parts = m[3].split(/\s+-\s*|\s*-\s+|^-|-$/).map((s) => s.trim());
    while (parts.length < 3) parts.push('');
    const [ministerRaw, programRaw, ...topicParts] = parts;
    const topicRaw = topicParts.join(' - ').trim();
    const kind = KINDS.find(([re]) => re.test(programRaw))?.[1] || (programRaw ? 'Special program' : 'Teaching');
    const day = Number(m[2]);
    const t = etNewYear(year) + (mi * 30 + day - 1) * DAY;
    const sunday = new Date(t).toISOString().slice(0, 10);
    const isSunday = new Date(t).getUTCDay() === 0;
    rows.push({
      sunday, isSunday, label: `${m[1]} ${String(day).padStart(2, '0')}`,
      kind, topic: kind === 'Special program' && !topicRaw ? programRaw : topicRaw || (kind === 'Fellowship / get-together' ? programRaw : ''),
      minister: MINISTER_ALIASES[ministerRaw] || ministerRaw, planned_by: 'HQ', notes: null,
    });
  }
  return { rows, skipped };
}
