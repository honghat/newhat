'use client';
import { useState, useEffect, useCallback } from 'react';

const QUOTES = [
  "960 giờ. Không có thời gian để lướt mạng xã hội.",
  "Code không biết bạn mệt. Gõ tiếp.",
  "Mỗi giờ bạn lãng phí = 1 giờ kém hơn ứng viên khác.",
  "Junior dev lương 10-15tr đang chờ bạn ở ngày 61.",
  "Sau 60 ngày, bạn sẽ có việc làm hoặc có lý do.",
  "Không ai quan tâm bạn mệt. Họ chỉ xem portfolio.",
  "Bạn không học vì tiện. Bạn học vì cần.",
  "Mỗi bug bạn fix là 1 kỹ năng HR tìm kiếm.",
];

interface DayLog { id: number; date: string; hours: number; topic: string; notes: string; }
interface AIReport { id: number; date: string; content: string; createdAt: string; }
function fmtMs(ms: number) {
  if (ms <= 0) return { days: 0, hours: 0, mins: 0 };
  return { days: Math.floor(ms/86400000), hours: Math.floor((ms%86400000)/3600000), mins: Math.floor((ms%3600000)/60000) };
}

function parseMarkdown(text: string) {
  if (!text) return '';

  const inline = (s: string) => s
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--accent)">$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:var(--surface2);padding:1px 5px;border-radius:4px;font-size:12px">$1</code>');

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;

  const headStyle: Record<number, string> = {
    1: 'font-size:18px;margin:14px 0 8px;font-weight:900',
    2: 'font-size:16px;margin:12px 0 6px;font-weight:800',
    3: 'font-size:14px;margin:10px 0 4px;font-weight:700',
    4: 'font-size:13px;margin:10px 0 4px;font-weight:700;color:var(--accent)',
    5: 'font-size:12px;margin:8px 0 3px;font-weight:700;color:var(--accent)',
    6: 'font-size:12px;margin:8px 0 3px;font-weight:600;color:var(--muted)',
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Code block ```
    if (/^```/.test(trimmed)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) { buf.push(lines[i]); i++; }
      i++;
      out.push(`<pre style="background:var(--surface2);padding:10px;border-radius:6px;overflow-x:auto;font-size:12px;margin:8px 0;border:1px solid var(--border)"><code>${buf.join('\n').replace(/</g, '&lt;')}</code></pre>`);
      continue;
    }

    // Table — current line starts with |, next is |---|
    if (/^\|.*\|$/.test(trimmed) && i + 1 < lines.length && /^\|[\s\-:|]+\|$/.test(lines[i + 1].trim())) {
      const cells = (r: string) => r.trim().split('|').slice(1, -1).map(c => inline(c.trim()));
      const heads = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) { rows.push(cells(lines[i])); i++; }
      const th = heads.map(h => `<th style="border:1px solid var(--border);padding:6px 8px;background:var(--surface2);text-align:left;font-size:12px">${h}</th>`).join('');
      const tb = rows.map(r => `<tr>${r.map(c => `<td style="border:1px solid var(--border);padding:6px 8px;font-size:12px">${c}</td>`).join('')}</tr>`).join('');
      out.push(`<table style="border-collapse:collapse;margin:10px 0;width:100%"><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table>`);
      continue;
    }

    // Heading
    const h = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level} style="${headStyle[level]}">${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s+/.test(trimmed)) {
      out.push(`<blockquote style="border-left:3px solid var(--muted);padding-left:12px;margin:10px 0;font-style:italic;color:var(--muted)">${inline(trimmed.replace(/^>\s+/, ''))}</blockquote>`);
      i++;
      continue;
    }

    // List item
    if (/^[-*]\s+/.test(trimmed)) {
      out.push(`<div style="padding-left:14px;margin:3px 0">•&nbsp;${inline(trimmed.replace(/^[-*]\s+/, ''))}</div>`);
      i++;
      continue;
    }

    // Empty line — small gap
    if (trimmed === '') {
      out.push('<div style="height:6px"></div>');
      i++;
      continue;
    }

    // Plain paragraph
    out.push(`<div style="margin:2px 0">${inline(line)}</div>`);
    i++;
  }

  return out.join('');
}

