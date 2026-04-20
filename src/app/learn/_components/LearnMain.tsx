'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

interface Lesson { id: number; track: string; topic: string; content: string; order: number; completed: boolean; createdAt: string; }

const TRACKS = [
  { id: 'html-css', label: '🎨 HTML/CSS', color: '#f78166' },
  { id: 'javascript', label: '⚡ JavaScript', color: '#d29922' },
  { id: 'typescript', label: '🔷 TypeScript', color: '#3178c6' },
  { id: 'react', label: '⚛️ React', color: '#58a6ff' },
  { id: 'nextjs', label: '▲ Next.js', color: '#e6edf3' },
  { id: 'nodejs', label: '🟢 Node.js', color: '#3fb950' },
  { id: 'python', label: '🐍 Python', color: '#3572a5' },
  { id: 'fastapi', label: '⚡ FastAPI', color: '#05998b' },
  { id: 'java', label: '☕ Java', color: '#ed8b00' },
  { id: 'kotlin', label: '🟣 Kotlin', color: '#7f52ff' },
  { id: 'csharp', label: '🔵 C#/.NET', color: '#512bd4' },
  { id: 'cpp', label: '🔶 C++', color: '#00599c' },
  { id: 'go', label: '🐹 Go', color: '#00add8' },
  { id: 'rust', label: '🦀 Rust', color: '#ce422b' },
  { id: 'php', label: '🐘 PHP', color: '#777bb4' },
  { id: 'ruby', label: '💎 Ruby', color: '#cc342d' },
  { id: 'swift', label: '🍎 Swift', color: '#fa7343' },
  { id: 'dart', label: '🎯 Dart/Flutter', color: '#0175c2' },
  { id: 'sql', label: '🗄️ SQL/PostgreSQL', color: '#d2a8ff' },
  { id: 'git', label: '🔀 Git', color: '#f85149' },
  { id: 'api', label: '🔌 REST API', color: '#58a6ff' },
  { id: 'docker', label: '🐳 Docker', color: '#2496ed' },
  { id: 'linux', label: '🐧 Linux/Bash', color: '#ffcc00' },
  { id: 'excel-vba', label: '📊 Excel VBA', color: '#217346' },
  { id: 'powerbi', label: '📈 Power BI', color: '#F2CC0C' },
];

