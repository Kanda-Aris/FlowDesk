// ต้นไม้ Head/Sub (เจ้าของไฟล์: A) ฟังก์ชันล้วน ไม่เรียกฐานข้อมูล
// รับรายการ workspace ที่ผู้ใช้ "เห็น" (จาก api.listWorkspaces) ซึ่งมี parent_id อยู่แล้ว
// สิทธิ์จริงฐานข้อมูลเป็นผู้ตัดสิน ฟังก์ชันที่นี่ใช้แค่จัดการแสดงผลและซ่อนปุ่ม
export const MAX_DEPTH = 5; // ตรงกับตัวกันในฐานข้อมูล (error: too_deep)

// รายการแบนเรียงแบบ DFS: [{ ws, depth, hasChildren }]
// รากคือ workspace ที่ไม่มี "แม่ที่ผู้ใช้เห็น" (เช่น คนอยู่ใน Sub อย่างเดียวจะเห็น Sub เป็นราก)
export function flattenTree(list) {
  const ids = new Set(list.map((w) => w.id));
  const kids = new Map();
  for (const w of list) {
    const p = w.parent_id && w.parent_id !== w.id && ids.has(w.parent_id) ? w.parent_id : null;
    if (!kids.has(p)) kids.set(p, []);
    kids.get(p).push(w);
  }
  const out = [];
  const seen = new Set();
  const walk = (parent, depth) => {
    for (const w of kids.get(parent) || []) {
      if (seen.has(w.id)) continue;
      seen.add(w.id);
      out.push({ ws: w, depth, hasChildren: (kids.get(w.id) || []).length > 0 });
      walk(w.id, depth + 1);
    }
  };
  walk(null, 0);
  for (const w of list) if (!seen.has(w.id)) { seen.add(w.id); out.push({ ws: w, depth: 0, hasChildren: false }); } // กันข้อมูลวนลูป
  return out;
}

// id ของ workspace นี้และ Sub ทุกชั้นที่เห็น (รวมตัวเองเป็นตัวแรก)
export function treeIds(list, rootId) {
  const kids = new Map();
  for (const w of list) {
    if (!w.parent_id) continue;
    if (!kids.has(w.parent_id)) kids.set(w.parent_id, []);
    kids.get(w.parent_id).push(w.id);
  }
  const out = [];
  const seen = new Set([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop();
    out.push(id);
    for (const c of kids.get(id) || []) if (!seen.has(c)) { seen.add(c); stack.push(c); }
  }
  return out;
}

// ตัวเอง + แม่ที่เห็น เรียงจากบนลงล่าง: [Head, Sub, ..., ตัวเอง]
export function chainOf(list, id) {
  const by = new Map(list.map((w) => [w.id, w]));
  const out = [];
  let cur = by.get(id);
  for (let i = 0; cur && i < 10; i++) {
    out.unshift(cur);
    cur = cur.parent_id ? by.get(cur.parent_id) : null;
  }
  return out;
}

export const depthOf = (list, id) => Math.max(0, chainOf(list, id).length - 1);
// หมายเหตุ: ไม่มีการเช็กชื่อบทบาทที่นี่แล้ว (FR-33) ใช้ api.myPermissions + api.hasPerm แทน
