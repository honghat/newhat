'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface User { id: number; name: string; email: string; role: string; status: string; createdAt: string; }

const STATUS_COLOR: Record<string, string> = {
  pending: '#d29922', approved: '#3fb950', rejected: '#f85149',
};

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [me, setMe] = useState<{ name: string; role: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all'|'pending'|'approved'|'rejected'>('all');
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', password: '' });

  const load = useCallback(async () => {
    const [meRes, usersRes] = await Promise.all([fetch('/api/auth'), fetch('/api/users')]);
    const meData = await meRes.json();
    if (!meData.user || meData.user.role !== 'admin') { router.push('/'); return; }
    setMe(meData.user);
    if (usersRes.ok) setUsers(await usersRes.json());
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function updateUser(id: number, patch: { status?: string; role?: string }) {
    await fetch('/api/users', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, ...patch }) });
    load();
  }

  async function deleteUser(id: number, name: string) {
    if (!confirm(`Xóa người dùng "${name}"?`)) return;
    await fetch('/api/users', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) });
    load();
  }

  async function logout() {
    await fetch('/api/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'logout' }) });
    router.push('/login');
    router.refresh();
  }

  function openEdit(user: User) {
    setEditId(user.id);
    setEditForm({ name: user.name, email: user.email, password: '' });
  }

  async function saveEdit() {
    if (!editId) return;
    const patch: any = {};
    if (editForm.name) patch.name = editForm.name;
    if (editForm.email) patch.email = editForm.email;
    if (editForm.password) patch.password = editForm.password;
    if (Object.keys(patch).length === 0) { setEditId(null); return; }
    await fetch('/api/users', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: editId, ...patch }) });
    setEditId(null);
    load();
  }

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', color:'var(--muted)' }}>Đang tải...</div>;

  const filtered = filter === 'all' ? users : users.filter(u => u.status === filter);
  const counts = { all: users.length, pending: users.filter(u=>u.status==='pending').length, approved: users.filter(u=>u.status==='approved').length, rejected: users.filter(u=>u.status==='rejected').length };

  return (
    <div className="fade-in">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
        <div>
          <h1 className="page-title" style={{ fontSize:20, fontWeight:900 }}>👥 Quản lý người dùng</h1>
          <div style={{ fontSize:12, color:'var(--muted)', marginTop:4 }}>Xin chào, {me?.name}</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={()=>router.push('/')} className="btn btn-ghost" style={{ fontSize:13 }}>← App</button>
          <button onClick={logout} className="btn btn-ghost" style={{ fontSize:13, color:'var(--red)', borderColor:'var(--red)' }}>Đăng xuất</button>
        </div>
      </div>

      {/* Stats */}
      <div className="desktop-4col" style={{ marginBottom:20 }}>
        {(['all','pending','approved','rejected'] as const).map(s => (
          <div key={s} className="stat-card" onClick={()=>setFilter(s)} style={{ cursor:'pointer', border:`1px solid ${filter===s?(s==='pending'?'#d29922':s==='approved'?'#3fb950':s==='rejected'?'#f85149':'var(--accent)'):'var(--border)'}`, background: filter===s?'var(--surface2)':'var(--surface)' }}>
            <div className="stat-value" style={{ color: s==='pending'?'#d29922':s==='approved'?'#3fb950':s==='rejected'?'#f85149':'var(--accent)', fontSize:28 }}>{counts[s]}</div>
            <div className="stat-label">{s==='all'?'Tổng':s==='pending'?'Chờ duyệt':s==='approved'?'Đã duyệt':'Từ chối'}</div>
          </div>
        ))}
      </div>

      {/* Users table */}
      <div className="card">
        {filtered.length === 0 && <div style={{ color:'var(--muted)', padding:'24px', textAlign:'center' }}>Không có người dùng</div>}
        {filtered.map(u => (
          <div key={u.id} style={{ padding:'14px 0', borderBottom:'1px solid var(--surface2)' }}>
            {/* Row 1: Avatar + Info + Status */}
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
              <div style={{ width:38, height:38, borderRadius:99, background: u.role==='admin'?'#58a6ff22':'var(--surface2)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:15, color: u.role==='admin'?'var(--accent)':'var(--muted)', flexShrink:0, border:`1px solid ${u.role==='admin'?'var(--accent)':'var(--border)'}` }}>
                {u.name[0]?.toUpperCase()}
              </div>
              <div style={{ flex:1, minWidth:0, overflow:'hidden' }}>
                <div style={{ fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                  <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'100%' }}>{u.name}</span>
                  {u.role==='admin' && <span className="pill" style={{ borderColor:'var(--accent)', color:'var(--accent)', fontSize:10, flexShrink:0 }}>ADMIN</span>}
                </div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.email}</div>
                <div style={{ fontSize:10, color:'var(--muted)', marginTop:1 }}>{new Date(u.createdAt).toLocaleString('vi')}</div>
              </div>
              <div className="pill" style={{ borderColor: STATUS_COLOR[u.status], color: STATUS_COLOR[u.status], flexShrink:0, fontSize:11 }}>
                {u.status==='pending'?'⏳ Chờ':u.status==='approved'?'✅ Duyệt':'❌ Từ chối'}
              </div>
            </div>
            {/* Row 2: Actions */}
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {u.status!=='approved' && (
                <button onClick={()=>updateUser(u.id,{status:'approved'})} style={{ flex:1, minWidth:70, padding:'6px 8px', borderRadius:6, border:'1px solid #3fb950', background:'#3fb95011', color:'#3fb950', fontSize:12, cursor:'pointer', fontWeight:600 }}>✓ Duyệt</button>
              )}
              {u.status!=='rejected' && (
                <button onClick={()=>updateUser(u.id,{status:'rejected'})} style={{ flex:1, minWidth:70, padding:'6px 8px', borderRadius:6, border:'1px solid #f85149', background:'#f8514911', color:'#f85149', fontSize:12, cursor:'pointer', fontWeight:600 }}>✕ Từ chối</button>
              )}
              {u.role!=='admin' && (
                <button onClick={()=>updateUser(u.id,{role:'admin'})} style={{ flex:1, minWidth:70, padding:'6px 8px', borderRadius:6, border:'1px solid var(--accent)', background:'#58a6ff11', color:'var(--accent)', fontSize:12, cursor:'pointer', fontWeight:600 }}>↑ Admin</button>
              )}
              <button onClick={()=>openEdit(u)} style={{ padding:'6px 10px', borderRadius:6, border:'1px solid var(--border)', background:'transparent', color:'var(--accent)', fontSize:12, cursor:'pointer' }}>✏️</button>
              <button onClick={()=>deleteUser(u.id, u.name)} style={{ padding:'6px 10px', borderRadius:6, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', fontSize:12, cursor:'pointer' }}>🗑</button>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Modal */}
      {editId !== null && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div style={{ background:'var(--surface)', borderRadius:12, padding:24, maxWidth:400, width:'90%', boxShadow:'0 4px 12px rgba(0,0,0,0.3)' }}>
            <h2 style={{ fontSize:16, fontWeight:900, marginBottom:16 }}>Sửa tài khoản</h2>
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:4 }}>Tên</label>
              <input type="text" value={editForm.name} onChange={(e)=>setEditForm({...editForm, name:e.target.value})} style={{ width:'100%', padding:'8px 12px', borderRadius:6, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)', fontSize:13, boxSizing:'border-box' }} />
            </div>
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:4 }}>Email</label>
              <input type="email" value={editForm.email} onChange={(e)=>setEditForm({...editForm, email:e.target.value})} style={{ width:'100%', padding:'8px 12px', borderRadius:6, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)', fontSize:13, boxSizing:'border-box' }} />
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:4 }}>Mật khẩu (để trống nếu không đổi)</label>
              <input type="password" value={editForm.password} onChange={(e)=>setEditForm({...editForm, password:e.target.value})} style={{ width:'100%', padding:'8px 12px', borderRadius:6, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)', fontSize:13, boxSizing:'border-box' }} />
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>setEditId(null)} style={{ flex:1, padding:'8px 12px', borderRadius:6, border:'1px solid var(--border)', background:'transparent', color:'var(--text)', fontSize:12, cursor:'pointer', fontWeight:600 }}>Hủy</button>
              <button onClick={saveEdit} style={{ flex:1, padding:'8px 12px', borderRadius:6, border:'1px solid var(--accent)', background:'var(--accent)', color:'#000', fontSize:12, cursor:'pointer', fontWeight:600 }}>Lưu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
