// ตัวช่วยเรื่อง @mention (AI B)
// ข้อความที่เก็บในฐานข้อมูลใช้รูปแบบ @[user-uuid] (trigger ของ A อ่านรูปแบบนี้)
// หน้าจอแสดงเป็น @ชื่อ โดยแปลงจากรายชื่อสมาชิก ถ้าไม่รู้จัก id จะแสดง @สมาชิก
import styles from './mentions.module.css';

const TOKEN_SRC = '@\\[([0-9a-fA-F-]{36})\\]';

export const memberName = (p) => (p && (p.name || p.email)) || '';

// รายชื่อสมาชิกจาก listMembers → { userId: ชื่อ }
export function nameMap(members) {
  const m = {};
  (members || []).forEach((x) => { if (x.profiles) m[x.profiles.id] = memberName(x.profiles); });
  return m;
}

const nameFor = (nameOf, id) => nameOf[id] || nameOf[id.toLowerCase()] || 'สมาชิก';

// แปลง token เป็นข้อความธรรมดา "@ชื่อ" (ใช้ตอนต้องตัดข้อความ)
export function mentionsToText(text, nameOf) {
  return String(text || '').replace(new RegExp(TOKEN_SRC, 'g'), (_, id) => '@' + nameFor(nameOf, id));
}

// แปลง token เป็นป้ายชื่อ ผลลัพธ์เป็น text node และ <span> เท่านั้น (ไม่ใช่ HTML จึงปลอดภัย)
export function renderMentions(text, nameOf) {
  const s = String(text || '');
  const re = new RegExp(TOKEN_SRC, 'g');
  const out = [];
  let last = 0;
  let m;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(<span key={m.index} className={styles.mention}>{'@' + nameFor(nameOf, m[1])}</span>);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ก่อนส่ง: แปลง "@ชื่อ" ที่เลือกจากรายการ (picked = Map ชื่อ → id) ให้เป็น @[uuid]
// ชื่อที่พิมพ์เองหรือแก้ภายหลังจะไม่ถูกแปลง ก็จะเป็นข้อความธรรมดา
export function toTokens(text, picked) {
  let out = text;
  const entries = [...picked.entries()].sort((a, b) => b[0].length - a[0].length); // ชื่อยาวก่อน
  for (const [name, id] of entries) {
    const re = new RegExp('@' + escapeRe(name) + '(?=$|[\\s.,!?;:)])', 'g');
    out = out.replace(re, () => '@[' + id + ']');
  }
  return out;
}