export default function LearnMain() {
  const [track, setTrack] = useState('javascript');
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [current, setCurrent] = useState<Lesson|null>(null);
  const [loading, setLoading] = useState(false);
  const [quizMode, setQuizMode] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<string[]>([]);
  const [userAnswers, setUserAnswers] = useState<string[]>([]);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [mode, setMode] = useState<'lesson'|'code'>('lesson');
  const [codeInput, setCodeInput] = useState('');
  const [codeExplanation, setCodeExplanation] = useState<string|null>(null);
  const [codeExample, setCodeExample] = useState<string|null>(null);
  const [codeLang, setCodeLang] = useState('javascript');
  const [activeCodeMode, setActiveCodeMode] = useState<'explain'|'generate'>('explain');
  const [codeSessions, setCodeSessions] = useState<any[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/lessons');
      if (!res.ok) { setError('Lỗi tải bài học'); return; }
      const text = await res.text();
      if (!text) { setLessons([]); return; }
      setLessons(JSON.parse(text));
      setError(null);
    } catch (e) { setError('Lỗi: ' + String(e)); }
  }, []);

  async function loadCodeSessions() {
    try {
      const res = await fetch('/api/code');
      if (!res.ok) return;
      const data = await res.json();
      setCodeSessions(data);
    } catch (e) {
      console.error('Error loading code sessions:', e);
    }
  }

  async function deleteCodeSession(id: number) {
    await fetch('/api/code', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    await loadCodeSessions();
  }

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (mode === 'code') { loadCodeSessions(); } }, [mode]);

  async function markComplete(lessonId: number) {
    await fetch('/api/lessons', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: lessonId, completed: true }) });
    const updatedLessons = await fetch('/api/lessons').then(res => res.json());
    setLessons(updatedLessons);

    // Tìm bài tiếp theo chưa học trong cùng track
    const currentLesson = lessons.find(l => l.id === lessonId);
    if (currentLesson) {
      const next = updatedLessons
        .filter((l: any) => l.track === currentLesson.track && !l.completed)
        .sort((a: any, b: any) => a.order - b.order)[0];
      
      if (next) {
        setCurrent(next);
        // Reset quiz for next lesson
        setQuizMode(false); setQuizSubmitted(false); setUserAnswers([]);
        const answers: string[] = [];
        const ms = next.content.matchAll(/ĐÁPÁN:([ABC])/g);
        for (const m of ms) answers.push(m[1]);
        setQuizAnswers(answers);
        setUserAnswers(answers.map(() => ''));
        contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        // Nếu hết bài, chỉ cần update lại bài hiện tại (để hiện nút "Đã hoàn thành")
        setCurrent(updatedLessons.find((l: any) => l.id === lessonId));
      }
    }
  }

  async function genLesson() {
    setLoading(true); setCurrent(null); setQuizMode(false); setQuizAnswers([]); setUserAnswers([]); setQuizSubmitted(false);

    // Lấy danh sách bài đã học để AI không lặp lại (lọc theo track thật)
    const done = lessons.filter(l => l.track === track).map(l => l.topic);
    const avoidStr = done.length > 0 ? `TUYỆT ĐỐI KHÔNG được dạy lại các chủ đề sau (tìm chủ đề mới khác hoàn toàn): ${done.join(' | ')}.` : '';

    const prompt = `Bạn là giáo viên lập trình. Hãy tạo một bài học ngắn về ${TRACKS.find(t=>t.id===track)?.label || track} cho người mới học.
${avoidStr}
Chọn một khái niệm CỤ THỂ chưa dạy. Format bài học như sau:

# [Tên khái niệm]

## 🎯 Mục tiêu
[1-2 câu mô tả học xong sẽ biết gì]

## 📖 Giải thích
[Giải thích bằng tiếng Việt, ngắn gọn, dễ hiểu. 3-5 câu]

## 💻 Ví dụ code
\`\`\`
[code ví dụ rõ ràng, có comment tiếng Việt]
\`\`\`

## 🧠 Quiz (3 câu)
QUAN TRỌNG: Mỗi câu PHẢI có đúng 3 lựa chọn A, B, C đầy đủ nội dung, không được để trống. Với câu hỏi Có/Không phải thêm lựa chọn thứ 3 như "Tùy trường hợp" hoặc "Không phải lúc nào cũng vậy".
1. [câu hỏi 1]?
A) [nội dung đáp án A] B) [nội dung đáp án B] C) [nội dung đáp án C]
ĐÁPÁN:B

2. [câu hỏi 2]?
A) [nội dung đáp án A] B) [nội dung đáp án B] C) [nội dung đáp án C]
ĐÁPÁN:A

3. [câu hỏi 3]?
A) [nội dung đáp án A] B) [nội dung đáp án B] C) [nội dung đáp án C]
ĐÁPÁN:C

## 💡 Thực hành
[1 bài tập nhỏ để làm ngay]`;

    try {
      const res = await fetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok) { setError('AI không phản hồi'); setLoading(false); return; }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) { setError('AI trả về rỗng'); setLoading(false); return; }

      // Lấy tên chủ đề từ dòng đầu
      const titleMatch = content.match(/^#\s+(.+)/m);
      const topic = titleMatch ? titleMatch[1].trim() : `${track} - ${new Date().toISOString().slice(0,10)}`;

      // Lưu vào DB lessons
      const saveRes = await fetch('/api/lessons', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, content, track }),
      });
      if (!saveRes.ok) { setError('Lỗi lưu bài học'); setLoading(false); return; }
      const saved = await saveRes.json();
      if (!saved.content) { setError('Lỗi lưu bài'); setLoading(false); return; }
      if (saved.duplicate) {
        setError(`⚠️ AI tạo trùng bài "${topic}" - thử lại để tạo bài mới khác`);
        setCurrent(saved);
        setLoading(false);
        return;
      }
      // Tự động ghi nhật ký học hôm nay
      const today = new Date().toISOString().slice(0,10);
      fetch('/api/logs', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ date: today, addTopic: topic }) });
      setCurrent(saved);
      setError(null);

      // Parse quiz answers
      const answers: string[] = [];
      const answerMatches = content.matchAll(/ĐÁPÁN:([ABC])/g);
      for (const m of answerMatches) answers.push(m[1]);
      setQuizAnswers(answers);
      setUserAnswers(answers.map(() => ''));

      await load();
      setLoading(false);
    } catch (e) {
      setError('Lỗi: ' + String(e));
      setLoading(false);
    }
  }

  function submitQuiz() {
    setQuizSubmitted(true);
    setQuizMode(true);
  }

  async function explainCode() {
    if (!codeInput.trim()) { setError('Vui lòng nhập code'); return; }
    setLoading(true);
    setCodeExplanation(null);
    setActiveCodeMode('explain');
    const trackLabel = TRACKS.find(t => t.id === codeLang)?.label || codeLang;
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: `Giải thích chi tiết code ${trackLabel} này (bằng tiếng Việt). Format:

## 📖 Giải thích
[Giải thích dễ hiểu từng dòng code, khái niệm chính]

## 💡 Khái niệm chính
[Liệt kê 3-5 khái niệm quan trọng]

## 💻 Ví dụ tương tự
[Code ví dụ tương tự nhưng đơn giản hơn, có comment]

## ⚠️ Lưu ý
[Những điểm cần chú ý, lỗi thường gặp]

Code cần giải thích:
\`\`\`
${codeInput}
\`\`\`` }] }),
      });
      if (!res.ok) { setError('AI không phản hồi'); setLoading(false); return; }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) { setError('AI trả về rỗng'); setLoading(false); return; }
      setCodeExplanation(content);
      setError(null);
      // Save to database
      await fetch('/api/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'explain', track: codeLang, input: codeInput, output: content }),
      });
      await loadCodeSessions();
    } catch (e) {
      setError('Lỗi: ' + String(e));
    }
    setLoading(false);
  }

  async function generateCode() {
    if (!codeInput.trim()) { setError('Vui lòng mô tả yêu cầu'); return; }
    setLoading(true);
    setCodeExample(null);
    setActiveCodeMode('generate');
    const trackLabel = TRACKS.find(t => t.id === codeLang)?.label || codeLang;
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: `Viết code ${trackLabel} theo yêu cầu sau (bằng tiếng Việt). Format:

## 📝 Yêu cầu
[Tóm tắt yêu cầu]

## 💻 Code
\`\`\`
[Code hoàn chỉnh, có comment tiếng Việt]
\`\`\`

## 📖 Giải thích
[Giải thích code từng phần]

Yêu cầu:
${codeInput}` }] }),
      });
      if (!res.ok) { setError('AI không phản hồi'); setLoading(false); return; }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) { setError('AI trả về rỗng'); setLoading(false); return; }
      setCodeExample(content);
      setError(null);
      // Save to database
      await fetch('/api/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'generate', track: codeLang, input: codeInput, output: content }),
      });
      await loadCodeSessions();
    } catch (e) {
      setError('Lỗi: ' + String(e));
    }
    setLoading(false);
  }

  const score = quizSubmitted ? userAnswers.filter((a, i) => a === quizAnswers[i]).length : 0;

  // Escape HTML entities (dùng cho code blocks)
  function escapeHtml(s: string) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Render markdown content - xử lý code blocks trước để tránh parse HTML bên trong
  function renderContent(text: string, baseId: string = 'code') {
    // Bỏ H1 đầu (tránh trùng với title card)
    text = text.replace(/^#\s+.+\n+/, '');
    // Tách code blocks ra, escape HTML bên trong, rồi ghép lại
    let blockCount = 0;
    const parts = text.split(/(```[\w]*\n?[\s\S]*?```)/gm);
    const processed = parts.map(part => {
      if (part.startsWith('```')) {
        const code = part.replace(/^```[\w]*\n?/, '').replace(/```$/, '');
        const escapedCode = escapeHtml(code);
        const codeId = `${baseId}-${blockCount++}`;
        return `<div style="position:relative;margin:10px 0">
          <pre id="${codeId}" style="background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:14px;overflow-x:auto;font-size:12.5px;line-height:1.7;color:#e6edf3;font-family:'SF Mono',Monaco,monospace;white-space:pre;text-align:left">${escapedCode}</pre>
          <button onclick="navigator.clipboard.writeText(document.getElementById('${codeId}').innerText);this.innerText='✓ Đã copy';setTimeout(()=>this.innerText='📋 Copy',2000)" style="position:absolute;top:8px;right:8px;padding:6px 12px;border-radius:4px;border:1px solid #30363d;background:#1c2230;color:#58a6ff;font-size:12px;cursor:pointer;font-weight:600">📋 Copy</button>
        </div>`;
      }
      // Xử lý inline: escape HTML trong `code` trước, dùng placeholder để khỏi bị re-parse
      const inlineCodes: string[] = [];
      let body = part.replace(/`([^`]+)`/g, (_, c) => {
        inlineCodes.push(escapeHtml(c));
        return `\x00${inlineCodes.length - 1}\x00`;
      });

      // Process tables: markdown table format | col1 | col2 |
      body = body.replace(/(\|.+\|\n\|[\s\-:|]+\|\n(?:\|.+\|\n)*)/gm, (match) => {
        const lines = match.trim().split('\n').filter(l => l.trim());
        if (lines.length < 2) return match;
        const headerLine = lines[0].split('|').map(c => c.trim()).filter(Boolean);
        const rows = lines.slice(2).map(line => line.split('|').map(c => c.trim()).filter(Boolean));
        let html = '<table style="border-collapse:collapse;width:100%;margin:12px 0;border:1px solid var(--border);border-radius:8px;overflow:hidden">';
        html += '<thead><tr style="background:var(--surface2);border-bottom:1px solid var(--border)">';
        headerLine.forEach(h => html += `<th style="padding:10px 12px;text-align:left;font-weight:700;color:var(--accent);border-right:1px solid var(--border)">${escapeHtml(h)}</th>`);
        html += '</tr></thead><tbody>';
        rows.forEach((row, i) => {
          html += `<tr style="${i%2===0?'background:transparent':'background:var(--surface2)'};border-bottom:1px solid var(--border)">`;
          row.forEach(cell => html += `<td style="padding:10px 12px;border-right:1px solid var(--border);color:var(--text)">${escapeHtml(cell)}</td>`);
          html += '</tr>';
        });
        html += '</tbody></table>';
        return html;
      });

      body = body
        .replace(/^## (.+)$/gm, '<h3 style="color:#d29922;font-size:13px;font-weight:700;margin:18px 0 8px;text-transform:uppercase;letter-spacing:0.5px">$1</h3>')
        .replace(/^### (.+)$/gm, '<h4 style="color:#e6edf3;font-size:13px;font-weight:600;margin:12px 0 6px">$1</h4>')
        .replace(/^#### (.+)$/gm, '<h5 style="color:#e6edf3;font-size:12px;font-weight:600;margin:10px 0 4px">$1</h5>')
        .replace(/^##### (.+)$/gm, '<h6 style="color:#e6edf3;font-size:11px;font-weight:600;margin:8px 0 2px">$1</h6>')
        .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#e6edf3">$1</strong>')
        .replace(/^> (.*$)/gm, '<blockquote style="border-left:3px solid var(--muted);padding-left:12px;margin:10px 0;font-style:italic;color:var(--muted)">$1</blockquote>')
        .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--surface);margin:16px 0" />')
        .replace(/ĐÁPÁN:[ABC]/g, '');
      // Gộp thành paragraphs: tách bằng dòng trắng, mỗi đoạn là <p>
      const blocks = body.split(/\n{2,}/).map(block => {
        block = block.trim();
        if (!block) return '';
        // Nếu đã là block element thì giữ nguyên
        if (/^<[a-z]/i.test(block)) return block;
        // Đoạn văn bản: gộp single \n thành khoảng trắng
        const inline = block.replace(/\n/g, ' ');
        return `<p style="margin:0 0 10px;line-height:1.7;color:var(--text)">${inline}</p>`;
      }).join('');
      // Trả lại inline code
      return blocks.replace(/\x00(\d+)\x00/g, (_, i) =>
        `<code style="background:#1c2230;padding:2px 6px;border-radius:4px;font-size:12px;color:#d2a8ff;font-family:monospace">${inlineCodes[+i]}</code>`
      );
    });
    return processed.join('');
  }

  const trackObj = TRACKS.find(t => t.id === track);
  const trackLessons = lessons.filter(l => l.topic.toLowerCase().includes(track) || l.content.includes(trackObj?.label || ''));

  return (
    <div className="fade-in">
      {error && (
        <div style={{ background:'#1a0a0a', border:'1px solid #f85149', borderRadius:8, padding:12, marginBottom:16, color:'#f85149', fontSize:13 }}>
          ⚠️ {error}
        </div>
      )}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h1 className="page-title" style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>🧑‍💻 Bài Học Lập Trình AI</h1>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setMode('lesson')} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${mode==='lesson'?'var(--accent)':'var(--border)'}`, background: mode==='lesson'?'var(--accent)22':'transparent', color: mode==='lesson'?'var(--accent)':'var(--muted)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }} className="mode-btn" title="Bài học">📖<span className="mode-text"> Bài học</span></button>
            <button onClick={() => setMode('code')} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${mode==='code'?'var(--accent)':'var(--border)'}`, background: mode==='code'?'var(--accent)22':'transparent', color: mode==='code'?'var(--accent)':'var(--muted)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }} className="mode-btn" title="Hỏi code">💬<span className="mode-text"> Hỏi code</span></button>
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{mode==='lesson'?`AI tạo bài mới, không lặp lại — ${lessons.length} bài đã học`:'Paste code và hỏi AI giải thích'}</div>
      </div>

      {mode === 'lesson' && (
        <>
        {/* Track selector - Horizontal Scroll on Mobile */}
        <div style={{ 
          display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 12,
          scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch'
        }} className="no-scrollbar">
          {TRACKS.map(t => (
            <button key={t.id} onClick={() => setTrack(t.id)} style={{
              padding: '10px 18px', borderRadius: 10, border: '1px solid',
              borderColor: track === t.id ? t.color : 'var(--border)',
              background: track === t.id ? t.color + '22' : 'var(--surface)',
              color: track === t.id ? t.color : 'var(--muted)',
              fontSize: 13, cursor: 'pointer', fontWeight: track === t.id ? 700 : 400,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              touchAction: 'manipulation'
            }}>{t.label}</button>
          ))}
        </div>

        {trackLessons.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
            ✅ Đã học {trackLessons.length} bài {trackObj?.label}
          </div>
        )}

        <button className="btn btn-primary" style={{ width: '100%', marginBottom: 20, height: 56, fontSize: 16, boxShadow: '0 4px 12px rgba(88,166,255,0.2)', touchAction: 'manipulation' }} onClick={genLesson} disabled={loading}>
          {loading ? '⏳ AI đang soạn bài...' : `🤖 Tạo bài ${trackObj?.label} mới`}
        </button>
        </>
      )}

      {mode === 'code' && (
        <>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {TRACKS.map(t => (
            <button key={t.id} onClick={() => setCodeLang(t.id)} style={{
              padding: '7px 14px', borderRadius: 8, border: '1px solid',
              borderColor: codeLang === t.id ? t.color : 'var(--border)',
              background: codeLang === t.id ? t.color + '22' : 'var(--surface)',
              color: codeLang === t.id ? t.color : 'var(--muted)',
              fontSize: 13, cursor: 'pointer', fontWeight: codeLang === t.id ? 700 : 400,
            }}>{t.label}</button>
          ))}
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
            {TRACKS.find(t => t.id === codeLang)?.label || codeLang}
          </div>
          <textarea placeholder='Paste code hoặc mô tả yêu cầu...' value={codeInput} onChange={(e)=>setCodeInput(e.target.value)} style={{ width: '100%', minHeight: 180, padding: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, fontFamily: 'monospace', boxSizing: 'border-box', resize: 'vertical', marginBottom: 12 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1, height: 44 }} onClick={explainCode} disabled={loading || !codeInput.trim()}>
              {loading && activeCodeMode==='explain' ? '⏳ Phân tích...' : '💬 Giải thích'}
            </button>
            <button className="btn btn-primary" style={{ flex: 1, height: 44 }} onClick={generateCode} disabled={loading || !codeInput.trim()}>
              {loading && activeCodeMode==='generate' ? '⏳ Tạo...' : '✨ Tạo code'}
            </button>
          </div>
        </div>

        {codeExplanation && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', marginBottom: 12 }}>💡 Giải thích</div>
            <div style={{ textAlign: 'left' }} dangerouslySetInnerHTML={{ __html: renderContent(codeExplanation, 'explain') }} />
          </div>
        )}

        {codeExample && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', marginBottom: 12 }}>✨ Code Mẫu</div>
            <div style={{ textAlign: 'left' }} dangerouslySetInnerHTML={{ __html: renderContent(codeExample, 'example') }} />
          </div>
        )}

        {mounted && (
          <div className="card">
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <div className="section-title" style={{ margin:0 }}>📋 Lịch sử ({codeSessions.length})</div>
            </div>
            <div style={{ maxHeight: 400, overflowY: 'auto', paddingRight: 4 }}>
              {codeSessions.length === 0 ? (
                <div style={{color:'var(--muted)', fontSize:13, padding:10}}>Chưa có lịch sử.</div>
              ) : (
                codeSessions.map((session, i) => (
                  <div key={session.id} style={{ display:'flex', alignItems:'center', gap:6, padding:'8px', borderBottom:'1px solid var(--surface2)', borderRadius:8, transition:'background 0.15s', background:'transparent' }}
                    onMouseEnter={e=>(e.currentTarget.style.background='var(--surface2)')}
                    onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                    <div onClick={() => {
                      setCodeInput(session.input);
                      setCodeLang(session.track);
                      if (session.type === 'explain') {
                        setActiveCodeMode('explain');
                        setCodeExplanation(session.output);
                      } else {
                        setActiveCodeMode('generate');
                        setCodeExample(session.output);
                      }

                      contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }} style={{ flex:1, minWidth:0, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
                      <div style={{ width:28, height:28, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:12,
                        background: 'var(--surface2)',
                        color: session.type === 'explain' ? '#d2a8ff' : '#58a6ff', flexShrink:0 }}>
                        {session.type === 'explain' ? '💬' : '✨'}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ color: 'var(--text)', fontSize: 12, overflow:'hidden', textOverflow:'ellipsis', fontWeight: 600, whiteSpace:'nowrap' }}>
                          {session.type === 'explain' ? 'Giải thích' : 'Tạo'} · {TRACKS.find(t=>t.id===session.track)?.label?.split(' ')[0] || session.track}
                        </div>
                        <div style={{ fontSize:10, color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {session.input.slice(0, 40)}...
                        </div>
                      </div>
                    </div>
                    <button onClick={() => deleteCodeSession(session.id)} style={{ padding:'4px 6px', borderRadius:4, border:'1px solid var(--border)', background:'transparent', color:'var(--muted)', fontSize:11, cursor:'pointer', flexShrink:0 }}>🗑</button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        </>
      )}

      {mode === 'lesson' && (
        <>
      {/* Desktop: 2 col - lesson left, history right */}
      <div className="desktop-main-side">
        {/* LEFT: Current lesson */}
        <div>
          {current && (
            <div className="card" style={{ marginBottom: 16 }} ref={contentRef}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'var(--accent)' }}>{current.topic}</div>
                <div style={{ display:'flex', gap:6 }}>
                  {!current.completed && (
                    <button onClick={() => markComplete(current.id)} style={{ fontSize:11, color:'#3fb950', background:'#3fb95011', border:'1px solid #3fb95033', borderRadius:6, padding:'4px 10px', cursor:'pointer' }}>
                      ✓ Đánh dấu đã học
                    </button>
                  )}
                  <button onClick={async () => {
                    await fetch('/api/lessons', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: current.id }) });
                    setCurrent(null); setQuizAnswers([]); setUserAnswers([]); await load();
                  }} style={{ fontSize:11, color:'#f85149', background:'#f8514911', border:'1px solid #f8514933', borderRadius:6, padding:'4px 10px', cursor:'pointer' }}>
                    🗑 Xóa
                  </button>
                </div>
              </div>
              <div style={{ textAlign: 'left' }} dangerouslySetInnerHTML={{ __html: renderContent(current.content.replace(/## 🧠 Quiz[\s\S]*/,''), 'lesson') }} />

              {quizAnswers.length > 0 && (
                <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: '#d29922' }}>🧠 Quiz</div>
                  {(() => {
                    const quizSection = current.content.match(/## 🧠 Quiz[\s\S]*/)?.[0] || '';
                    const blocks = [...quizSection.matchAll(/\d+\.\s+([\s\S]*?)(?=ĐÁPÁN:[ABC])/g)];
                    return blocks;
                  })().map((match, i) => {
                    const block = match[1].trim().replace(/\*\*/g, '');
                    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
                    const question = lines[0];
                    const optLine = lines.slice(1).join(' ');
                    const optA = optLine.match(/A[).]\s*(.*?)(?=\s*B[).])/i)?.[1]?.trim() || '';
                    const optB = optLine.match(/B[).]\s*(.*?)(?=\s*C[).])/i)?.[1]?.trim() || '';
                    const optC = optLine.match(/C[).]\s*(.*?)$/i)?.[1]?.trim() || '';
                    const options = [optA, optB, optC];
                    return (
                      <div key={i} style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{i+1}. {question}</div>
                        {['A','B','C'].map((opt, oi) => {
                          const optText = options[oi] || '';
                          const isSelected = userAnswers[i] === opt;
                          const isCorrect = quizAnswers[i] === opt;
                          let bg = 'var(--surface2)', border = 'var(--border)', color = 'var(--text)';
                          if (quizSubmitted) {
                            if (isCorrect) { bg = '#0d1a0e'; border = '#3fb950'; color = '#3fb950'; }
                            else if (isSelected && !isCorrect) { bg = '#1a0a0a'; border = '#f85149'; color = '#f85149'; }
                          } else if (isSelected) { bg = '#58a6ff22'; border = '#58a6ff'; }
                          return (
                            <button key={opt} onClick={() => { if (!quizSubmitted) setUserAnswers(a => { const n=[...a]; n[i]=opt; return n; }); }}
                              style={{ display:'block', width:'100%', textAlign:'left', background:bg, border:`1px solid ${border}`, borderRadius:8, padding:'10px 14px', color, fontSize:13, cursor:quizSubmitted?'default':'pointer', marginBottom:6 }}>
                              {opt}) {optText.replace(/^[ABC]\)\s*/,'')}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                  {!quizSubmitted ? (
                    <button className="btn btn-green" style={{ width:'100%', height:44 }} onClick={submitQuiz} disabled={userAnswers.some(a=>!a)}>
                      Nộp bài
                    </button>
                  ) : (
                    <div style={{ textAlign:'center', padding:'16px', background: score===quizAnswers.length?'#0d1a0e':'#1a0a0a', borderRadius:10, border:`1px solid ${score===quizAnswers.length?'#3fb950':'#f85149'}` }}>
                      <div style={{ fontSize:24, fontWeight:900, color: score===quizAnswers.length?'#3fb950':'#f85149' }}>
                        {score}/{quizAnswers.length} {score===quizAnswers.length?'🎉':'💪'}
                      </div>
                      <div style={{ fontSize:12, color:'var(--muted)', marginTop:6, marginBottom:12 }}>
                        {score===quizAnswers.length?'Xuất sắc! Học bài tiếp nhé.':'Xem lại và thử bài khác.'}
                      </div>
                      {score===quizAnswers.length && !current.completed && (
                        <button className="btn btn-green" style={{ width:'100%' }} onClick={() => markComplete(current.id)}>
                          ✓ Hoàn thành bài này
                        </button>
                      )}
                      {current.completed && (
                        <div style={{ fontSize:12, color:'#3fb950', fontWeight:600 }}>✓ Bài đã hoàn thành</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {!current && !loading && (
            <div className="card" style={{ textAlign:'center', padding:'48px 24px', color:'var(--muted)' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>📖</div>
              <div style={{ fontSize:15, fontWeight:700, marginBottom:8 }}>Chọn bài học</div>
              <div style={{ fontSize:13 }}>Nhấn vào bài trong danh sách bên phải</div>
            </div>
          )}
        </div>

        {/* RIGHT: History filtered by Current Track */}
        <div>
          {mounted && (
            <div className="card">
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                <div className="section-title" style={{ margin:0 }}>📚 Lịch sử ({lessons.filter(l => l.track === track).length})</div>
              </div>
            
            <div style={{ maxHeight: 600, overflowY: 'auto', paddingRight: 4 }}>
              {(() => {
                const group = lessons.filter(l => l.track === track).sort((a,b) => a.order - b.order);
                if (group.length === 0) return <div style={{color:'var(--muted)', fontSize:13, padding:10}}>Chưa có bài lưu cho phần này.</div>;
                const completed = group.filter(l => l.completed).length;

                return (
                  <>
                    <div style={{ fontSize:11, color:'var(--muted)', padding:'8px', marginBottom:8, background:'var(--surface2)', borderRadius:6, textAlign:'center' }}>
                      ✅ {completed}/{group.length} bài hoàn thành
                    </div>
                    {group.map((l, i) => (
                      <div key={l.id} onClick={() => {
                        setCurrent(l);
                        setQuizMode(false); setQuizSubmitted(false); setUserAnswers([]);
                        const answers: string[] = [];
                        const ms = l.content.matchAll(/ĐÁPÁN:([ABC])/g);
                        for (const m of ms) answers.push(m[1]);
                        setQuizAnswers(answers);
                        setUserAnswers(answers.map(() => ''));

                        contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }} style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 8px', borderBottom:'1px solid var(--surface2)', cursor:'pointer', borderRadius:8, transition:'background 0.15s' }}
                        onMouseEnter={e=>(e.currentTarget.style.background='var(--surface2)')}
                        onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                        <div style={{ width:28, height:28, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:11,
                          background: l.completed ? '#3fb950' : current?.id===l.id ? '#58a6ff33' : 'var(--surface2)',
                          color: l.completed ? '#fff' : 'var(--text)', flexShrink:0 }}>
                          {l.completed ? '✓' : i+1}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ color: current?.id===l.id ? 'var(--accent)' : 'var(--text)', fontSize: 13, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', fontWeight: 600 }}>{l.topic}</div>
                          <div style={{ fontSize:11, color:'var(--muted)' }}>{l.completed ? '✅ Hoàn thành' : '⏳ Chưa học'}</div>
                        </div>
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>
          </div>
          )}
        </div>
      </div>
        </>
      )}
    </div>
  );
}
