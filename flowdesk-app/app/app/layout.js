'use client';
// เมนูกลางของทุกหน้าใต้ /app (เจ้าของไฟล์: A) หน้าอื่นอ่าน ws/project จาก URL ตามสัญญา
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as api from '../../lib/api';
import { colorOf, initial, errText } from '../../lib/ui';
import { flattenTree, treeIds, chainOf, depthOf, MAX_DEPTH } from '../../lib/workspace-tree';
import NotificationBell from '../../components/collab/NotificationBell';
import { DialogProvider, useDialogs } from '../../components/ui/Dialogs';

const TABS = [
  ['/app', 'รายการ'],
  ['/app/board', 'Board'],
  ['/app/calendar', 'ปฏิทิน'],
  ['/app/gantt', 'Gantt'],
  ['/app/dashboard', 'Dashboard'],
  ['/app/chat', 'แชท'],
];

function Av({ name, id, small }) {
  return <span className={'av' + (small ? ' sm' : '')} style={{ background: colorOf(id || name) }}>{initial(name)}</span>;
}

function Shell({ children }) {
  const router = useRouter();
  const { askText } = useDialogs();
  const path = usePathname();
  const sp = useSearchParams();
  const ws = sp.get('ws');
  const project = sp.get('project');
  const mine = sp.get('view') === 'mine';
  const [user, setUser] = useState(null);
  const [wss, setWss] = useState([]);
  const [perms, setPerms] = useState(null); // ผลของ my_permissions ของ workspace ที่เลือก (null = ยังโหลดไม่เสร็จ)
  const [projects, setProjects] = useState([]);
  const [projWs, setProjWs] = useState(null);
  const [menu, setMenu] = useState(false);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');

  const q = (w, p) => `ws=${w}${p ? `&project=${p}` : ''}`;
  const section = path === '/app' || path === '/app/' ? '/app' : path;

  useEffect(() => {
    api.currentUser().then(async (u) => {
      if (!u) { router.replace('/login'); return; }
      setUser(u);
      try {
        setWss(await api.listWorkspaces());
      } catch (e) { setErr(errText(e)); }
      setReady(true);
    });
  }, [router]);

  // โหลดรายชื่อ Workspace ใหม่ถ้ามี ws ที่ยังไม่อยู่ในรายการ (เช่นเพิ่งสร้าง)
  useEffect(() => {
    if (!ready || !ws || !user || wss.some((w) => w.id === ws)) return;
    api.listWorkspaces().then(setWss).catch(() => {});
  }, [ws, ready, wss, user]);

  // ต้นไม้ Head/Sub: รากคือ workspace ที่ไม่มีแม่ที่ฉันมองเห็น
  const tree = useMemo(() => flattenTree(wss), [wss]);

  // สิทธิ์ของฉันใน workspace ที่เลือก (ฐานข้อมูลคำนวณจากติ๊ก รวมสิทธิ์จาก Head ที่ "ใช้ใน Sub") ใช้ซ่อน/แสดงปุ่มเท่านั้น
  useEffect(() => {
    setPerms(null);
    if (!ws) return;
    let alive = true;
    api.myPermissions(ws).then((p) => { if (alive) setPerms(p); }).catch(() => { if (alive) setPerms({ perms: [] }); });
    return () => { alive = false; };
  }, [ws, project]);

  useEffect(() => {
    if (!ws) { setProjects([]); setProjWs(null); return; }
    api.listProjects(ws).then((p) => { setProjects(p); setProjWs(ws); }).catch(() => {});
  }, [ws, project]);

  // ค่าเริ่มต้น: ถ้ายังไม่ได้เลือก ให้เปิด Workspace/โปรเจกต์แรกในหน้ารายการ
  useEffect(() => {
    if (!ready || path !== '/app' || mine) return;
    if (!ws && tree[0]) router.replace(`/app?${q(tree[0].ws.id)}`);
    else if (ws && !project && projWs === ws && projects[0]) router.replace(`/app?${q(ws, projects[0].id)}`);
  }, [ready, path, mine, ws, project, tree, projects, projWs, router]);

  const addWs = async () => {
    const n = await askText({ title: 'สร้าง Workspace ใหม่', label: 'ชื่อ Workspace', okLabel: 'สร้าง', maxLength: 60 });
    if (!n) return; // ยกเลิก
    api.createWorkspace(n.trim()).then((w) => { setMenu(false); router.push(`/app?${q(w.id)}`); }).catch((e) => setErr(errText(e)));
  };
  // สร้าง Sub ใต้ workspace ที่เลือก (admin ขึ้นไปของ workspace นี้หรือแม่ของมัน; ฐานข้อมูลตรวจซ้ำ)
  const addSub = async () => {
    if (!ws) return;
    const parent = wss.find((w) => w.id === ws);
    const n = await askText({ title: `สร้าง Sub ใน «${parent?.name || ''}»`, label: 'ชื่อ Sub Workspace', okLabel: 'สร้าง', maxLength: 60 });
    if (!n) return; // ยกเลิก
    api.createSubWorkspace(n.trim(), ws).then((w) => { setMenu(false); router.push(`/app?${q(w.id)}`); }).catch((e) => setErr(errText(e)));
  };
  const addProject = async () => {
    if (!ws) return;
    const n = await askText({ title: 'สร้างโปรเจกต์ใหม่', label: 'ชื่อโปรเจกต์', okLabel: 'สร้าง', maxLength: 80 });
    if (!n) return; // ยกเลิก
    api.createProject(ws, n.trim()).then((p) => { setMenu(false); router.push(`${section}?${q(ws, p.id)}`); }).catch((e) => setErr(e.message));
  };
  const logout = async () => { await api.signOut(); router.replace('/login'); };

  if (!ready) return <div className="center muted">กำลังโหลด…</div>;
  const curWs = wss.find((w) => w.id === ws);
  const curProject = projects.find((p) => p.id === project);
  const canSub = !!curWs && api.hasPerm(perms, 'workspace.create_sub') && depthOf(wss, ws) < MAX_DEPTH - 1;
  const hasSubs = !!curWs && treeIds(wss, ws).length > 1;
  const crumbWs = chainOf(wss, ws).map((w) => w.name).join(' › ') || curWs?.name;

  return (
    <div className="layout">
      <aside className={'side' + (menu ? ' open' : '')}>
        <div className="logo"><b>Fd</b> FlowDesk</div>
        <Link className={'nav' + (mine ? ' on' : '')} href="/app?view=mine" onClick={() => setMenu(false)}><span>📌</span><span className="nm">งานของฉัน</span></Link>
        <div className="sec">Workspace</div>
        {tree.map(({ ws: w, depth }) => (
          <Link key={w.id} className={'nav' + (!mine && ws === w.id ? ' on' : '')} style={depth ? { paddingLeft: 10 + Math.min(depth, 4) * 14 } : undefined} href={`/app?${q(w.id)}`} title={w.name} onClick={() => setMenu(false)}>
            <Av name={w.name} id={w.id} /><span className="nm">{w.name}</span>
          </Link>
        ))}
        <button className="nav add" onClick={addWs}><span>＋</span><span className="nm">สร้าง Workspace</span></button>
        {ws && !mine && (<>
          <div className="sec">โปรเจกต์</div>
          {projects.map((p) => (
            <Link key={p.id} className={'nav' + (project === p.id ? ' on' : '')} href={`${section}?${q(ws, p.id)}`} onClick={() => setMenu(false)}><span>▤</span><span className="nm">{p.name}</span></Link>
          ))}
          <button className="nav add" onClick={addProject}><span>＋</span><span className="nm">โปรเจกต์ใหม่</span></button>
          <div className="sec">Workspace นี้</div>
          {hasSubs && <Link className={'nav' + (section === '/app/rollup' ? ' on' : '')} href={`/app/rollup?ws=${ws}`} onClick={() => setMenu(false)}><span>🗂</span><span className="nm">งานรวม (รวม Sub)</span></Link>}
          {canSub && <button className="nav add" onClick={addSub}><span>⊕</span><span className="nm">สร้าง Sub ใน «{curWs?.name}»</span></button>}
          <Link className={'nav' + (section === '/app/chat' ? ' on' : '')} href={`/app/chat?ws=${ws}`} onClick={() => setMenu(false)}><span>💬</span><span className="nm">แชท</span></Link>
          <Link className={'nav' + (section === '/app/assistant' ? ' on' : '')} href={`/app/assistant?ws=${ws}`} onClick={() => setMenu(false)}><span>🤖</span><span className="nm">ผู้ช่วย AI</span></Link>
          <Link className={'nav' + (section === '/app/activity' ? ' on' : '')} href={`/app/activity?ws=${ws}`} onClick={() => setMenu(false)}><span>🕘</span><span className="nm">กิจกรรม</span></Link>
          <Link className={'nav' + (section === '/app/settings' ? ' on' : '')} href={`/app/settings?ws=${ws}`} onClick={() => setMenu(false)}><span>⚙</span><span className="nm">ตั้งค่า</span></Link>
        </>)}
        <div className="me">
          <Av name={user?.email} id={user?.id} small />
          <span className="em">{user?.email}</span>
          <button className="ibtn" onClick={logout} title="ออกจากระบบ" aria-label="ออกจากระบบ">⎋</button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <button className="ibtn menu" onClick={() => setMenu(!menu)} aria-label="เมนู">☰</button>
          <div className="logo"><b>Fd</b> FlowDesk</div>
          <span className="sp" />
          {user && <NotificationBell currentUser={user} align="right" />}
        </div>
        {err && <div className="err" style={{ padding: '8px 24px' }}>{err}</div>}
        {ws && project && !mine && (
          <div className="head">
            <div className="crumb">{crumbWs}{curProject && <> / <b>{curProject.name}</b></>}</div>
            <div className="tabs">
              {TABS.map(([p, label]) => (
                <Link key={p} className={'tab' + (section === p ? ' on' : '')} href={`${p}?${q(ws, project)}`}>{label}</Link>
              ))}
            </div>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

export default function AppLayout({ children }) {
  return (
    <DialogProvider>
      <Suspense fallback={<div className="center muted">กำลังโหลด…</div>}>
        <Shell>{children}</Shell>
      </Suspense>
    </DialogProvider>
  );
}
