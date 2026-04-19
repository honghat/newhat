'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTimer } from '@/context/TimerContext';
import React from 'react';
import type { AuthUser } from '@/lib/auth';

const tabs = [
  { href: '/', label: 'Trang Chủ', icon: '🏠' },
  { href: '/learn', label: 'Học Code', icon: '🧑‍💻' },
  { href: '/english', label: 'Tiếng Anh', icon: '🇬🇧' },
  { href: '/roadmap', label: 'Lộ Trình', icon: '🗺' },
  { href: '/timer', label: 'Pomodoro', icon: '⏱' },
];

export default function BottomNav({ session }: { session: AuthUser | null }) {
  const path = usePathname();
  const router = useRouter();
  const { running, isWork, secs, toggle, reset, todaySessions } = useTimer();

  // Trigger full re-render for Turbopack
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  if (path === '/login') return null;

  async function logout() {
    await fetch('/api/auth', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'logout' }) });
    router.push('/login');
    router.refresh();
  }
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  const total = isWork ? 50 * 60 : 10 * 60;
  const pct = ((total - secs) / total) * 100;
  
  // Define constant values for SVG logic
  const r = 22;
  const c = Math.round(2 * Math.PI * r * 100) / 100; // Round to 2 decimal places

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="sidebar">
        {/* Logo */}
        <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text)', letterSpacing: -0.5 }}>NewHat</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>60 Ngày Thay Đổi</div>
        </div>

        {/* Timer control in sidebar */}
        <div suppressHydrationWarning style={{ margin: '14px 14px 18px', padding: '14px', borderRadius: 12, background: !mounted ? '#1a0808' : (isWork ? '#1a0808' : '#081a0a'), border: '1px solid', borderColor: !mounted ? '#f8514944' : (isWork ? '#f8514944' : '#3fb95044') }}>
          {/* Ring + time */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
              <svg width="52" height="52" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="26" cy="26" r={r} fill="none" stroke={!mounted ? '#f8514922' : (isWork ? '#f8514922' : '#3fb95022')} strokeWidth="4" />
                <circle cx="26" cy="26" r={r} fill="none" stroke={!mounted ? '#f85149' : (isWork ? '#f85149' : '#3fb950')} strokeWidth="4"
                  strokeDasharray={`${c}`}
                  strokeDashoffset={!mounted ? `${c}` : `${Math.round(c * (1 - pct / 100) * 100) / 100}`}
                  strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s linear' }} />
              </svg>
              <div suppressHydrationWarning style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, color: !mounted ? '#f85149' : (isWork ? '#f85149' : '#3fb950'), fontVariantNumeric: 'tabular-nums' }}>
                {mounted ? `${mm}:${ss}` : '--:--'}
              </div>
            </div>
            <div>
              <div suppressHydrationWarning style={{ fontSize: 11, fontWeight: 700, color: !mounted ? '#f85149' : (isWork ? '#f85149' : '#3fb950') }}>
                {mounted ? (isWork ? '🔴 Học tập' : '🟢 Nghỉ ngơi') : '...'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                Hôm nay: {todaySessions} pomodoro
              </div>
            </div>
          </div>
          {/* Buttons */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={toggle} suppressHydrationWarning style={{
              flex: 1, padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13,
              background: !mounted ? 'var(--surface2)' : (running ? '#f8514922' : isWork ? '#f85149' : '#3fb950'),
              color: !mounted ? 'var(--muted)' : (running ? (isWork ? '#f85149' : '#3fb950') : '#000'),
            }}>
              {!mounted ? '...' : (running ? '⏸ Dừng' : '▶ Bắt đầu')}
            </button>
            <button onClick={reset} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}>
              ↺
            </button>
          </div>
        </div>

        {/* Nav links */}
        <nav style={{ flex: 1, padding: '12px 8px', marginTop: 8 }}>
          {tabs.map(t => {
            const active = path === t.href;
            return (
              <Link key={t.href} href={t.href} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 8, marginBottom: 2,
                textDecoration: 'none',
                background: active ? 'var(--surface2)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--muted)',
                fontWeight: active ? 700 : 400,
                fontSize: 14,
                transition: 'all 0.15s',
              }}>
                <span style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{t.icon}</span>
                {t.label}
                {active && <div style={{ marginLeft: 'auto', width: 4, height: 4, borderRadius: 99, background: 'var(--accent)' }} />}
              </Link>
            );
          })}
        </nav>

        {/* Bottom of sidebar */}
        <div style={{ padding: '14px', borderTop: '1px solid var(--border)' }}>
          {session ? (
            <div>
              <Link href="/profile" style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, textDecoration:'none', borderRadius:8, padding:'4px', margin:'0 -4px 10px' }}>
                <div style={{ width:32, height:32, borderRadius:99, background: session.role==='admin'?'#58a6ff22':'var(--surface2)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:14, color: session.role==='admin'?'var(--accent)':'var(--text)', border:`1px solid ${session.role==='admin'?'var(--accent)':'var(--border)'}`, flexShrink:0 }}>
                  {session.name[0]?.toUpperCase()}
                </div>
                <div style={{ minWidth:0, flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', color:'var(--text)' }}>{session.name}</div>
                  <div style={{ fontSize:10, color:'var(--muted)' }}>{session.role==='admin'?'👑 Admin':'Học viên · Đổi mật khẩu'}</div>
                </div>
              </Link>
              <div style={{ display:'flex', gap:6 }}>
                {session.role==='admin' && (
                  <Link href="/admin" style={{ flex:1, textAlign:'center', padding:'6px', borderRadius:6, border:'1px solid var(--border)', fontSize:11, color:'var(--accent)', textDecoration:'none', fontWeight:600 }}>👥 Quản lý</Link>
                )}
                <button onClick={logout} style={{ flex:1, padding:'6px', borderRadius:6, border:'1px solid var(--border)', background:'transparent', fontSize:11, color:'var(--muted)', cursor:'pointer', fontWeight:600 }}>Đăng xuất</button>
              </div>
            </div>
          ) : (
            <Link href="/login" style={{ display:'block', textAlign:'center', padding:'8px', borderRadius:6, border:'1px solid var(--accent)', fontSize:12, color:'var(--accent)', textDecoration:'none', fontWeight:700 }}>
              🔐 Đăng nhập
            </Link>
          )}
          <div style={{ fontSize:10, color:'var(--muted)', marginTop:10, lineHeight:1.5 }}>
            AI <span style={{ color: '#3fb950' }}>● 100.69.50.64</span>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Nav */}
      <nav className="bottom-nav" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--surface)', borderTop: '1px solid var(--border)', zIndex: 50, paddingBottom: 'env(safe-area-inset-bottom)', flexDirection: 'column' }}>
        {/* Timer strip */}
        <div suppressHydrationWarning style={{ display: 'flex', alignItems: 'center', padding: '4px 10px', gap: 8, borderBottom: '1px solid var(--border)', background: !mounted ? '#1a080844' : (isWork ? '#1a080844' : '#081a0a44') }}>
          <div suppressHydrationWarning style={{ fontSize: 13, fontWeight: 900, color: !mounted ? '#f85149' : (isWork ? '#f85149' : '#3fb950'), fontVariantNumeric: 'tabular-nums', minWidth: 52 }}>{mounted ? `${mm}:${ss}` : '--:--'}</div>
          <div className="progress-bar" style={{ flex: 1, height: 4 }}>
            <div suppressHydrationWarning className="progress-fill" style={{ width: mounted ? `${Math.round(pct * 10) / 10}%` : '0%', background: !mounted ? '#f85149' : (isWork ? '#f85149' : '#3fb950') }} />
          </div>
          <button onClick={toggle} suppressHydrationWarning style={{ padding: '4px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 11, background: !mounted ? 'transparent' : (running ? 'transparent' : (isWork ? '#f85149' : '#3fb950')), color: !mounted ? 'var(--muted)' : (running ? (isWork ? '#f85149' : '#3fb950') : '#000'), border: !mounted ? '1px solid var(--border)' : (running ? `1px solid ${isWork ? '#f85149' : '#3fb950'}` : 'none') }}>
            {!mounted ? '...' : (running ? '⏸' : '▶')}
          </button>
          <button onClick={reset} suppressHydrationWarning style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 11 }}>↺</button>
          {mounted && <button onClick={() => router.refresh()} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 11 }}>🔄</button>}
          {session?.role === 'admin' && (
            <Link href="/admin" style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', fontSize: 11, textDecoration: 'none', fontWeight: 700 }}>👥</Link>
          )}
        </div>
        <div style={{ display: 'flex' }}>
          {tabs.map(t => {
            const active = path === t.href;
            return (
              <Link key={t.href} href={t.href} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 0', gap: 2, textDecoration: 'none', color: active ? 'var(--accent)' : 'var(--muted)', fontSize: 9, fontWeight: active ? 700 : 400 }}>
                <span style={{ fontSize: 18 }}>{t.icon}</span>
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