export default function HomePage() {
  const [cd, setCd] = useState({ days: 60, hours: 0, mins: 0 });
  const [missionStart, setMissionStart] = useState(0);
  const [totalH, setTotalH] = useState(0);
  const [streak, setStreak] = useState(0);
  const [todayH, setTodayH] = useState(0);
  const [logs, setLogs] = useState<DayLog[]>([]);
  const [form, setForm] = useState({ hours: 4, topic: '', notes: '' });
  const [qi, setQi] = useState(0);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const today = new Date().toISOString().slice(0, 10);

  const [wolStatus, setWolStatus] = useState('');
  const [aiHost, setAiHost] = useState('100.69.50.64');
  const [aiServer, setAiServer] = useState('http://100.69.50.64:8080');
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [aiReport, setAiReport] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [savedReports, setSavedReports] = useState<AIReport[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);

  const loadReports = useCallback(async () => {
    try {
      const r = await fetch('/api/ai-reports');
      if (r.ok) setSavedReports(await r.json());
    } catch {}
  }, []);

  useEffect(() => { loadReports(); }, [loadReports]);

  async function deleteReport(id: number) {
    await fetch(`/api/ai-reports?id=${id}`, { method: 'DELETE' });
    if (selectedReportId === id) { setSelectedReportId(null); setAiReport(''); }
    loadReports();
  }

  function viewReport(r: AIReport) {
    setAiReport(r.content);
    setSelectedReportId(r.id);
  }

  async function saveAISettings() {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiHost, aiServer }),
      });
      if (res.ok) {
        setSettingsSaved(true);
        setTimeout(() => setSettingsSaved(false), 2000);
      }
    } catch {}
  }

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => {
      if (d.aiHost) setAiHost(d.aiHost);
      if (d.aiServer) setAiServer(d.aiServer);
    }).catch(() => {});
  }, []);
  const [shutdownPwd, setShutdownPwd] = useState('');
  const [shutdownStatus, setShutdownStatus] = useState('');
  const [shutdownLoading, setShutdownLoading] = useState(false);
  const [shutdownConfirm, setShutdownConfirm] = useState(false);

  async function wakeAI() {
    setWolStatus('⏳ Đang gửi...');
    try {
      const res = await fetch('/api/wol', { method: 'POST' });
      const d = await res.json();
      setWolStatus(d.ok ? '✅ Đã gửi magic packet!' : '❌ ' + d.error);
    } catch { setWolStatus('❌ Lỗi kết nối'); }
    setTimeout(() => setWolStatus(''), 4000);
  }

  async function shutdownAI() {
    if (!shutdownPwd) return;
    setShutdownLoading(true); setShutdownStatus('');
    try {
      const res = await fetch('/api/shutdown', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: shutdownPwd, host: aiHost }) });
      const d = await res.json();
      setShutdownStatus(d.ok ? '✅ Đã gửi lệnh tắt máy' : '❌ ' + d.error);
      if (d.ok) setShutdownPwd('');
    } catch { setShutdownStatus('❌ Lỗi kết nối'); }
    setShutdownLoading(false);
    setTimeout(() => setShutdownStatus(''), 5000);
  }

  const load = useCallback(async () => {
    const [mRes, lRes] = await Promise.all([fetch('/api/mission'), fetch('/api/logs')]);
    const mData = mRes.ok ? await mRes.json().catch(() => ({})) : {};
    const { startDate } = mData;
    const allLogs: DayLog[] = lRes.ok ? await lRes.json().catch(() => []) : [];
    setMissionStart(startDate);
    setLogs(allLogs.slice(0, 30));
    setTotalH(allLogs.reduce((s, l) => s + l.hours, 0));
    setTodayH(parseFloat((allLogs.find(l => l.date === today)?.hours ?? 0).toFixed(1)));
    let s = 0; const cur = new Date(); cur.setHours(0,0,0,0);
    let curTs = cur.getTime();
    for (const l of allLogs) {
      const d = new Date(l.date); d.setHours(0,0,0,0);
      if ((curTs - d.getTime()) / 86400000 <= 1 && l.hours > 0) { s++; curTs = d.getTime(); } else break;
    }
    setStreak(s);
    const tl = allLogs.find(l => l.date === today);
    if (tl) setForm({ hours: parseFloat(tl.hours.toFixed(1)), topic: tl.topic, notes: tl.notes });
    setLoading(false);
  }, [today]);

  useEffect(() => { load(); setQi(new Date().getDay() % QUOTES.length); }, [load]);

  useEffect(() => {
    if (!missionStart) return;
    const end = missionStart + 60*24*3600000;
    const tick = () => setCd(fmtMs(end - Date.now()));
    tick(); const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [missionStart]);

  async function save() {
    await fetch('/api/logs', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ date: today, ...form }) });
    await load(); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  async function generateAIReport() {
    if (logs.length === 0) return;
    setReportLoading(true);
    const logSummary = logs.slice(0, 7).map(l => `- Ngày ${l.date}: ${l.hours}h (${l.topic})`).join('\n');
    const prompt = `Bạn là một chuyên gia tư vấn lộ trình học tập (Learning Coach). Dưới đây là nhật ký học tập trong 7 ngày qua của học viên:
${logSummary}
Tổng giờ tích lũy hiện tại: ${totalH}h / mục tiêu 960h. Streak: ${streak} ngày.

Hãy phân tích và đưa ra nhận xét chuyên nghiệp theo định dạng Markdown:
# 📊 Đánh giá tiến độ học tập
## 1. Phân tích cường độ
(Nhận xét về sự ổn định và số giờ học)
## 2. Lộ trình & Nội dung
(Đánh giá các chủ đề đã học và gợi ý hướng đi tiếp theo)
## 3. Lời khuyên & Động lực
(Lời khuyên để tối ưu hóa việc học)

Trả lời bằng tiếng Việt, chuyên sâu và cá nhân hóa.`;

    const res = await fetch('/api/ai', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '⚠️ AI không phản hồi';
    setAiReport(content);
    setSelectedReportId(null);
    if (data.choices?.[0]?.message?.content) {
      try {
        const r = await fetch('/api/ai-reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
        if (r.ok) { const saved = await r.json(); setSelectedReportId(saved.id); loadReports(); }
      } catch {}
    }
    setReportLoading(false);
  }

  const elapsed = 60 - cd.days;
  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', color:'var(--muted)' }}>Đang tải...</div>;

  const stats = [
    { label:'Còn lại', val: cd.days, unit:'ngày', color:'#f85149', pct:(cd.days/60)*100 },
    { label:'Tổng giờ', val: Math.round(totalH), unit:'/960h', color:'#58a6ff', pct:(totalH/960)*100 },
    { label:'Streak 🔥', val: streak, unit:'ngày', color:'#d29922', pct:(streak/60)*100 },
    { label:'Hôm nay', val: todayH, unit:'/16h', color:'#3fb950', pct:(todayH/16)*100 },
  ];

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ marginBottom: 14, display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
        <div style={{ minWidth:0, flex:1 }}>
          <h1 className="page-title" style={{ fontSize:20, fontWeight:900, marginBottom:2, background:'linear-gradient(135deg, #f85149, #ff8c69)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', whiteSpace:'nowrap' }}>Trang Chủ</h1>
          <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{new Date().toLocaleDateString('vi-VN', { weekday:'long', day:'2-digit', month:'2-digit' })}</div>
        </div>
        <div style={{ textAlign:'right', flexShrink:0 }}>
          <div style={{ color:'#f85149', fontWeight:800, fontSize:16, lineHeight:1 }}>{Math.round((elapsed/60)*100)}%</div>
          <div style={{ fontSize:9, color:'var(--muted)', letterSpacing:1, marginTop:2 }}>HOÀN THÀNH</div>
        </div>
      </div>

      <div className="desktop-main-side" style={{ gap: 16, marginBottom: 12 }}>
        {/* LEFT COLUMN */}
        <div>
          {/* Countdown */}
          <div className="countdown-banner" style={{ marginBottom: 12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <div style={{ fontSize:10, color:'#f85149', fontWeight:800, letterSpacing:2 }}>⚡ 60 NGÀY</div>
              <div style={{ fontSize:10, color:'var(--muted)', fontWeight:600 }}>{elapsed}/60</div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, marginBottom:10 }}>
              {[{n:cd.days,l:'NGÀY'},{n:cd.hours,l:'GIỜ'},{n:cd.mins,l:'PHÚT'}].map(({n,l})=>(
                <div key={l} style={{ textAlign:'center' }}>
                  <div style={{ fontSize:'clamp(24px, 8vw, 44px)', fontWeight:900, color:'#f85149', lineHeight:1, fontVariantNumeric:'tabular-nums' }}>{String(n).padStart(2,'0')}</div>
                  <div style={{ fontSize:9, color:'var(--muted)', letterSpacing:1, marginTop:3, fontWeight:600 }}>{l}</div>
                </div>
              ))}
            </div>
            <div className="progress-bar" style={{ height:4 }}>
              <div className="progress-fill" style={{ width:`${(elapsed/60)*100}%`, background:'linear-gradient(90deg, #f85149, #ff6b6b)' }} />
            </div>
          </div>

          {/* Stats — compact horizontal pills */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
            {stats.map(s => (
              <div key={s.label} className="stat-card" style={{ textAlign:'left', position:'relative', overflow:'hidden' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                  <div className="stat-label" style={{ margin:0 }}>{s.label}</div>
                  <div style={{ width:6, height:6, borderRadius:'50%', background:s.color, boxShadow:`0 0 8px ${s.color}` }} />
                </div>
                <div style={{ display:'flex', alignItems:'baseline', gap:4 }}>
                  <div className="stat-value" style={{ color: s.color }}>{s.val}</div>
                  <div style={{ fontSize:11, fontWeight:500, color:'var(--muted)' }}>{s.unit}</div>
                </div>
                <div className="progress-bar" style={{ marginTop:8, height:3 }}>
                  <div className="progress-fill" style={{ width:`${Math.min(100,s.pct)}%`, background:s.color }} />
                </div>
              </div>
            ))}
          </div>

          {/* Quote — minimal */}
          <div className="card" style={{ borderLeft:'3px solid var(--accent)', marginBottom:12, padding:12 }}>
            <div style={{ fontSize:12, fontStyle:'italic', lineHeight:1.6, color:'var(--text)' }}>"{QUOTES[qi]}"</div>
            <button onClick={()=>setQi((qi+1)%QUOTES.length)} style={{ marginTop:6, fontSize:10, color:'var(--muted)', background:'none', border:'none', cursor:'pointer', padding:0 }}>→ Câu tiếp</button>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div>
          {/* Daily Log Form */}
          <div className="card" style={{ marginBottom:20 }}>
            <div style={{ fontWeight:700, marginBottom:14, fontSize:15 }}>📝 Nhật Ký Hôm Nay</div>
            <div style={{ marginBottom:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:8 }}>
                <span style={{ color:'var(--muted)' }}>Giờ học</span>
                <span style={{ color:'var(--green)', fontWeight:700, fontSize:16 }}>{form.hours}h <span style={{ color:'var(--muted)', fontWeight:400, fontSize:12 }}>/ 16h</span></span>
              </div>
              <input type="range" min={0} max={16} step={0.5} value={form.hours}
                onChange={e=>setForm(f=>({...f,hours:parseFloat(e.target.value)}))}
                style={{ width:'100%', accentColor:'var(--green)', cursor:'pointer' }} />
              <div className="progress-bar" style={{ marginTop:6 }}>
                <div className="progress-fill" style={{ width:`${(form.hours/16)*100}%`, background:'var(--green)' }} />
              </div>
            </div>
            <input className="input" placeholder="Học gì hôm nay? (Next.js, SQL, vocab...)" value={form.topic}
              onChange={e=>setForm(f=>({...f,topic:e.target.value}))} style={{ marginBottom:10 }} />
            <textarea className="input" placeholder="Ghi chú, vướng mắc, điều cần nhớ..." value={form.notes} rows={3}
              onChange={e=>setForm(f=>({...f,notes:e.target.value}))} style={{ marginBottom:12 }} />
            <button className="btn btn-green" style={{ width:'100%' }} onClick={save}>
              {saved ? '✅ Đã lưu vào PostgreSQL' : '💾 Lưu nhật ký'}
            </button>
          </div>

          {/* Saved AI Reports */}
          {savedReports.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color:'var(--muted)', marginBottom: 8, letterSpacing: 1 }}>📚 ĐÁNH GIÁ TRƯỚC ĐÂY ({savedReports.length})</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight: 200, overflowY:'auto' }}>
                {savedReports.map(r => {
                  const active = selectedReportId === r.id;
                  return (
                    <div key={r.id} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 8px', borderRadius:6, background: active ? 'var(--surface2)' : 'transparent', border:`1px solid ${active ? 'var(--accent)' : 'var(--border)'}` }}>
                      <button onClick={() => viewReport(r)} style={{ flex:1, textAlign:'left', background:'none', border:'none', color: active ? 'var(--accent)' : 'var(--text)', cursor:'pointer', fontSize:12, padding:0 }}>
                        <div style={{ fontWeight:600 }}>{new Date(r.createdAt).toLocaleString('vi-VN', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</div>
                        <div style={{ fontSize:10, color:'var(--muted)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r.content.replace(/[#*`>|-]/g,'').slice(0,60)}...</div>
                      </button>
                      <button onClick={() => deleteReport(r.id)} title="Xoá" style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:12, padding:'2px 6px' }}>✕</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* AI Report Card */}
          {aiReport && (
            <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--accent)', background: 'var(--surface2)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 8 }}>
                <div style={{ fontSize: 11, color:'var(--muted)', fontWeight:600 }}>{selectedReportId ? '📖 Đang xem báo cáo đã lưu' : '✨ Báo cáo mới'}</div>
                <button onClick={() => { setAiReport(''); setSelectedReportId(null); }} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:14 }}>✕</button>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--text)' }}
                   dangerouslySetInnerHTML={{ __html: parseMarkdown(aiReport) }}></div>
            </div>
          )}

          {/* History */}
          {logs.length > 0 && (
            <div className="card">
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                <div className="section-title" style={{ margin:0 }}>Lịch sử học</div>
                <button className="btn btn-ghost" style={{ padding:'4px 10px', fontSize:11, height:28 }} onClick={generateAIReport} disabled={reportLoading}>
                  {reportLoading ? '⏳ Đang phân tích...' : '🤖 AI đánh giá tiến độ'}
                </button>
              </div>
              {logs.slice(0,8).map(l => (
                <div key={l.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 0', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ width:48, height:48, borderRadius:12, background: l.hours >= 8 ? 'rgba(63,185,80,0.1)' : 'rgba(125,133,144,0.05)', border: `1px solid ${l.hours >= 8 ? 'var(--green)' : 'var(--border)'}`, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <div style={{ fontSize:14, fontWeight:900, color: l.hours >= 8 ? 'var(--green)' : 'var(--text)' }}>{parseFloat(l.hours.toFixed(1))}</div>
                    <div style={{ fontSize:9, color:'var(--muted)', fontWeight:700 }}>GIỜ</div>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', marginBottom:2 }}>{l.topic || 'Học tập tự do'}</div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>{l.date}</div>
                      {l.hours >= 10 && <span style={{ fontSize:10, color:'var(--orange)', background:'rgba(210,153,34,0.1)', padding:'1px 6px', borderRadius:99, border:'1px solid var(--orange)' }}>🏆 Master</span>}
                    </div>
                  </div>
                  {l.notes && (
                    <div title={l.notes} style={{ color:'var(--muted)', fontSize:14, cursor:'help' }}>📝</div>
                  )}
                </div>
              ))}
            </div>
          )}
          {/* AI Machine Control */}
          <div className="card" style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>🖥️ Máy AI Local</div>
            <div style={{ display:'grid', gridTemplateColumns:'70px 1fr', gap:6, alignItems:'center', marginBottom: 10, fontSize:11 }}>
              <label style={{ color:'var(--muted)' }}>Host:</label>
              <input value={aiHost} onChange={e=>setAiHost(e.target.value)} onBlur={saveAISettings} placeholder="100.69.50.64" style={{ fontSize:11, padding:'5px 8px', borderRadius:6, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)' }} />
              <label style={{ color:'var(--muted)' }}>AI URL:</label>
              <input value={aiServer} onChange={e=>setAiServer(e.target.value)} onBlur={saveAISettings} placeholder="http://100.69.50.64:8080" style={{ fontSize:11, padding:'5px 8px', borderRadius:6, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--text)' }} />
            </div>
            {settingsSaved && <div style={{ fontSize:11, color:'#3fb950', marginBottom:8 }}>✅ Đã lưu</div>}
            <button onClick={wakeAI} className="btn btn-green" style={{ width: '100%', marginBottom: 10, height: 40 }}>
              ⚡ Bật máy AI (Wake-on-LAN)
            </button>
            {wolStatus && <div style={{ fontSize: 12, color: wolStatus.startsWith('✅') ? '#3fb950' : '#f85149', marginBottom: 10 }}>{wolStatus}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" type="password" placeholder="Mật khẩu sudo" value={shutdownPwd}
                onChange={e => setShutdownPwd(e.target.value)} onKeyDown={e => e.key === 'Enter' && setShutdownConfirm(true)}
                style={{ flex: 1, marginBottom: 0 }} />
              <button onClick={() => shutdownPwd && setShutdownConfirm(true)} disabled={shutdownLoading || !shutdownPwd}
                style={{ flexShrink: 0, padding: '0 14px', borderRadius: 8, border: '1px solid #f85149', background: '#f8514911', color: '#f85149', fontSize: 13, fontWeight: 700, cursor: 'pointer', height: 40 }}>
                ⏻ Tắt
              </button>
            </div>
            {shutdownStatus && <div style={{ fontSize: 12, marginTop: 8, color: shutdownStatus.startsWith('✅') ? '#3fb950' : '#f85149' }}>{shutdownStatus}</div>}

            {/* Confirm dialog */}
            {shutdownConfirm && (
              <div style={{ position: 'fixed', inset: 0, background: '#00000088', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: 'var(--surface)', border: '1px solid #f85149', borderRadius: 12, padding: 24, maxWidth: 300, width: '90%' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>⏻ Tắt máy AI?</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>Máy tại {aiHost} sẽ bị tắt ngay lập tức.</div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setShutdownConfirm(false)} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontWeight: 600 }}>Huỷ</button>
                    <button onClick={() => { setShutdownConfirm(false); shutdownAI(); }} disabled={shutdownLoading}
                      style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: '#f85149', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
                      {shutdownLoading ? '...' : 'Tắt ngay'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
