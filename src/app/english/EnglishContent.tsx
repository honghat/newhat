'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { speakText } from '@/lib/tts';

const AI_OFFLINE = '__AI_OFFLINE__';
async function askAI(prompt: string, timeoutMs = 300000): Promise<string> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch('/api/ai', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
      signal: ctrl.signal,
    });
    clearTimeout(to);
    const data = await res.json();
    if (!res.ok) return data.error || `Error ${res.status}`;
    return data.choices?.[0]?.message?.content || AI_OFFLINE;
  } catch (e) {
    clearTimeout(to);
    const msg = e instanceof Error ? e.message : String(e);
    if (ctrl.signal.aborted) return `Timeout: AI không phản hồi sau ${timeoutMs/1000}s`;
    return `Lỗi mạng: ${msg}`;
  }
}

// Làm sạch output AI khi tạo chủ đề (1 câu) — bỏ quotes, markdown, prefixes
function cleanTopic(raw: string): string {
  let t = raw.trim();
  const lines = t.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return '';
  t = lines.find(l => l.includes('?')) || lines[0];
  t = t.replace(/^[*#>\-•\d.]+\s*/, '');
  t = t.replace(/^(topic|question|prompt|here(?:'s| is))[:\s]+/i, '');
  t = t.replace(/^["'"'「『](.*)["'"'」』]$/, '$1');
  t = t.replace(/^["'](.*)["']$/, '$1');
  return t.trim();
}

async function saveToDb(type: string, content: string, metadata = {}, mode = 'coder') {
  const res = await fetch('/api/english', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, content, metadata: { ...metadata, mode } }),
  });
  const data = await res.json();
  // Ghi nhật ký hàng ngày
  const labels: Record<string,string> = { listen:'Nghe tiếng Anh', speak:'Luyện nói tiếng Anh', writing:'Viết tiếng Anh', vocab:'Học từ vựng', reading:'Đọc tiếng Anh' };
  const today = new Date().toISOString().slice(0,10);
  fetch('/api/logs', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: today, addHours: 0.25, addTopic: labels[type] || 'Tiếng Anh' }),
  }).catch(()=>{});
  return data;
}

async function speak(text: string, speed = 1.0, voice = 'en_female') {
  await speakText(text, speed, voice);
}

function parseMarkdown(text: string) {
  if (!text) return '';
  let html = text
    .replace(/^# (.*$)/gim, '<h1 style="font-size:18px; margin:14px 0 8px; font-weight:900; color:var(--text-main)">$1</h1>')
    .replace(/^## (.*$)/gim, '<h2 style="font-size:16px; margin:12px 0 6px; font-weight:800; color:var(--text-main)">$1</h2>')
    .replace(/^### (.*$)/gim, '<h3 style="font-size:14px; margin:10px 0 4px; font-weight:700; color:var(--text-main)">$1</h3>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong style="color:var(--accent)">$1</strong>')
    .replace(/^> (.*$)/gim, '<blockquote style="border-left:3px solid var(--muted); padding-left:12px; margin:10px 0; font-style:italic; color:var(--muted)">$1</blockquote>')
    .replace(/^---$/gim, '<hr style="border:none; border-top:1px solid var(--surface); margin:16px 0" />')
    .replace(/\n/gim, '<div style="height:4px"></div>');
  return html;
}

const READ_LEVELS = [{ id:'A2', label:'A2' }, { id:'B1', label:'B1' }, { id:'B2', label:'B2' }];
const READ_TOPICS = ['Web Development','Career & Jobs','Technology','Daily Life','Science','Business'];
const VOCAB_TOPICS = ['programming','web development','databases','networking','AI & ML','DevOps','career & jobs','daily life'];
const WRITING_PROMPTS = ["Describe how React components work.","Explain what an API is in simple terms.","What is the difference between SQL and NoSQL databases?"];

const TABS = [
  {id:'listen',l:'🎧 Nghe'}, {id:'speak',l:'🎤 Nói'}, {id:'write',l:'✍️ Viết'},
  {id:'vocab',l:'📚 Từ vựng'}, {id:'read',l:'📖 Đọc'}, {id:'dict',l:'🔎 Tra từ'},
] as const;

const MODES = [
  { id: 'coder', label: '💻 Coder', desc: 'developer, tech, programming' },
  { id: 'communication', label: '💬 Giao tiếp', desc: 'daily life, travel, work, relationships' },
  { id: 'business', label: '💼 Công việc', desc: 'business meetings, emails, interviews' },
  { id: 'ielts', label: '🎓 IELTS', desc: 'academic IELTS-style topics' },
] as const;

export default function EnglishContent() {
  const [tab, setTab] = useState<'listen'|'speak'|'write'|'vocab'|'read'|'dict'>('listen');
  const [mode, setMode] = useState<any>('coder');
  const [ttsOnline, setTtsOnline] = useState(false);
  const modeDesc = MODES.find(m => m.id === mode)?.desc || 'developer';

  // State
  const [listenText, setListenText] = useState('');
  const [listenLoading, setListenLoading] = useState(false);
  const [playing, setPlaying] = useState(false);

  const [spkTopic, setSpkTopic] = useState('Tell me about your typical day as a software developer.');
  const [transcript, setTranscript] = useState('');
  const [spkFeedback, setSpkFeedback] = useState('');
  const [spkLoading, setSpkLoading] = useState(false);
  const [spkTopicLoading, setSpkTopicLoading] = useState(false);
  const [spkRecordId, setSpkRecordId] = useState<number|null>(null);
  const [spkSample, setSpkSample] = useState('');
  const [spkSampleLoading, setSpkSampleLoading] = useState(false);

  const [writeText, setWriteText] = useState('');
  const [writePrompt, setWritePrompt] = useState(WRITING_PROMPTS[0]);
  const [writeFeedback, setWriteFeedback] = useState('');
  const [writeLoading, setWriteLoading] = useState(false);
  const [writeTopicLoading, setWriteTopicLoading] = useState(false);
  const [writeSample, setWriteSample] = useState('');
  const [writeSampleLoading, setWriteSampleLoading] = useState(false);
  const [writeRecordId, setWriteRecordId] = useState<number|null>(null);

  const [cards, setCards] = useState<any[]>([]);
  const [cardIdx, setCardIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [vocabLoading, setVocabLoading] = useState(false);
  const [vocabTopic, setVocabTopic] = useState('programming');

  const [readLevel, setReadLevel] = useState('B1');
  const [readTopic, setReadTopic] = useState('Web Development');
  const [readLoading, setReadLoading] = useState(false);
  const [readArticle, setReadArticle] = useState<any>(null);
  const [readQuestions, setReadQuestions] = useState<any[]>([]);
  const [readAnswers, setReadAnswers] = useState<number[]>([]);
  const [readSubmitted, setReadSubmitted] = useState(false);
  const [readSelected, setReadSelected] = useState('');
  const [readLookup, setReadLookup] = useState('');
  const [readLookupLoading, setReadLookupLoading] = useState(false);

  const [dictInput, setDictInput] = useState('');
  const [dictResult, setDictResult] = useState('');
  const [dictLoading, setDictLoading] = useState(false);

  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Recognition
  const mediaRecRef = useRef<MediaRecorder|null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recognizing, setRecognizing] = useState(false);
  const [sttStatus, setSttStatus] = useState('');

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/english');
      const data = await res.json();
      setHistory(data.filter((h:any)=> !h.type.endsWith('_pending')));
    } catch {}
    setHistoryLoading(false);
  }, []);

  async function deleteEntry(id: number) {
    if (!confirm('Bạn có chắc muốn xóa mục này?')) return;
    try {
      await fetch('/api/english', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      loadHistory();
    } catch (e) { alert('Lỗi: ' + e); }
  }

  useEffect(() => {
    fetch('/api/tts', { signal: AbortSignal.timeout(4000) })
      .then(r => r.json()).then(d => setTtsOnline(!!d.available)).catch(() => setTtsOnline(false));
    loadHistory();
  }, [loadHistory]);

  // Actions
  async function genListenText() {
    setListenLoading(true);
    const raw = await askAI(`Create a short English paragraph (40-60 words) for listening. Level: ${modeDesc}. Topic: daily dev life. Respond with ONLY the English text.`);
    if (raw && !raw.startsWith('Timeout') && !raw.startsWith('Lỗi')) {
      setListenText(raw);
      await saveToDb('listen', raw, { topic: 'dev life' }, mode);
    }
    setListenLoading(false); loadHistory();
  }

  async function genSpkTopic() {
    setSpkTopicLoading(true); setSpkFeedback(''); setSpkSample('');
    const raw = await askAI(`Suggest ONE interesting English speaking question for ${modeDesc}. Topic: general. Respond with ONLY the question text (max 20 words).`);
    if (raw && !raw.startsWith('Timeout')) {
      const cleaned = cleanTopic(raw);
      setSpkTopic(cleaned);
      const row = await saveToDb('speak', cleaned, { initial: true }, mode);
      if (row) setSpkRecordId(row.id);
    }
    setSpkTopicLoading(false); loadHistory();
  }

  async function getFeedback() {
    if (!transcript.trim()) return;
    setSpkLoading(true);
    const raw = await askAI(`Evaluate this speaking response. Topic: "${spkTopic}". Answer: "${transcript}". Result in Markdown with Analysis and Improved Version.`);
    setSpkFeedback(raw || '');
    if (spkRecordId) {
      await fetch('/api/english', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: spkRecordId, content: transcript, metadata: { topic: spkTopic, feedback: raw || '' } }),
      });
    }
    setSpkLoading(false); loadHistory();
  }

  async function genSpkSample() {
    setSpkSampleLoading(true);
    const raw = await askAI(`Give a natural sample response to: "${spkTopic}". Respond in Markdown with English, Vietnamese translation, and key vocab.`);
    setSpkSample(raw || '');
    setSpkSampleLoading(false);
  }

  async function genWriteTopic() {
    setWriteTopicLoading(true); setWriteFeedback(''); setWriteSample('');
    const raw = await askAI(`Suggest ONE English writing prompt for ${modeDesc}. Topic: tech. Respond with ONLY the prompt text.`);
    if (raw && !raw.startsWith('Timeout')) {
      const cleaned = cleanTopic(raw);
      setWritePrompt(cleaned);
      const row = await saveToDb('writing', cleaned, { initial: true }, mode);
      if (row) setWriteRecordId(row.id);
    }
    setWriteTopicLoading(false); loadHistory();
  }

  async function checkWriting() {
    if (!writeText.trim()) return;
    setWriteLoading(true);
    const raw = await askAI(`Check this English essay. Topic: "${writePrompt}". Content: "${writeText}". Provide detailed Markdown feedback.`);
    setWriteFeedback(raw || '');
    if (writeRecordId) {
      await fetch('/api/english', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: writeRecordId, content: writeText, metadata: { prompt: writePrompt, feedback: raw || '' } }),
      });
    }
    setWriteLoading(false); loadHistory();
  }

  async function genWriteSample() {
    setWriteSampleLoading(true);
    const raw = await askAI(`Write a sample essay for: "${writePrompt}". Markdown format.`);
    setWriteSample(raw || '');
    setWriteSampleLoading(false);
  }

  async function loadVocab() {
    setVocabLoading(true); setCards([]); setCardIdx(0); setFlipped(false);
    const raw = await askAI(`Give 8 English vocabulary words for ${modeDesc}. Topic: ${vocabTopic}. JSON array ONLY: [{"word":"...","def":"...","ex":"...","vi":"..."}]`);
    try {
      const m = raw.match(/\[[\s\S]*\]/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        setCards(parsed);
        await saveToDb('vocab', JSON.stringify(parsed), { topic: vocabTopic }, mode);
      }
    } catch {}
    setVocabLoading(false); loadHistory();
  }

  async function generateReading() {
    setReadLoading(true); setReadArticle(null); setReadQuestions([]); setReadAnswers([]); setReadSubmitted(false);
    const raw = await askAI(`Create a reading passage for ${modeDesc}. Level: ${readLevel}. Topic: ${readTopic}. JSON ONLY: {"title":"...","body":"...","questions":[{"q":"...","options":["A","B","C","D"],"answer":0}]}`);
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        const p = JSON.parse(m[0]);
        setReadArticle({ title: p.title, body: p.body, wordCount: p.body.split(/\s+/).length });
        setReadQuestions(p.questions || []);
        setReadAnswers((p.questions||[]).map(()=>-1));
        await saveToDb('reading', p.body, { title: p.title, level: readLevel, questions: p.questions }, mode);
      }
    } catch {}
    setReadLoading(false); loadHistory();
  }

  async function lookupWord() {
    const w = dictInput.trim();
    if (!w) return;
    setDictLoading(true);
    const raw = await askAI(`Lookup or explain English word/phrase: "${w}". Respond in Markdown.`);
    setDictResult(raw || '');
    await saveToDb('dict', raw || '', { word: w }, mode);
    setDictLoading(false); loadHistory();
  }

  async function startRec() {
    setTranscript(''); setSpkFeedback(''); setRecognizing(true); setSttStatus('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = e => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        setSttStatus('⏳ Whisper đang nhận diện...');
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const form = new FormData();
        form.append('audio', blob, 'audio.webm');
        const res = await fetch('/api/stt', { method: 'POST', body: form });
        const data = await res.json();
        if (data.text) { setTranscript(data.text); setSttStatus(''); }
        else setSttStatus('❌ Lỗi nhận diện');
        setRecognizing(false);
      };
      mr.start(); mediaRecRef.current = mr;
    } catch { setRecognizing(false); }
  }

  const filteredHistory = history.filter(h => {
    const type = h.type;
    let hMode = '';
    try {
      const meta = JSON.parse(h.metadata || '{}');
      hMode = meta.mode || '';
    } catch {}

    // Filter by mode
    if (hMode && hMode !== mode) return false;

    // Filter by tab
    if (tab === 'listen') return type === 'listen';
    if (tab === 'speak') return type === 'speak';
    if (tab === 'write') return type === 'writing';
    if (tab === 'vocab') return type === 'vocab';
    if (tab === 'read') return type === 'reading';
    if (tab === 'dict') return type === 'dict';
    return true;
  });

  return (
    <div className="fade-in">
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <h1 className="page-title" style={{ fontSize:20, fontWeight:900, margin:0 }}>🇬🇧 Luyện Tiếng Anh</h1>
        <div suppressHydrationWarning className="pill" style={{ color: ttsOnline?'var(--green)':'var(--orange)' }}>
          {ttsOnline ? '🔊 LuxTTS' : '🔇 Browser TTS'}
        </div>
      </div>

      <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)} style={{ padding:'8px 16px', borderRadius:99, border:'1px solid', fontSize:13, fontWeight:600, cursor:'pointer', borderColor: tab===t.id?'var(--accent)':'var(--border)', background: tab===t.id?'var(--accent)':'transparent', color: tab===t.id?'#000':'var(--muted)' }}>
            {t.l}
          </button>
        ))}
      </div>

      <div style={{ display:'flex', gap:6, marginBottom:20, flexWrap:'wrap' }}>
        {MODES.map(m => (
          <button key={m.id} onClick={()=>setMode(m.id)} style={{ padding:'5px 12px', borderRadius:6, border:'1px solid', fontSize:12, fontWeight:600, cursor:'pointer', borderColor: mode===m.id?'var(--green)':'var(--border)', background: mode===m.id?'var(--green)22':'transparent', color: mode===m.id?'var(--green)':'var(--muted)' }}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="desktop-main-side">
        <div style={{ flex:1, minWidth:0 }}>
          {/* TAB LISTEN */}
          {tab==='listen' && (
            <div className="card">
              <div className="section-title">Nội dung nghe</div>
              <textarea className="input" value={listenText} onChange={e=>setListenText(e.target.value)} rows={5} placeholder="Nhập hoặc tạo bài nghe mới..." />
              <div style={{ display:'flex', gap:8, marginTop:12 }}>
                <button className="btn btn-ghost" style={{ flex:1 }} onClick={genListenText} disabled={listenLoading}>
                  {listenLoading ? '⏳ Đang tạo...' : '🤖 AI tạo bài mới'}
                </button>
                <button className="btn btn-primary" style={{ flex:1 }} onClick={()=>speak(listenText)} disabled={!listenText||playing}>
                  {playing ? '🔊 Đang phát...' : '▶ Phát'}
                </button>
              </div>
            </div>
          )}

          {/* TAB SPEAK */}
          {tab==='speak' && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div className="card">
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                  <div>
                    <div className="section-title" style={{ marginBottom:4 }}>Chủ đề nói</div>
                    <div style={{ fontSize:15, color:'var(--purple)', fontWeight:700 }}>{spkTopicLoading ? '⏳ AI đang tạo...' : spkTopic}</div>
                  </div>
                  <button onClick={genSpkTopic} disabled={spkTopicLoading} className="btn-icon">🤖</button>
                </div>
                <div style={{ display:'flex', gap:12 }}>
                  <button onClick={()=>speak(spkTopic)} style={{ fontSize:12, background:'none', color:'var(--muted)', border:'none', cursor:'pointer' }}>🔊 Nghe câu hỏi</button>
                  <button onClick={genSpkSample} disabled={spkSampleLoading} style={{ fontSize:12, background:'none', color:'var(--green)', border:'none', cursor:'pointer' }}>
                    {spkSampleLoading ?'⏳...' : '💡 Bài mẫu'}
                  </button>
                </div>
                {spkSample && <div className="card" style={{ marginTop:12, background:'var(--surface2)' }} dangerouslySetInnerHTML={{ __html: parseMarkdown(spkSample) }} />}
              </div>

              <div className="card" style={{ textAlign:'center' }}>
                <button onClick={recognizing ? ()=>mediaRecRef.current?.stop() : startRec} style={{ width:70, height:70, borderRadius:99, border:'none', fontSize:30, cursor:'pointer', background:recognizing?'var(--red)':'var(--green)' }}>
                  {recognizing ? '⏹' : '🎤'}
                </button>
                <div style={{ fontSize:12, color:'var(--muted)', marginTop:8 }}>{sttStatus || (recognizing ? 'Đang nghe...' : 'Bấm để nói')}</div>
              </div>

              {transcript && (
                <div className="card">
                  <div className="section-title">Bạn vừa nói</div>
                  <p style={{ fontStyle:'italic' }}>"{transcript}"</p>
                  <button className="btn btn-ghost" style={{ width:'100%' }} onClick={getFeedback} disabled={spkLoading}>
                    {spkLoading ? '⏳ Đang phân tích...' : '🤖 Chấm điểm bài nói'}
                  </button>
                  {spkFeedback && <div style={{ marginTop:12 }} dangerouslySetInnerHTML={{ __html: parseMarkdown(spkFeedback) }} />}
                </div>
              )}
            </div>
          )}

          {/* TAB WRITE */}
          {tab==='write' && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div className="card">
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                  <div>
                    <div className="section-title" style={{ marginBottom:4 }}>Đề tài viết</div>
                    <div style={{ fontSize:14, color:'var(--orange)', fontWeight:700 }}>{writeTopicLoading ? '⏳...' : writePrompt}</div>
                  </div>
                  <button onClick={genWriteTopic} disabled={writeTopicLoading} className="btn-icon">🤖</button>
                </div>
                <button onClick={genWriteSample} disabled={writeSampleLoading} style={{ fontSize:12, background:'none', color:'var(--green)', border:'none', cursor:'pointer' }}>
                  {writeSampleLoading ? '⏳...' : '💡 Bài mẫu'}
                </button>
                {writeSample && <div className="card" style={{ marginTop:12, background:'var(--surface2)' }} dangerouslySetInnerHTML={{ __html: parseMarkdown(writeSample) }} />}
              </div>
              <div className="card">
                <textarea className="input" value={writeText} onChange={e=>setWriteText(e.target.value)} rows={8} placeholder="Viết tiếng Anh của bạn tại đây..." />
                <button className="btn btn-primary" style={{ width:'100%', marginTop:12 }} onClick={checkWriting} disabled={writeLoading}>
                  {writeLoading ? '⏳ Đang chấm bài...' : '🤖 Chấm bài viết'}
                </button>
                {writeFeedback && <div style={{ marginTop:12 }} dangerouslySetInnerHTML={{ __html: parseMarkdown(writeFeedback) }} />}
              </div>
            </div>
          )}

          {/* TAB VOCAB */}
          {tab==='vocab' && (
            <div className="card">
              <div style={{ display:'flex', gap:8, marginBottom:16 }}>
                <input className="input" value={vocabTopic} onChange={e=>setVocabTopic(e.target.value)} placeholder="Chủ đề từ vựng..." />
                <button className="btn btn-primary" onClick={loadVocab} disabled={vocabLoading}>
                  {vocabLoading ? '⏳...' : 'Tạo'}
                </button>
              </div>
              {cards.length > 0 && (
                <div className="card" style={{ minHeight:160, textAlign:'center', display:'flex', flexDirection:'column', justifyContent:'center', cursor:'pointer', border:'2px solid var(--accent)' }} onClick={()=>setFlipped(!flipped)}>
                  {!flipped ? (
                    <h2 style={{ fontSize:28, fontWeight:900, color:'var(--accent)' }}>{cards[cardIdx].word}</h2>
                  ) : (
                    <div>
                      <div style={{ fontWeight:700 }}>{cards[cardIdx].vi}</div>
                      <div style={{ fontSize:13, color:'var(--muted)', fontStyle:'italic' }}>{cards[cardIdx].def}</div>
                    </div>
                  )}
                </div>
              )}
              {cards.length > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between', marginTop:12 }}>
                  <button className="btn btn-ghost" onClick={()=>setCardIdx(i => Math.max(0, i-1))}>Trước</button>
                  <span>{cardIdx+1}/{cards.length}</span>
                  <button className="btn btn-ghost" onClick={()=>setCardIdx(i => Math.min(cards.length-1, i+1))}>Sau</button>
                </div>
              )}
            </div>
          )}

          {/* TAB READING */}
          {tab==='read' && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div className="card">
                <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                  <select className="input" value={readLevel} onChange={e=>setReadLevel(e.target.value)} style={{ flex:1 }}>
                    {READ_LEVELS.map(l=><option key={l.id} value={l.id}>{l.label}</option>)}
                  </select>
                  <input className="input" value={readTopic} onChange={e=>setReadTopic(e.target.value)} style={{ flex:2 }} />
                  <button className="btn btn-primary" onClick={generateReading} disabled={readLoading}>
                    {readLoading ? '⏳...' : 'Tạo bài đọc'}
                  </button>
                </div>
              </div>
              {readArticle && (
                <div className="card">
                  <h2>{readArticle.title}</h2>
                  <p style={{ lineHeight:1.7 }}>{readArticle.body}</p>
                </div>
              )}
            </div>
          )}

          {/* TAB DICT */}
          {tab==='dict' && (
            <div className="card">
              <div style={{ display:'flex', gap:8, marginBottom:16 }}>
                <input className="input" value={dictInput} onChange={e=>setDictInput(e.target.value)} placeholder="Nhập từ hoặc câu cần tra..." />
                <button className="btn btn-primary" onClick={lookupWord} disabled={dictLoading}>Tra từ</button>
              </div>
              {dictResult && <div className="card" style={{ background:'var(--surface2)' }} dangerouslySetInnerHTML={{ __html: parseMarkdown(dictResult) }} />}
            </div>
          )}
        </div>
      </div>

      {/* History at Bottom */}
      <div className="card" style={{ marginTop:30, borderTop:'1px solid var(--border)', background:'transparent' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <div className="section-title" style={{ margin:0 }}>📚 Lịch sử ({filteredHistory.length})</div>
          <button onClick={loadHistory} className="btn-icon">↻</button>
        </div>
        {historyLoading && <div style={{ fontSize:12 }}>Đang tải...</div>}
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
          {filteredHistory.map((h, i) => (
            <div key={h.id || i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <span className="pill" style={{ fontSize:9, marginRight:8 }}>{h.type.toUpperCase()}</span>
                <span style={{ fontSize:13 }} className="text-truncate">
                  {h.content.startsWith('[') || h.content.startsWith('{') ? '📦 Dữ liệu bài tập' : h.content}
                </span>
                <span style={{ fontSize:10, color:'var(--muted)', marginLeft:10 }}>{new Date(h.createdAt).toLocaleDateString()}</span>
              </div>
              <button onClick={()=>deleteEntry(h.id)} style={{ color:'var(--red)', background:'none', border:'none', cursor:'pointer', fontSize:12, fontWeight:600 }}>Xóa</button>
            </div>
          ))}
          {filteredHistory.length === 0 && <div style={{ fontSize:12, color:'var(--muted)', textAlign:'center', padding:20 }}>Trống</div>}
        </div>
      </div>
    </div>
  );
}
