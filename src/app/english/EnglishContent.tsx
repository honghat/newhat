'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { speakText } from '@/lib/tts';
import GuideTab from './_tabs/GuideTab';
import DictTab from './_tabs/DictTab';
import VocabTab from './_tabs/VocabTab';
import ReadTab from './_tabs/ReadTab';
import GrammarTab from './_tabs/GrammarTab';
import WriteTab from './_tabs/WriteTab';
import SpeakTab from './_tabs/SpeakTab';

const AI_OFFLINE = '__AI_OFFLINE__';
async function askAI(prompt: string, model = 'default', timeoutMs = 300000): Promise<string> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch('/api/ai', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
      signal: ctrl.signal,
    });
    clearTimeout(to);
    const data = await res.json();
    if (!res.ok) return data.error || `Error ${res.status}`;
    return data.choices?.[0]?.message?.content || AI_OFFLINE;
  } catch (e) {
    clearTimeout(to);
    const msg = e instanceof Error ? e.message : String(e);
    if (ctrl.signal.aborted) return `Timeout: AI không phản hồi sau ${timeoutMs / 1000}s`;
    return `Lỗi mạng: ${msg}`;
  }
}

// Background task: chạy trên server, không chết khi user rời trang.
// Poll mỗi 2s, timeout client-side 60s (server vẫn tiếp tục đến 120s).
async function genTopicTask(
  type: string,
  prompt: string,
  onTick: (elapsed: number) => void,
  model = 'default'
): Promise<{ content: string, id: number } | null> {
  const startRes = await fetch('/api/ai/task', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, prompt, model }),
  });
  if (!startRes.ok) throw new Error('Không khởi động được task');
  const { taskId } = await startRes.json();
  const start = Date.now();
  while (Date.now() - start < 600000) { // Tăng lên 10 phút cho các bài giảng cực kỳ chi tiết
    await new Promise(r => setTimeout(r, 2000));
    onTick(Math.floor((Date.now() - start) / 1000));
    const res = await fetch(`/api/ai/task?taskId=${taskId}&type=${encodeURIComponent(type)}`);
    if (!res.ok) continue;
    const data = await res.json();
    if (data.status === 'done') return { content: data.content, id: data.id } as any;
    if (data.status === 'error') throw new Error(data.error || 'AI lỗi');
    if (data.status === 'unknown') return null;
  }
  throw new Error('Quá 5 phút: AI không phản hồi kịp');
}

async function updateLessonMetadata(id: number, metadata: any) {
  try {
    await fetch('/api/english', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, metadata }),
    });
  } catch (e) { console.error('Failed to update metadata', e); }
}

// Làm sạch output AI khi tạo chủ đề (1 câu) — bỏ quotes, markdown, prefixes
function cleanTopic(raw: string): string {
  let t = raw.trim();
  // Lấy dòng đầu tiên có nội dung
  const lines = t.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return '';
  // Ưu tiên dòng có dấu ? (câu hỏi), nếu không thì lấy dòng đầu
  t = lines.find(l => l.includes('?')) || lines[0];
  // Bỏ markdown, bullet, số thứ tự ở đầu
  t = t.replace(/^[*#>\-•\d.]+\s*/, '');
  // Bỏ prefixes kiểu "Topic:", "Question:", "Here's..."
  t = t.replace(/^(topic|question|prompt|here(?:'s| is))[:\s]+/i, '');
  // Bỏ quotes bao quanh
  t = t.replace(/^["'"'「『](.*)["'"'」』]$/, '$1');
  t = t.replace(/^["'](.*)["']$/, '$1');
  return t.trim();
}

async function saveToDb(type: string, content: string, metadata = {}, mode = 'coder') {
  try {
    const res = await fetch('/api/english', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, content, metadata: { ...metadata, mode } }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function speak(text: string, speed = 1.0, voice = 'en-US-AvaNeural', server = 'edge') {
  await speakText(text, speed, voice, server);
}

// Browser TTS for vocabulary (simple, fast)
function speakBrowser(text: string) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel(); // Stop any ongoing speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  }
}

// Simple Markdown Parser to handle # and *
function parseMarkdown(text: string) {
  if (!text) return '';
  const lines = text.split('\n');
  const htmlLines: string[] = [];
  let inTable = false;

  for (let line of lines) {
    if (/^[ \t]*\|.*\|[ \t]*$/.test(line)) {
      if (/^[ \t]*\|[\-\|\s:]+\|[ \t]*$/.test(line)) continue;
      if (!inTable) {
        inTable = true;
        htmlLines.push('<div style="overflow-x:auto; margin:12px 0; border-radius:8px; border:1px solid var(--border);"><table style="width:100%; border-collapse:collapse; background:rgba(0,0,0,0.1);"><tbody>');
      }

      const content = line.replace(/^[ \t]*\|/, '').replace(/\|[ \t]*$/, '');
      const cells = content.split('|').map(c => c.trim());
      const isHeader = htmlLines[htmlLines.length - 1].endsWith('<tbody>');

      const rowHtml = '<tr>' + cells.map(c => {
        const cellText = c.replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--accent)">$1</strong>');
        if (isHeader) {
          return `<th style="padding: 10px 12px; border-bottom: 1px solid var(--border); font-size: 15px; font-weight: 800; color: var(--text-main); text-align: left; background: rgba(0,0,0,0.25)">${cellText}</th>`;
        }
        return `<td style="padding: 8px 12px; border-bottom: 1px solid var(--border); font-size: 15px; color: var(--text);">${cellText}</td>`;
      }).join('') + '</tr>';

      htmlLines.push(rowHtml);
      continue;
    } else if (inTable) {
      inTable = false;
      htmlLines.push('</tbody></table></div>');
    }

    let parsed = line
      .replace(/^# (.*$)/g, '<h1 style="font-size:20px; margin:12px 0 6px; font-weight:800; color:var(--text-main)">$1</h1>')
      .replace(/^## (.*$)/g, '<h2 style="font-size:18px; margin:10px 0 4px; font-weight:700; color:var(--text-main)">$1</h2>')
      .replace(/^### (.*$)/g, '<h3 style="font-size:16.5px; margin:8px 0 4px; font-weight:600; color:var(--text-main)">$1</h3>')
      // IN ĐẬM VÀ TÔ MÀU số thứ tự đầu dòng (ví dụ: 1. Sáng kiến)
      // CHỈ áp dụng nếu sau số là chữ hoặc khoảng trắng, không phải dấu gạch chéo (điểm số)
      .replace(/^(\d+\.)(?!\d*\/)\s*(.*)/g, '<strong style="color:var(--accent)">$1</strong> $2')
      // 2. Xóa dấu ** và * mà KHÔNG xóa khoảng trắng xung quanh
      .replace(/\*\*\s*(.*?)\s*\*\*/g, '$1')
      .replace(/\*\s*(.*?)\s*\*/g, '$1')
      // Dọn dẹp key có dấu hai chấm
      .replace(/\s*([^:\n]+)\s*:\s*\*?/g, '$1: ')
      .replace(/^> (.*$)/g, '<blockquote style="border-left:3px solid var(--muted); padding-left:12px; margin:10px 0; font-style:italic; color:var(--muted); font-size:14.5px">$1</blockquote>')
      .replace(/^---$/g, '<hr style="border:none; border-top:1px solid var(--surface); margin:16px 0" />');

    htmlLines.push(parsed);
  }

  if (inTable) htmlLines.push('</tbody></table></div>');

  return htmlLines.map(l => {
    if (l.startsWith('<div style="overflow-x') || l.startsWith('</tbody>') || l.startsWith('<tr>')) return l;
    return l + '<div style="height:4px"></div>';
  }).join('');
}

const WRITING_PROMPTS = [
  "Describe how React components work.",
  "Explain what an API is in simple terms.",
  "What is the difference between SQL and NoSQL databases?",
  "How do you handle debugging a complex bug?",
  "What are the pros and cons of microservices?",
  "Describe your favorite programming language.",
  "Explain the importance of code reviews.",
  "How to maintain a good work-life balance as a dev?",
  "The impact of AI on software development.",
  "Best practices for secure coding.",
  "Your experience with remote work.",
  "What makes a good technical lead?",
  "How to optimize web performance?",
  "The future of frontend frameworks.",
  "Why is documentation critical in a project?"
];

// Fallback topics for Speaking
const SPEAKING_TOPICS = [
  "Tell me about your favorite project that you have worked on.",
  "What are the most important skills for a junior developer?",
  "How do you stay updated with new technologies?",
  "Describe a time when you had to work in a team to solve a problem.",
  "What do you like most about being a software engineer?",
  "Explain the difference between Git merge and Git rebase.",
  "How do you prioritize your daily tasks as a developer?",
  "What is your dream job in the tech industry?",
  "How do you handle a disagreement with a co-worker?",
  "Describe a technical challenge you solved recently.",
  "What are your thoughts on open-source software?",
  "How would you explain recursion to a non-technical person?",
  "What is the most difficult bug you've ever fixed?",
  "How do you prepare for a technical interview?",
  "Why did you decide to become a programmer?"
];

// Listening scenarios by mode
const LISTEN_SCENARIOS = {
  coder: [
    'a developer explaining a bug fix to their team',
    'a tech lead discussing code review feedback',
    'a programmer describing their debugging process',
    'a developer talking about their favorite programming language',
    'a team discussing API design decisions',
    'a developer explaining how they optimized performance',
    'a programmer sharing their experience with a new framework',
    'a tech interview conversation about problem-solving'
  ],
  communication: [
    'a conversation at a coffee shop',
    'someone describing their weekend plans',
    'a phone call arranging to meet a friend',
    'a discussion about hobbies and interests',
    'someone giving directions to a tourist',
    'a conversation about favorite movies or books',
    'friends planning a trip together',
    'someone describing their daily routine'
  ],
  business: [
    'a manager giving feedback in a performance review',
    'a team discussing project deadlines',
    'a client meeting about requirements',
    'a presentation about quarterly results',
    'a negotiation about contract terms',
    'a job interview conversation',
    'colleagues discussing a business proposal',
    'a meeting about budget allocation'
  ],
  ielts: [
    'a student describing their hometown',
    'someone discussing environmental issues',
    'a conversation about education systems',
    'someone explaining the benefits of technology',
    'a discussion about work-life balance',
    'someone describing a memorable event',
    'a conversation about cultural differences',
    'someone discussing health and fitness'
  ],
  finance: [
    'a banker explaining mortgage options',
    'an investor discussing stock market trends',
    'a financial advisor talking about retirement planning',
    'a conversation about company earnings reports',
    'someone explaining how blockchain affects banking',
    'a discussion about inflation and interest rates',
    'a meeting about personal budgeting and saving',
    'an analyst describing cryptocurrency fluctuations'
  ]
};

interface EngLesson { id: number; type: string; content: string; metadata: string; completed: boolean; learnCount: number; createdAt: string; nextReviewAt?: string | null; lastReviewedAt?: string | null; intervalDays?: number; easeFactor?: number; reviewCount?: number; }

const READ_LEVELS = [{ id: 'A2', label: 'A2' }, { id: 'B1', label: 'B1' }, { id: 'B2', label: 'B2' }];
const READ_TOPICS = ['Web Development', 'Career & Jobs', 'Technology', 'Daily Life', 'Science', 'Business'];

const VOCAB_TOPICS = ['programming', 'web development', 'databases', 'networking', 'AI & ML', 'DevOps', 'career & jobs', 'daily life', 'finance', 'investing'];

const TABS = [
  { id: 'listen', l: '🎧 Nghe' },
  { id: 'speak', l: '🎤 Nói' }, { id: 'write', l: '✍️ Viết' },
  { id: 'read', l: '📖 Đọc' },
  { id: 'dict', l: '🔎 Tra từ' },
  { id: 'grammar', l: '📐 Ngữ pháp' },
  { id: 'vocab', l: '📚 Từ vựng' },
  { id: 'guide', l: '📘 Hướng dẫn' },
] as const;

const GRAMMAR_TOPICS = [
  'Present Simple', 'Present Continuous', 'Present Perfect',
  'Past Simple', 'Past Continuous', 'Future Simple',
  'Passive Voice', 'Relative Clauses', 'Conditionals (If)',
  'Reported Speech', 'Gerund & Infinitive', 'Modal Verbs', 'Prepositions',
  'Articles (A, An, The)', 'Comparisons', 'Wish Clauses', 'Used to / Get used to',
  'Causative Form', 'Conjunctions (Although, Despite...)', 'Question Tags',
  'Inversion (Đảo ngữ)', 'Subjunctive Mood', 'Phrasal Verbs Basics'
];

const MODES = [
  { id: 'all', label: '🌐 All', desc: 'all topics' },
  { id: 'coder', label: '💻 Coder', desc: 'developer, tech, programming' },
  { id: 'business', label: '💼 Công việc', desc: 'business meetings, emails, interviews' },
  { id: 'communication', label: '💬 Giao tiếp', desc: 'daily life, travel, work, relationships' },
  { id: 'finance', label: '💰 Tài chính', desc: 'finance, banking, stock market, investment' },
  { id: 'ielts', label: '🎓 IELTS', desc: 'academic IELTS-style topics' },
] as const;

type LearnMode = typeof MODES[number]['id'];

export default function EnglishContent() {
  const [me, setMe] = useState<{ id: number; name: string; role: string } | null>(null);
  const isAdmin = me?.role === 'admin';

  // Global Voice Settings (Synced across all tabs)
  const [globalVoice, setGlobalVoice] = useState('en-US-AvaNeural');
  const [globalTtsProvider, setGlobalTtsProvider] = useState<'edge' | 'luxtts'>('edge');
  const [globalSpeed, setGlobalSpeed] = useState(1.0);
  const [tab, setTab] = useState<'listen' | 'speak' | 'write' | 'vocab' | 'read' | 'dict' | 'grammar' | 'guide'>('listen');
  const [mode, setMode] = useState<LearnMode>('coder');
  const [aiModel, setAiModel] = useState('default');
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const savedMode = localStorage.getItem('eng_mode') as LearnMode;
    if (savedMode) setMode(savedMode);
    const savedModel = localStorage.getItem('eng_model');
    if (savedModel) setAiModel(savedModel);
    
    const savedVoice = localStorage.getItem('eng_voice');
    if (savedVoice) setGlobalVoice(savedVoice);
    const savedProvider = localStorage.getItem('eng_provider');
    if (savedProvider) setGlobalTtsProvider(savedProvider as any);
    const savedSpeed = localStorage.getItem('eng_speed');
    if (savedSpeed) setGlobalSpeed(parseFloat(savedSpeed));

    // Check auth
    fetch('/api/auth').then(r => r.json()).then(d => {
      if (d.user) setMe(d.user);
    }).catch(() => {});
  }, []);

  const [ttsOnline, setTtsOnline] = useState(false);
  useEffect(() => {
    if (isMounted) {
      localStorage.setItem('eng_mode', mode);
      localStorage.setItem('eng_model', aiModel);
      localStorage.setItem('eng_voice', globalVoice);
      localStorage.setItem('eng_provider', globalTtsProvider);
      localStorage.setItem('eng_speed', globalSpeed.toString());
    }
  }, [mode, aiModel, globalVoice, globalTtsProvider, globalSpeed, isMounted]);
  const modeDesc = MODES.find(m => m.id === mode)?.desc || 'developer';

  // Listening
  const [listenLevel, setListenLevel] = useState('A2');
  const [listenCustomTopic, setListenCustomTopic] = useState('');
  const [listenText, setListenText] = useState('');
  const [listenVi, setListenVi] = useState('');
  const [listenVocab, setListenVocab] = useState<{ w: string; m: string }[]>([]);
  const [showListenVi, setShowListenVi] = useState(false);
  const [listenLoading, setListenLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [listenRecordId, setListenRecordId] = useState<number | null>(null);
  const [listenElapsed, setListenElapsed] = useState(0);

  // Speaking
  const [spkLevel, setSpkLevel] = useState('A2');
  const [spkTopic, setSpkTopic] = useState('Tell me about your typical day as a software developer.');
  const [spkCustomTopic, setSpkCustomTopic] = useState('');
  const [spkSampleDirection, setSpkSampleDirection] = useState('');
  const [spkTopicError, setSpkTopicError] = useState('');
  const [recognizing, setRecognizing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [spkFeedback, setSpkFeedback] = useState('');
  const [spkLoading, setSpkLoading] = useState(false);
  const [spkTopicLoading, setSpkTopicLoading] = useState(false);
  const [sttStatus, setSttStatus] = useState('');
  const [spkSample, setSpkSample] = useState('');
  const [spkSampleLoading, setSpkSampleLoading] = useState(false);
  const [spkRecordId, setSpkRecordId] = useState<number | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Writing
  const [writeLevel, setWriteLevel] = useState('A2');
  const [writeText, setWriteText] = useState('');
  const [writePrompt, setWritePrompt] = useState(WRITING_PROMPTS[0]);
  const [writeCustomPrompt, setWriteCustomPrompt] = useState('');
  const [writeSampleDirection, setWriteSampleDirection] = useState('');
  const [writeTopicError, setWriteTopicError] = useState('');
  const [writeFeedback, setWriteFeedback] = useState('');
  const [writeLoading, setWriteLoading] = useState(false);
  const [writeTopicLoading, setWriteTopicLoading] = useState(false);
  const [writeSample, setWriteSample] = useState('');
  const [writeSampleLoading, setWriteSampleLoading] = useState(false);
  const [genElapsed, setGenElapsed] = useState(0);
  const [writeRecordId, setWriteRecordId] = useState<number | null>(null);

  // Vocab
  const [vocabTopic, setVocabTopic] = useState('programming');
  const [cards, setCards] = useState<{ word: string; def: string; ex: string; vi: string }[]>([]);
  const [cardIdx, setCardIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [vocabLoading, setVocabLoading] = useState(false);
  const [known, setKnown] = useState<number[]>([]);

  // Reading
  const [readLevel, setReadLevel] = useState('A2');
  const [readTopic, setReadTopic] = useState('Web Development');
  const [readCustomTopic, setReadCustomTopic] = useState('');
  const [readLoading, setReadLoading] = useState(false);
  const [readArticle, setReadArticle] = useState<{ title: string; body: string; wordCount: number } | null>(null);
  const [readRecordId, setReadRecordId] = useState<number | null>(null);
  const [readQuestions, setReadQuestions] = useState<{ q: string; options: string[]; answer: number }[]>([]);
  const [readAnswers, setReadAnswers] = useState<number[]>([]);
  const [readSubmitted, setReadSubmitted] = useState(false);
  const [readSelected, setReadSelected] = useState('');
  const [readLookup, setReadLookup] = useState('');
  const [readLookupLoading, setReadLookupLoading] = useState(false);
  const [readChat, setReadChat] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [readChatInput, setReadChatInput] = useState('');
  const [readChatLoading, setReadChatLoading] = useState(false);
  const [readError, setReadError] = useState('');
  const [readSpeaking, setReadSpeaking] = useState(false);

  // Grammar
  const [grammarTopic, setGrammarTopic] = useState(GRAMMAR_TOPICS[0]);
  const [grammarCustomTopic, setGrammarCustomTopic] = useState('');
  const [grammarLoading, setGrammarLoading] = useState(false);
  const [grammarLesson, setGrammarLesson] = useState<string | null>(null);
  const [grammarRecordId, setGrammarRecordId] = useState<number | null>(null);
  const [grammarQuizAnswers, setGrammarQuizAnswers] = useState<string[]>([]);
  const [grammarUserAnswers, setGrammarUserAnswers] = useState<string[]>([]);
  const [grammarSubmitted, setGrammarSubmitted] = useState(false);

  async function genGrammarLesson() {
    setGrammarLoading(true); setGrammarLesson(null); setGrammarSubmitted(false); setGrammarUserAnswers([]);
    const p = `Bạn là một giáo viên dạy Tiếng Anh chuyên nghiệp. Hãy soạn một bài giảng NGỮ PHÁP CHI TIẾT về chủ đề: "${grammarTopic}".

Yêu cầu bài giảng (Giải thích bằng Tiếng Việt, ngắn gọn súc tích):
1. **Khái niệm & Cấu trúc**: Định nghĩa và công thức chính.
2. **Cách dùng**: Các trường hợp sử dụng phổ biến nhất.
3. **Ví dụ**: 3 câu ví dụ tiêu biểu (có bản dịch, không cần phiên âm IPA để tăng tốc độ).
4. **Quiz**: 3 câu trắc nghiệm nhanh.

Định dạng Quiz:
Q1: [Câu hỏi]
A) [Lựa chọn] B) [Lựa chọn] C) [Lựa chọn]
ANSWER: [A/B/C]

Hãy trình bày súc tích, tập trung vào trọng tâm.`;
    
    try {
      const result = await genTopicTask('grammar', p, () => {});
      if (result) {
        const { content, id } = result;
        setGrammarLesson(content);
        const ans: string[] = [];
        const ms = content.matchAll(/ANSWER:\s*([ABC])/g);
        for (const m of ms) ans.push(m[1]);
        setGrammarQuizAnswers(ans);
        setGrammarUserAnswers(ans.map(() => ''));
        setGrammarRecordId(id);
        // Update metadata for the record already created by server
        await updateLessonMetadata(id, { topic: grammarTopic, mode });
        loadHistory();
      }
    } catch (e) {
      alert(String(e));
    } finally {
      setGrammarLoading(false);
    }
  }

  // Dict
  const [dictInput, setDictInput] = useState('');
  const [dictResult, setDictResult] = useState('')
  const [dictLoading, setDictLoading] = useState(false);

  // History
  const [history, setHistory] = useState<EngLesson[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    speechSynthesis.getVoices();
    speechSynthesis.addEventListener('voiceschanged', () => { }, { once: true });
    // Lightweight health check — GET instead of POST synthesis
    fetch('/api/tts?text=__health__', { signal: AbortSignal.timeout(4000) })
      .then(r => r.json()).then(d => setTtsOnline(!!d.available)).catch(() => setTtsOnline(false));
    // Check Whisper
    fetch('/api/stt').then(r => r.json()).catch(() => { });
    // Clear stale tasks (older than 5 mins) on mount
    fetch('/api/ai/task', { method: 'DELETE' }).catch(() => { });
  }, []);

  const activeTaskIds = useRef<Set<string>>(new Set());
  const abortTasks = useRef<Record<string, () => void>>({});

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/english');
      const data = await res.json();
      setHistory(data.filter((h: any) => !h.type.endsWith('_pending')));
    } catch { }
    setHistoryLoading(false);
  }, []);

  const getGenMessage = useCallback((elapsed: number, action = 'tạo') => {
    return `⏳ AI đang làm...`;
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Tự động load bài mới nhất khi chuyển Tab
  useEffect(() => {
    if (!history.length || !tab) return;
    
    // Map tab name to database type
    const dbType = tab === 'read' ? 'reading' : tab === 'write' ? 'writing' : tab;
    
    // Tìm bài mới nhất của tab hiện tại và khớp với mode hiện tại
    const latest = [...history]
      .sort((a, b) => b.id - a.id)
      .find(h => {
        if (h.type !== dbType) return false;
        try {
          const m = JSON.parse(h.metadata || '{}');
          return m.mode === mode;
        } catch { return false; }
      }) || [...history].sort((a, b) => b.id - a.id).find(h => h.type === dbType); // Fallback về bài mới nhất cùng type
      
    if (!latest) return;

    if (tab === 'listen') {
      try {
        const m = JSON.parse(latest.metadata || '{}');
        setListenText(latest.content);
        setListenVi(m.vi || '');
        setListenVocab(m.vocab || []);
        setListenRecordId(latest.id);
        setListenLevel(m.level || 'A2');
      } catch {}
    } else if (tab === 'speak') {
      try {
        const m = JSON.parse(latest.metadata || '{}');
        setSpkTopic(m.topic || latest.content);
        setSpkSample(m.sample || '');
        setSpkRecordId(latest.id);
        setSpkLevel(m.level || 'A2');
        setTranscript(''); setSpkFeedback('');
      } catch {}
    } else if (tab === 'write') {
      try {
        const m = JSON.parse(latest.metadata || '{}');
        setWritePrompt(m.prompt || latest.content);
        setWriteSample(m.sample || '');
        setWriteRecordId(latest.id);
        setWriteLevel(m.level || 'A2');
        setWriteFeedback(''); setWriteText('');
      } catch {}
    } else if (tab === 'read') {
      try {
        const m = JSON.parse(latest.metadata || '{}');
        setReadArticle({ title: m.title || 'Bài đọc', body: latest.content, wordCount: m.wordCount || 0 });
        setReadRecordId(latest.id);
        setReadLevel(m.level || 'A2');
        setReadQuestions(m.questions || []);
        setReadAnswers([]); setReadSubmitted(false);
      } catch {}
    } else if (tab === 'grammar') {
      try {
        const m = JSON.parse(latest.metadata || '{}');
        setGrammarLesson(latest.content);
        setGrammarRecordId(latest.id);
        setGrammarTopic(m.topic || 'Ngữ pháp');
        // Parse lại quiz answers
        const ans: string[] = [];
        const ms = latest.content.matchAll(/ANSWER:\s*([ABC])/g);
        for (const m of ms) ans.push(m[1]);
        setGrammarQuizAnswers(ans);
        setGrammarUserAnswers(ans.map(() => ''));
        setGrammarSubmitted(false);
      } catch {}
    } else if (tab === 'vocab') {
      try {
        setCards(JSON.parse(latest.content));
        setCardIdx(0); setFlipped(false);
      } catch {}
    }
  }, [tab, mode, history.length]); // Chạy khi tab đổi, mode đổi hoặc history có thêm bài mới

  const markLessonLearned = useCallback(async (lessonId: number, quizScore?: number, quizTotal?: number) => {
    const body: any = { id: lessonId, completed: true, incrementLearnCount: true };
    if (typeof quizScore === 'number' && typeof quizTotal === 'number' && quizTotal > 0) {
      body.quizScore = quizScore;
      body.quizTotal = quizTotal;
    }
    await fetch('/api/english', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    // Nhật ký trang chủ
    const item = history.find(h => h.id === lessonId);
    if (item) {
      let topic = '';
      if (item.type === 'reading') {
        try { topic = '📖 Đọc: ' + (JSON.parse(item.metadata || '{}').title || 'Bài đọc'); } catch { topic = '📖 Bài đọc'; }
      } else if (item.type === 'listen') {
        try {
          const m = JSON.parse(item.metadata || '{}');
          topic = '🎧 Nghe: ' + (m.title || item.content.slice(0, 30) + '...');
        } catch { topic = '🎧 Nghe: ' + item.content.slice(0, 30) + '...'; }
      } else if (item.type === 'speak') {
        try {
          const m = JSON.parse(item.metadata || '{}');
          topic = '🗣️ Nói: ' + (m.topic || item.content.slice(0, 30) + '...');
        } catch { topic = '🗣️ Nói: ' + item.content.slice(0, 30) + '...'; }
      } else if (item.type === 'writing') {
        try { topic = '✍️ Viết: ' + (JSON.parse(item.metadata || '{}').topic || 'Bài viết'); } catch { topic = '✍️ Bài viết'; }
      } else if (item.type === 'vocab') {
        topic = '🗂️ Từ vựng: ' + item.content.slice(0, 30) + '...';
      } else {
        topic = '📚 Học ' + item.type;
      }
      const today = new Date().toLocaleDateString('en-CA');
      fetch('/api/logs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today, addTopic: topic })
      });
    }

    loadHistory();
  }, [history, loadHistory]);

  const stopTask = useCallback(async (type: string, taskId?: string) => {
    // Clear interval/loop if exists
    if (abortTasks.current[type]) {
      abortTasks.current[type]();
      delete abortTasks.current[type];
    }
    // Delete from DB if taskId provided
    if (taskId) {
      await fetch(`/api/ai/task?taskId=${taskId}&type=${encodeURIComponent(type)}`, { method: 'DELETE' }).catch(() => { });
    }
    // Reset specific loading state
    if (type === 'listen') setListenLoading(false);
    if (type === 'speak') setSpkTopicLoading(false);
    if (type === 'speak_feedback') setSpkLoading(false);
    if (type === 'writing') setWriteTopicLoading(false);
    if (type === 'writing_check') setWriteLoading(false);
    if (type === 'vocab') setVocabLoading(false);
    if (type === 'reading') setReadLoading(false);
    if (type === 'dict') setDictLoading(false);
    if (type === 'speak_sample') setSpkSampleLoading(false);
    if (type === 'writing_sample') setWriteSampleLoading(false);
  }, []);


  // LISTEN
  async function genListenText() {
    if (mode === 'all') {
      alert('Vui lòng chọn mode cụ thể (Coder, Giao tiếp, Công việc, IELTS) để tạo bài mới');
      return;
    }
    setListenLoading(true); setListenVi(''); setListenVocab([]); setShowListenVi(false);

    // Lấy TẤT CẢ bài cùng mode để tránh trùng
    const existingListens = history
      .filter(h => {
        if (h.type !== 'listen') return false;
        try {
          const itemMode = JSON.parse(h.metadata || '{}').mode || 'coder';
          return itemMode === mode;
        } catch {
          return false;
        }
      })
      .map(h => {
        try {
          return JSON.parse(h.metadata || '{}').title || h.content.slice(0, 40);
        } catch {
          return h.content.slice(0, 40);
        }
      });

    // Nếu có custom topic, dùng nó; nếu không thì chọn scenario ngẫu nhiên
    let scenario = '';
    if (listenCustomTopic.trim()) {
      scenario = listenCustomTopic.trim();
    } else {
      const scenarios = LISTEN_SCENARIOS[mode as keyof typeof LISTEN_SCENARIOS] || LISTEN_SCENARIOS.coder;
      scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
    }

    const avoidList = existingListens.length > 0
      ? `\nAvoid these existing topics: ${existingListens.join('; ')}`
      : '';

    const p = `Generate a unique English listening exercise (4-6 sentences) for a ${listenLevel} learner.

Scenario: ${scenario}
Context: ${modeDesc}${avoidList}

Requirements:
- Natural conversational English
- Include 3-4 useful vocabulary words
- Different situation from existing exercises
- Realistic dialogue or monologue

Return JSON format ONLY:
{
  "title": "A short descriptive title (different from existing ones)",
  "en": "English text...",
  "vi": "Bản dịch tiếng Việt...",
  "vocab": [{"w": "từ/cụm từ", "m": "nghĩa & cách dùng"}]
}`;
    const raw = await askAI(p, aiModel);
    if (raw) {
      try {
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) {
          const d = JSON.parse(m[0]);
          setListenText(d.en || '');
          setListenVi(d.vi || '');
          setListenVocab(d.vocab || []);
          const d2 = await saveToDb('listen', d.en, { title: d.title, vi: d.vi, vocab: d.vocab, topic: scenario, level: listenLevel }, mode);
          if (d2?.id) {
            setListenRecordId(d2.id);
            loadHistory();
          }
        } else {
          setListenText(raw);
        }
      } catch {
        setListenText(raw);
      }
    }
    setListenCustomTopic(''); // Clear custom topic sau khi dùng
    setListenLoading(false); loadHistory();
  }

  async function playText(text = listenText) {
    if (!text || playing) return;
    setPlaying(true);
    await speak(text, globalSpeed, globalVoice, globalTtsProvider);
    setPlaying(false);
  }

  // SPEAK
  async function genSpkTopic() {
    if (mode === 'all') {
      alert('Vui lòng chọn mode cụ thể (Coder, Giao tiếp, Công việc, IELTS) để tạo bài mới');
      return;
    }
    setSpkTopicLoading(true); setSpkTopicError('');

    // Nếu có custom topic, dùng nó để tạo câu hỏi tiếng Anh
    if (spkCustomTopic.trim()) {
      const p = `Translate this Vietnamese topic into a natural English speaking question for ${spkLevel} level learner: "${spkCustomTopic.trim()}"

Reply with the English question ONLY, no explanation.`;
      const t = await askAI(p, aiModel);
      if (t) {
        const clean = cleanTopic(t);
        setSpkTopic(clean);
        setTranscript(''); setSpkFeedback(''); setSpkSample('');
        setSpkCustomTopic(''); // Clear sau khi dùng
        // Lưu chủ đề mới
        fetch('/api/english', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'speak', content: '', metadata: { topic: clean, mode, level: spkLevel } }),
        }).then(r => r.json()).then(d => { setSpkRecordId(d.id); loadHistory(); }).catch(() => setSpkRecordId(null));
      }
      setSpkTopicLoading(false);
      return;
    }

    // Lấy TẤT CẢ chủ đề speaking cùng mode
    const existingTopics = history
      .filter(h => {
        if (h.type !== 'speak') return false;
        try {
          const itemMode = JSON.parse(h.metadata || '{}').mode || 'coder';
          return itemMode === mode;
        } catch {
          return false;
        }
      })
      .map(h => {
        try {
          return JSON.parse(h.metadata || '{}').topic || h.content.slice(0, 50);
        } catch {
          return h.content.slice(0, 50);
        }
      });

    const avoidList = existingTopics.length > 0
      ? `\n\nAvoid these existing topics:\n${existingTopics.join('\n')}`
      : '';

    const p = `Give ONE short English speaking question for ${spkLevel} level learner: ${modeDesc}.${avoidList}

Reply with the question ONLY, no explanation.`;
    const t = await askAI(p, aiModel);
    if (t) {
      const clean = cleanTopic(t);
      setSpkTopic(clean);
      setTranscript(''); setSpkFeedback(''); setSpkSample('');
      // Lưu chủ đề mới (Chỉ 1 bản ghi)
      fetch('/api/english', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'speak', content: '', metadata: { topic: clean, mode, level: spkLevel } }),
      }).then(r => r.json()).then(d => { setSpkRecordId(d.id); loadHistory(); }).catch(() => setSpkRecordId(null));
    }
    setSpkTopicLoading(false);
  }

  async function genSpkSample() {
    setSpkSampleLoading(true);
    const directionText = spkSampleDirection.trim()
      ? `\n\nĐịnh hướng trả lời: ${spkSampleDirection.trim()}`
      : '';
    const raw = await askAI(`Answer this English question at ${spkLevel} level in 3-4 natural sentences: "${spkTopic}"${directionText}

**English:** (3-4 sentences)
**Tiếng Việt:** (bản dịch ngắn)
**Từ hay:** word1 – nghĩa, word2 – nghĩa`, aiModel);
    setSpkSample(raw || '');
    if (spkRecordId) {
      fetch('/api/english', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: spkRecordId, metadata: { topic: spkTopic, sample: raw || '', mode, level: spkLevel } }),
      }).catch(() => { });
    }
    setSpkSampleLoading(false);
  }

  async function genWriteSample() {
    setWriteSampleLoading(true);
    const directionText = writeSampleDirection.trim()
      ? `\n\nĐịnh hướng viết: ${writeSampleDirection.trim()}`
      : '';
    const raw = await askAI(`Write a concise sample response at ${writeLevel} level (80-120 words) for: "${writePrompt}"${directionText}

**English:** (1-2 clear paragraphs)
**Tiếng Việt:** (bản dịch ngắn)
**Từ hay:** word1 – nghĩa, word2 – nghĩa`, aiModel);
    setWriteSample(raw || '');
    if (writeRecordId) {
      fetch('/api/english', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: writeRecordId, metadata: { prompt: writePrompt, sample: raw || '', mode, level: writeLevel } }),
      }).catch(() => { });
    }
    setWriteSampleLoading(false);
  }

  async function startRec() {
    setRecognizing(true); setSttStatus('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          sampleRate: { ideal: 44100 },
          channelCount: { ideal: 1 }
        } 
      });
      chunksRef.current = [];
      const mimeType = ['audio/webm', 'audio/mp4', 'audio/ogg', ''].find(m => !m || MediaRecorder.isTypeSupported(m)) || '';
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setSttStatus('⏳ Whisper đang nhận dạng...');
        const blob = new Blob(chunksRef.current, { type: mr.mimeType });

        let ext = 'webm';
        if (mr.mimeType.includes('mp4')) ext = 'mp4';
        else if (mr.mimeType.includes('ogg')) ext = 'ogg';
        else if (mr.mimeType.includes('wav')) ext = 'wav';

        const form = new FormData();
        form.append('audio', blob, `audio.${ext}`);
        form.append('language', 'en'); 
        form.append('prompt', 'English conversation practice, focus on English grammar and vocabulary.');
        const res = await fetch('/api/stt', { method: 'POST', body: form });
        const data = await res.json();
        if (data.text) { setTranscript(data.text); setSttStatus(''); }
        else { setSttStatus('❌ Lỗi nhận dạng — thử lại'); }
        setRecognizing(false);
      };
      mr.start();
      mediaRecRef.current = mr;
    } catch { setSttStatus('❌ Không truy cập được mic'); setRecognizing(false); }
  }

  function stopRec() {
    mediaRecRef.current?.stop();
  }
  async function getFeedback() {
    if (!transcript) return;
    setSpkLoading(true);
    const p = `Bạn là giáo viên tiếng Anh chuyên nghiệp. Hãy chấm điểm bài nói sau trên thang điểm 100 và nhận xét chi tiết cho học viên trình độ ${spkLevel}.
    Chủ đề: "${spkTopic}"
    Bài nói của học viên: "${transcript}"

    Hãy trình bày theo định dạng Markdown sau:
    # Điểm số: [Số điểm]/100
    ---
    ## Nhận xét chi tiết
    ### 1. Ngữ pháp & Phát âm:
    (Nhận xét lỗi cụ thể)
    ### 2. Từ vựng & Độ tự nhiên:
    (Nhận xét về từ ngữ)
    ---
    ## Gợi ý nói lại (English)
    **"Câu tiếng Anh hoàn chỉnh và tự nhiên hơn"**
    ---
    ## Dịch sang tiếng Việt
    > Bản dịch của câu gợi ý.`;
    const fb = await askAI(p);
    if (fb) {
      setSpkFeedback(fb);
      if (spkRecordId) {
        await fetch('/api/english', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: spkRecordId, content: transcript, metadata: { topic: spkTopic, feedback: fb, sample: spkSample, mode, level: spkLevel } }),
        });
      } else {
        const d2 = await saveToDb('speak', transcript, { topic: spkTopic, feedback: fb, sample: spkSample, level: spkLevel }, mode);
        if (d2?.id) setSpkRecordId(d2.id);
      }
    }
    setSpkLoading(false); loadHistory();
  }

  // WRITE
  async function genWriteTopic() {
    if (mode === 'all') {
      alert('Vui lòng chọn mode cụ thể (Coder, Giao tiếp, Công việc, IELTS) để tạo bài mới');
      return;
    }
    setWriteTopicLoading(true); setWriteTopicError('');

    // Nếu có custom prompt, dùng nó để tạo đề viết tiếng Anh
    if (writeCustomPrompt.trim()) {
      const p = `Translate this Vietnamese writing topic into a natural English writing prompt for ${writeLevel} level learner: "${writeCustomPrompt.trim()}"

Reply with the English prompt ONLY, no explanation.`;
      const t = await askAI(p, aiModel);
      if (t) {
        const clean = cleanTopic(t);
        setWritePrompt(clean);
        setWriteText(''); setWriteFeedback(''); setWriteSample('');
        setWriteCustomPrompt(''); // Clear sau khi dùng
        // Lưu chủ đề mới
        fetch('/api/english', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'writing', content: '', metadata: { prompt: clean, mode, level: writeLevel } }),
        }).then(r => r.json()).then(d => { setWriteRecordId(d.id); loadHistory(); }).catch(() => setWriteRecordId(null));
      }
      setWriteTopicLoading(false);
      return;
    }

    // Lấy TẤT CẢ đề viết cùng mode
    const existingPrompts = history
      .filter(h => {
        if (h.type !== 'writing') return false;
        try {
          const itemMode = JSON.parse(h.metadata || '{}').mode || 'coder';
          return itemMode === mode;
        } catch {
          return false;
        }
      })
      .map(h => {
        try {
          return JSON.parse(h.metadata || '{}').prompt || h.content.slice(0, 50);
        } catch {
          return h.content.slice(0, 50);
        }
      });

    const avoidList = existingPrompts.length > 0
      ? `\n\nAvoid these existing prompts:\n${existingPrompts.join('\n')}`
      : '';

    const p = `Give ONE English writing prompt for ${writeLevel} level learner: ${modeDesc}.${avoidList}

Reply with the prompt ONLY.`;
    const t = await askAI(p, aiModel);
    if (t) {
      const clean = cleanTopic(t);
      setWritePrompt(clean);
      setWriteText(''); setWriteFeedback(''); setWriteSample('');
      // Lưu chủ đề mới (Chỉ 1 bản ghi)
      fetch('/api/english', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'writing', content: '', metadata: { prompt: clean, mode, level: writeLevel } }),
      }).then(r => r.json()).then(d => { setWriteRecordId(d.id); loadHistory(); }).catch(() => setWriteRecordId(null));
    }
    setWriteTopicLoading(false);
  }

  async function checkWriting() {
    if (!writeText.trim()) return;
    setWriteLoading(true);
    const p = `Check this English writing for a ${writeLevel} level learner. Topic: "${writePrompt}". Text: "${writeText}"

Reply in Markdown (concise):
**Lỗi chính:** (tối đa 4 bullets về grammar/vocab)
**Viết lại đẹp hơn (English):** (1-2 câu tự nhiên hơn)
**Dịch:** (bản dịch tiếng Việt của phần viết lại)`;
    const fb = await askAI(p);
    if (fb) {
      setWriteFeedback(fb);
      if (writeRecordId) {
        await fetch('/api/english', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: writeRecordId, content: writeText, metadata: { prompt: writePrompt, feedback: fb, sample: writeSample, words: writeText.split(/\s+/).filter(Boolean).length, mode, level: writeLevel } }),
        });
      } else {
        const d2 = await saveToDb('writing', writeText, { prompt: writePrompt, feedback: fb, sample: writeSample, words: writeText.split(/\s+/).filter(Boolean).length, level: writeLevel }, mode);
        if (d2?.id) setWriteRecordId(d2.id);
      }
    }
    setWriteLoading(false); loadHistory();
  }

  // VOCAB
  async function loadVocab() {
    if (mode === 'all') {
      alert('Vui lòng chọn mode cụ thể (Coder, Giao tiếp, Công việc, IELTS) để tạo bài mới');
      return;
    }
    setVocabLoading(true); setCards([]); setCardIdx(0); setFlipped(false); setKnown([]);

    // Lấy TẤT CẢ từ vựng cùng mode và topic
    const existingWords = history
      .filter(h => {
        if (h.type !== 'vocab') return false;
        try {
          const meta = JSON.parse(h.metadata || '{}');
          const itemMode = meta.mode || 'coder';
          const itemTopic = meta.topic || '';
          return itemMode === mode && itemTopic === vocabTopic;
        } catch {
          return false;
        }
      })
      .map(h => h.content);

    const avoidList = existingWords.length > 0
      ? `\n\nAvoid these existing words:\n${existingWords.join(', ')}`
      : '';

    const p = `Give 10 unique, varied and useful English vocabulary words for a Vietnamese learner. Context: ${modeDesc}. Topic: ${vocabTopic}. Avoid common words like 'variable' or 'function' unless the topic specifically requires them.${avoidList}

Return JSON array ONLY: [{"word":"...","ipa":"IPA pronunciation","def":"short English definition","ex":"Example sentence","vi":"Vietnamese meaning"}]`;
    const raw = await askAI(p, aiModel);
    if (raw) {
      const m = raw.match(/\[[\s\S]*\]/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        setCards(parsed);
        // Lưu từng từ riêng biệt thay vì lưu cả nhóm
        for (const item of parsed) {
          await saveToDb('vocab', item.word, {
            ipa: item.ipa || '',
            def: item.def,
            ex: item.ex,
            vi: item.vi,
            topic: vocabTopic
          }, mode);
        }
      }
    }
    setVocabLoading(false); loadHistory();
  }

  const wordCount = writeText.split(/\s+/).filter(Boolean).length;
  async function generateReading() {
    if (mode === 'all') {
      alert('Vui lòng chọn mode cụ thể (Coder, Giao tiếp, Công việc, IELTS) để tạo bài mới');
      return;
    }
    setReadLoading(true); setReadError('');
    setReadArticle(null); setReadQuestions([]); setReadAnswers([]); setReadSubmitted(false);
    setReadSelected(''); setReadLookup(''); setReadChat([]);

    // Nếu có custom topic, dùng nó
    let topicToUse = readTopic;
    if (readCustomTopic.trim()) {
      topicToUse = readCustomTopic.trim();
      setReadTopic(topicToUse);
      setReadCustomTopic(''); // Clear sau khi dùng
    }

    // Lấy TẤT CẢ bài đọc cùng mode, level, topic
    const existingArticles = history
      .filter(h => {
        if (h.type !== 'reading') return false;
        try {
          const meta = JSON.parse(h.metadata || '{}');
          const itemMode = meta.mode || 'coder';
          const itemLevel = meta.level || 'A2';
          const itemTopic = meta.topic || '';
          return itemMode === mode && itemLevel === readLevel && itemTopic === topicToUse;
        } catch {
          return false;
        }
      })
      .map(h => {
        try {
          return JSON.parse(h.metadata || '{}').title || h.content.slice(0, 50);
        } catch {
          return h.content.slice(0, 50);
        }
      });

    const avoidList = existingArticles.length > 0
      ? `\n\nAvoid these existing articles:\n${existingArticles.join('\n')}`
      : '';

    const p = `You are an English reading teacher. Create a reading passage for a Vietnamese learner. Context: ${modeDesc}.
Level: ${readLevel}
Topic: ${topicToUse}${avoidList}

Return JSON ONLY (no markdown code blocks, just raw json):
{"title":"...","body":"4-6 paragraphs separated by \\n\\n, ${readLevel === 'A2' ? '80-120' : readLevel === 'B1' ? '150-200' : '200-280'} words","questions":[{"q":"...","options":["A","B","C","D"],"answer":0},{"q":"...","options":["A","B","C","D"],"answer":2},{"q":"...","options":["A","B","C","D"],"answer":1},{"q":"...","options":["A","B","C","D"],"answer":3}]}`;

    const raw = await askAI(p, aiModel);
    if (raw) {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        if (parsed.title && parsed.body) {
          setReadArticle({ title: parsed.title, body: parsed.body, wordCount: parsed.body.split(/\s+/).length });
          setReadQuestions(parsed.questions || []);
          setReadAnswers((parsed.questions || []).map(() => -1));
          const saved = await saveToDb('reading', parsed.body, { title: parsed.title, level: readLevel, topic: topicToUse, questions: parsed.questions }, mode);
          if (saved) setReadRecordId(saved.id);
        }
      }
    }
    setReadLoading(false); loadHistory();
  }

  async function readLookupFn() {
    if (!readSelected.trim() || readLookupLoading) return;
    setReadLookupLoading(true); setReadLookup('');
    try {
      const isShort = readSelected.trim().split(/\s+/).length <= 3;
      const res = await askAI(isShort
        ? `Giải thích từ/cụm "${readSelected}" trong ngữ cảnh bài đọc về "${readTopic}". Tiếng Việt: nghĩa, phiên âm, ví dụ. Dưới 60 từ.`
        : `Dịch và giải thích câu này sang tiếng Việt: "${readSelected}". Ngắn gọn.`, aiModel);
      setReadLookup(res || 'Lỗi: AI không phản hồi');
    } catch (e) {
      setReadLookup('Lỗi: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setReadLookupLoading(false);
    }
  }

  async function sendReadChat() {
    if (!readChatInput.trim() || readChatLoading || !readArticle) return;
    const q = readChatInput.trim();
    setReadChat(l => [...l, { role: 'user', text: q }]); setReadChatInput(''); setReadChatLoading(true);
    const res = await askAI(`Bài đọc: "${readArticle.title}"\n\n${readArticle.body}\n\nHọc viên hỏi: ${q}\nTrả lời tiếng Việt, ngắn gọn.`);
    setReadChat(l => [...l, { role: 'ai', text: res }]); setReadChatLoading(false);
  }

  const readScore = readSubmitted ? readAnswers.filter((a, i) => a === readQuestions[i]?.answer).length : 0;

  // DICT
  async function lookupWord() {
    const w = dictInput.trim();
    if (!w || dictLoading) return;
    setDictLoading(true); setDictResult('');
    const isPhrase = w.split(/\s+/).length > 3;
    const p = isPhrase
      ? `Giải thích cụm từ/câu tiếng Anh: "${w}". Trả lời Markdown:\n# ${w}\n## Nghĩa tiếng Việt\n## Ví dụ`
      : `Tra từ tiếng Anh: "${w}". Trả lời Markdown:\n# ${w}\n## Phiên âm IPA\n## Loại từ\n## Nghĩa tiếng Việt\n## Ví dụ`;
    const raw = await askAI(p);
    if (raw) {
      setDictResult(raw);
      await saveToDb('dict', raw, { word: w }, mode);
    }
    setDictLoading(false); loadHistory();
  }

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '20px', fontWeight: 900, marginBottom: '4px' }}>🇬🇧 Luyện Tiếng Anh</h1>
        </div>
        <div suppressHydrationWarning className="pill" style={{ borderColor: ttsOnline ? 'var(--green)' : 'var(--orange)', color: ttsOnline ? 'var(--green)' : 'var(--orange)', background: ttsOnline ? '#3fb95011' : '#d2992211' }}>
          {ttsOnline ? '☁️ AI Cloud' : '🔇 Browser TTS'}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {TABS.map(t => (
          <button 
            key={t.id} 
            onClick={() => { setTab(t.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }} 
            style={{ 
              padding: '8px 14px', 
              borderRadius: 99, 
              border: '1px solid', 
              whiteSpace: 'nowrap', 
              fontSize: '12.5px', 
              fontWeight: 600, 
              cursor: 'pointer', 
              transition: 'all 0.15s', 
              borderColor: tab === t.id ? 'var(--accent)' : 'var(--border)', 
              background: tab === t.id ? 'var(--accent)' : 'var(--surface2)', 
              color: tab === t.id ? '#000' : 'var(--muted)',
              boxShadow: tab === t.id ? '0 4px 12px rgba(88,166,255,0.2)' : 'none'
            }}
          >
            {t.l}
          </button>
        ))}
      </div>


      {/* Mode selector */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
        <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>Chế độ luyện tập:</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {MODES.map(m => {
            const mapType = tab === 'write' ? 'writing' : tab === 'read' ? 'reading' : tab;
            const count = m.id === 'all'
              ? history.filter(h => h.type === mapType).length
              : history.filter(h => {
                  if (h.type !== mapType) return false;
                  try {
                    const itemMode = JSON.parse(h.metadata || '{}').mode || 'coder';
                    return itemMode === m.id;
                  } catch {
                    return false;
                  }
                }).length;

            return (
              <button key={m.id} onClick={() => setMode(m.id)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderColor: mode === m.id ? 'var(--green)' : 'var(--border)', background: mode === m.id ? 'var(--green)11' : 'var(--surface2)', color: mode === m.id ? 'var(--green)' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s' }}>
                {m.label}
                {count > 0 && <span style={{ fontSize: 10, background: mode === m.id ? 'var(--green)' : 'var(--surface2)', color: mode === m.id ? '#000' : 'var(--muted)', padding: '1px 5px', borderRadius: 99, fontWeight: 800 }}>{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="desktop-main-side">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, minWidth: 0 }}>
          {/* ── LISTEN ── */}
          {tab === 'listen' && (
            <div className="desktop-2col">
              <div>
                <div className="card" style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div className="section-title" style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>🎧 Bài Nghe</div>
                      {(() => {
                        const item = history.find(h => h.type === 'listen' && h.content === listenText);
                        if (item && (item.learnCount ?? 0) > 0) {
                          return (
                            <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 8, background: '#3fb95022', color: '#3fb950', fontSize: 10, fontWeight: 700, border: '1px solid #3fb95044' }}>
                              ✓ Đã học {item.learnCount} lần
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                    {history.find(h => h.type === 'listen' && h.content === listenText) && (
                      <button
                        onClick={() => {
                          const item = history.find(h => h.type === 'listen' && h.content === listenText);
                          if (item) markLessonLearned(item.id);
                        }}
                        style={{ padding: '6px 12px', borderRadius: 8, background: '#3fb950', color: '#000', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(63,185,80,0.2)' }}
                      >
                        ✓ Đánh dấu đã học
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                    {READ_LEVELS.map(l => (
                      <button key={l.id} onClick={() => setListenLevel(l.id)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderColor: listenLevel === l.id ? 'var(--accent)' : 'var(--border)', background: listenLevel === l.id ? '#58a6ff22' : 'transparent', color: listenLevel === l.id ? 'var(--accent)' : 'var(--muted)' }}>{l.label}</button>
                    ))}
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>✏️ Hoặc tự nhập chủ đề (tiếng Việt):</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        className="input"
                        value={listenCustomTopic}
                        onChange={e => setListenCustomTopic(e.target.value)}
                        placeholder="Ví dụ: Cuộc trò chuyện tại quán cà phê..."
                        style={{ flex: 1, fontSize: 16 }}
                      />
                      <button
                        onClick={genListenText}
                        disabled={!listenCustomTopic.trim() || listenLoading}
                        style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: listenCustomTopic.trim() && !listenLoading ? 'var(--green)' : 'var(--surface2)', color: listenCustomTopic.trim() && !listenLoading ? '#000' : 'var(--muted)', fontSize: 12, fontWeight: 700, cursor: listenCustomTopic.trim() && !listenLoading ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}
                      >
                        {listenLoading ? '⏳...' : '🤖 Tạo'}
                      </button>
                    </div>
                  </div>
                  <textarea className="input" value={listenText} onChange={e => setListenText(e.target.value)} rows={6}
                    placeholder="Bấm 'AI tạo đoạn nghe' hoặc tự nhập tiếng Anh..." style={{ marginBottom: 12 }} />
                  
                  {/* Voice selector (Back to Listen Tab) */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                    {[
                      { id: 'en-US-AvaNeural', l: '☁️ Nữ (Ava)', s: 'edge' },
                      { id: 'en-US-AndrewNeural', l: '☁️ Nam (Andrew)', s: 'edge' },
                      { id: 'en-US-BrianNeural', l: '☁️ Nam (Brian)', s: 'edge' },
                      ...(isAdmin ? [
                        { id: 'en_female', l: '💎 Nữ (Carissa)', s: 'luxtts' },
                        { id: 'en_male', l: '💎 Nam (Dave)', s: 'luxtts' },
                        { id: 'paul', l: '💎 Nam (Paul)', s: 'luxtts' }
                      ] : [])
                    ].map(v => (
                      <button 
                        key={v.id} 
                        onClick={() => {
                          setGlobalVoice(v.id);
                          setGlobalTtsProvider(v.s as any);
                        }} 
                        style={{ flex: '1 1 30%', padding: '7px', borderRadius: 8, border: '1px solid', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderColor: globalVoice === v.id ? 'var(--accent)' : 'var(--border)', background: globalVoice === v.id ? '#58a6ff22' : 'var(--surface2)', color: globalVoice === v.id ? 'var(--accent)' : 'var(--muted)', whiteSpace: 'nowrap' }}
                      >
                        {v.l}
                      </button>
                    ))}
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                      <span style={{ color: 'var(--muted)' }}>Tốc độ phát</span>
                      <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{globalSpeed}x</span>
                    </div>
                    <input type="range" min={0.5} max={1.5} step={0.05} value={globalSpeed}
                      onChange={e => setGlobalSpeed(parseFloat(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost" style={{ flex: 1 }} onClick={genListenText} disabled={listenLoading}>
                      {listenLoading ? '⏳ Đang tạo...' : '🤖 Tạo đoạn nghe mới'}
                    </button>
                    <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => playText()} disabled={!listenText || playing}>
                      {playing ? '🔊 Đang phát...' : '▶ Phát'}
                    </button>
                  </div>
                </div>
              </div>

              <div>
                {listenText && (
                  <div className="card">
                    <div className="section-title">Phát từng câu</div>
                    {listenText.split(/(?<=[.!?])\s+/).filter(Boolean).map((s, i) => (
                      <button key={i} onClick={() => playText(s)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, cursor: 'pointer', marginBottom: 6, lineHeight: 1.5, transition: 'border-color 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                        <span style={{ color: 'var(--muted)', marginRight: 8 }}>{i + 1}.</span>{s}
                      </button>
                    ))}

                    {listenVi && (
                      <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                        <button onClick={() => setShowListenVi(!showListenVi)} style={{ background: 'none', border: 'none', color: 'var(--orange)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          {showListenVi ? '🔽 Ẩn bản dịch' : '▶ Hiện bản dịch tiếng Việt'}
                        </button>
                        {showListenVi && (
                          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, padding: '8px 12px', background: 'rgba(210, 153, 34, 0.05)', borderRadius: 8, fontStyle: 'italic' }}>
                            {listenVi}
                          </div>
                        )}
                      </div>
                    )}

                    {listenVocab && listenVocab.length > 0 && (
                      <div style={{ marginTop: 16 }}>
                        <div className="section-title" style={{ fontSize: 12, color: 'var(--green)', marginBottom: 8 }}>📚 Từ vựng cần lưu ý</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          {listenVocab.map((v, i) => (
                            <div key={i} style={{ padding: '8px 10px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)' }}>{v.w}</div>
                              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{v.m}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── SPEAK ── */}
          {tab === 'speak' && (
            <SpeakTab
              spkTopicLoading={spkTopicLoading} spkTopic={spkTopic} spkLoading={spkLoading} spkRecordId={spkRecordId}
              spkLevel={spkLevel} setSpkLevel={setSpkLevel}
              spkCustomTopic={spkCustomTopic} setSpkCustomTopic={setSpkCustomTopic}
              spkSampleDirection={spkSampleDirection} setSpkSampleDirection={setSpkSampleDirection}
              spkSample={spkSample} setSpkSample={setSpkSample} spkSampleLoading={spkSampleLoading}
              spkTopicError={spkTopicError} spkFeedback={spkFeedback}
              transcript={transcript} recognizing={recognizing} sttStatus={sttStatus}
              genSpkTopic={genSpkTopic} genSpkSample={genSpkSample} getFeedback={getFeedback}
              startRec={startRec} stopRec={stopRec}
              markLessonLearned={markLessonLearned} stopTask={stopTask}
              getGenMessage={getGenMessage} genElapsed={genElapsed}
              speak={speak} globalSpeed={globalSpeed} globalVoice={globalVoice} globalTtsProvider={globalTtsProvider}
              parseMarkdown={parseMarkdown} history={history}
            />
          )}
          {/* ── WRITE ── */}
          {tab === 'write' && (
            <WriteTab
              writeTopicLoading={writeTopicLoading} writePrompt={writePrompt} writeRecordId={writeRecordId}
              writeLoading={writeLoading} writeTopicError={writeTopicError}
              writeLevel={writeLevel} setWriteLevel={setWriteLevel}
              writeCustomPrompt={writeCustomPrompt} setWriteCustomPrompt={setWriteCustomPrompt}
              writeSampleDirection={writeSampleDirection} setWriteSampleDirection={setWriteSampleDirection}
              writeSample={writeSample} setWriteSample={setWriteSample} writeSampleLoading={writeSampleLoading}
              writeText={writeText} setWriteText={setWriteText} wordCount={wordCount}
              writeFeedback={writeFeedback} setWriteFeedback={setWriteFeedback}
              genWriteTopic={genWriteTopic} genWriteSample={genWriteSample} checkWriting={checkWriting}
              markLessonLearned={markLessonLearned} stopTask={stopTask}
              getGenMessage={getGenMessage} genElapsed={genElapsed}
              speak={speak} globalSpeed={globalSpeed} globalVoice={globalVoice} globalTtsProvider={globalTtsProvider}
              parseMarkdown={parseMarkdown} history={history}
            />
          )}
          {/* ── VOCAB ── */}
          {tab === 'vocab' && (
            <VocabTab
              cards={cards} setCards={setCards}
              cardIdx={cardIdx} setCardIdx={setCardIdx}
              flipped={flipped} setFlipped={setFlipped}
              known={known}
              vocabLoading={vocabLoading} loadVocab={loadVocab}
              history={history} mode={mode}
              speak={speak} globalSpeed={globalSpeed} globalVoice={globalVoice} globalTtsProvider={globalTtsProvider}
              markLessonLearned={markLessonLearned}
            />
          )}
          {/* ── READING ── */}
          {tab === 'read' && (
            <ReadTab
              readLevel={readLevel} setReadLevel={setReadLevel}
              readCustomTopic={readCustomTopic} setReadCustomTopic={setReadCustomTopic}
              readLoading={readLoading} readError={readError}
              readArticle={readArticle} readRecordId={readRecordId}
              readSelected={readSelected} setReadSelected={setReadSelected}
              readLookup={readLookup} readLookupLoading={readLookupLoading}
              readQuestions={readQuestions}
              readAnswers={readAnswers} setReadAnswers={setReadAnswers}
              readSubmitted={readSubmitted} setReadSubmitted={setReadSubmitted}
              readScore={readScore}
              readChat={readChat} readChatInput={readChatInput} setReadChatInput={setReadChatInput}
              readChatLoading={readChatLoading}
              readSpeaking={readSpeaking} setReadSpeaking={setReadSpeaking}
              generateReading={generateReading} readLookupFn={readLookupFn} sendReadChat={sendReadChat}
              markLessonLearned={markLessonLearned}
              speak={speak} globalSpeed={globalSpeed} globalVoice={globalVoice} globalTtsProvider={globalTtsProvider}
              parseMarkdown={parseMarkdown} history={history}
            />
          )}
          {tab === 'grammar' && (
            <GrammarTab
              grammarTopics={GRAMMAR_TOPICS}
              grammarTopic={grammarTopic} setGrammarTopic={setGrammarTopic}
              grammarCustomTopic={grammarCustomTopic} setGrammarCustomTopic={setGrammarCustomTopic}
              grammarLoading={grammarLoading}
              grammarLesson={grammarLesson}
              grammarRecordId={grammarRecordId}
              grammarQuizAnswers={grammarQuizAnswers}
              grammarUserAnswers={grammarUserAnswers} setGrammarUserAnswers={setGrammarUserAnswers}
              grammarSubmitted={grammarSubmitted} setGrammarSubmitted={setGrammarSubmitted}
              genGrammarLesson={genGrammarLesson}
              markLessonLearned={markLessonLearned}
              parseMarkdown={parseMarkdown}
            />
          )}
          {/* ── GUIDE ── */}
          {tab === 'guide' && <GuideTab />}

          {/* ── DICT ── */}
          {tab === 'dict' && (
            <DictTab
              dictInput={dictInput} setDictInput={setDictInput}
              dictResult={dictResult} setDictResult={setDictResult}
              dictLoading={dictLoading} lookupWord={lookupWord}
              history={history} mode={mode} loadHistory={loadHistory}
              speak={speak} globalSpeed={globalSpeed} globalVoice={globalVoice} globalTtsProvider={globalTtsProvider}
              parseMarkdown={parseMarkdown}
            />
          )}

        </div>

        {/* ── TAB-SPECIFIC HISTORY COLUMN ── */}
        <div style={{ display: tab === 'dict' ? 'none' : undefined }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="section-title" style={{ margin: 0 }}>📚 Lịch sử ({history.filter(h => h.type === (tab === 'write' ? 'writing' : tab === 'read' ? 'reading' : tab)).length})</div>
              </div>
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={loadHistory}>↻ Tải lại</button>
            </div>
            {(() => {
              const mapType = tab === 'write' ? 'writing' : tab === 'read' ? 'reading' : tab;
              const now = Date.now();
              const due = history.filter(h => h.type === mapType && h.nextReviewAt && new Date(h.nextReviewAt).getTime() <= now);
              if (!due.length) return null;
              return (
                <div style={{ marginBottom: 12, padding: '6px 10px', background: '#d2992222', border: '1px solid #d29922', borderRadius: 8, fontSize: 12, color: '#d29922', fontWeight: 700 }}>
                  🔔 Cần ôn: {due.length} bài
                </div>
              );
            })()}
            {historyLoading && <div style={{ color: 'var(--muted)', padding: 20 }}>Đang tải dữ liệu...</div>}

            <div style={{ maxHeight: 600, overflowY: 'auto', paddingRight: 4 }}>
              {(() => {
                const mapType = tab === 'write' ? 'writing' : tab === 'read' ? 'reading' : tab;
                const items = history.filter(h => {
                  if (h.type !== mapType) return false;
                  if (mode === 'all') return true; // Show all when "All" is selected
                  const itemMode = (() => { try { return JSON.parse(h.metadata || '{}').mode || 'coder'; } catch { return 'coder'; } })();
                  return itemMode === mode;
                });
                if (!items.length && !historyLoading) return <div style={{ color: 'var(--muted)', fontSize: 13, padding: 10 }}>Chưa có bài lưu cho phần này.</div>;

                return items.map(item => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 8px', borderBottom: '1px solid var(--surface2)', cursor: 'pointer', borderRadius: 8, transition: 'background 0.15s' }}
                    onClick={() => {
                      if (mapType === 'listen') {
                        setListenText(item.content);
                        try {
                          const m = JSON.parse(item.metadata || '{}');
                          setListenVi(m.vi || '');
                          setListenVocab(m.vocab || []);
                        } catch {
                          setListenVi(''); setListenVocab([]);
                        }
                        setShowListenVi(false);
                      } else if (mapType === 'speak') {
                        setTranscript(item.content);
                        setSpkRecordId(item.id);
                        try {
                          const m = JSON.parse(item.metadata || '{}');
                          if (m.topic) setSpkTopic(m.topic);
                          setSpkFeedback(m.feedback || '');
                        } catch { /**/ }
                      } else if (mapType === 'writing') {
                        setWriteText(item.content);
                        setWriteRecordId(item.id);
                        try {
                          const m = JSON.parse(item.metadata || '{}');
                          if (m.prompt) setWritePrompt(m.prompt);
                          setWriteFeedback(m.feedback || '');
                        } catch { /**/ }
                      } else if (mapType === 'vocab') {
                        try {
                          const m = JSON.parse(item.metadata || '{}');
                          setTab('vocab'); // Chuyển/Giữ ở tab Từ vựng
                          if (m.def) {
                            // Nếu là từ lưu riêng lẻ, biến nó thành 1 bộ thẻ chỉ có 1 từ
                            setCards([{
                              word: item.content,
                              def: m.def,
                              ex: m.ex,
                              vi: m.vi
                            }]);
                            setCardIdx(0);
                            setFlipped(true); // Hiển thị mặt sau (thông tin) luôn
                            setKnown([]);
                          } else {
                            // Nếu là nhóm từ (kiểu cũ)
                            const parsed = JSON.parse(item.content);
                            setCards(parsed); setCardIdx(0); setFlipped(false); setKnown([]);
                          }
                        } catch { /**/ }
                      } else if (mapType === 'reading') {
                        setReadRecordId(item.id);
                        try { const m = JSON.parse(item.metadata || '{}'); setReadTopic(m.topic || ''); setReadLevel(m.level || 'B1'); setReadQuestions(m.questions || []); setReadAnswers([]); setReadSubmitted(false); setReadArticle({ title: m.title || '', body: item.content, wordCount: item.content.split(/\s+/).length }); } catch { /**/ }
                        setReadSelected(''); setReadLookup(''); setReadChat([]);
                      } else if (mapType === 'grammar') {
                        setGrammarLesson(item.content);
                        setGrammarRecordId(item.id);
                        setGrammarSubmitted(false);
                        try {
                          const m = JSON.parse(item.metadata || '{}');
                          if (m.topic) setGrammarTopic(m.topic);
                          const ans: string[] = [];
                          const ms = item.content.matchAll(/ANSWER:\s*([ABC])/g);
                          for (const m of ms) ans.push(m[1]);
                          setGrammarQuizAnswers(ans);
                          setGrammarUserAnswers(ans.map(() => ''));
                        } catch { /**/ }
                      }
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>
                        {mapType === 'vocab' ? (() => {
                          try {
                            const m = JSON.parse(item.metadata || '{}');
                            return item.content; // Hiển thị từ
                          } catch {
                            return item.content.slice(0, 60);
                          }
                        })()
                          : (mapType === 'speak' || mapType === 'writing' || mapType === 'grammar') ? (() => { try { const m = JSON.parse(item.metadata || '{}'); return m.topic || m.prompt || item.content.slice(0, 50) || 'Dự án mới'; } catch { return item.content.slice(0, 50) || 'Dự án mới'; } })()
                            : (mapType === 'reading') ? (() => { try { return JSON.parse(item.metadata || '{}').title; } catch { return item.content.slice(0, 50); } })()
                              : item.content.slice(0, 60)}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span>{new Date(item.createdAt).toLocaleString('vi')}</span>
                        {mapType === 'vocab' && (() => {
                          try {
                            const m = JSON.parse(item.metadata || '{}');
                            return (
                              <>
                                {m.ipa && <span style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'monospace' }}>/{m.ipa}/</span>}
                                {m.vi && <span style={{ fontSize: 10, color: 'var(--green)', fontStyle: 'italic' }}>• {m.vi}</span>}
                              </>
                            );
                          } catch {
                            return null;
                          }
                        })()}
                        <span style={{
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: item.learnCount > 0 ? '#3fb95022' : 'var(--surface2)',
                          color: item.learnCount > 0 ? '#3fb950' : 'var(--muted)',
                          fontWeight: 700,
                          fontSize: 9
                        }}>
                          {item.learnCount > 0 ? `✓ Lần ${item.learnCount}` : '⏳ Chưa học'}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {(mapType === 'speak' || mapType === 'writing' || mapType === 'reading' || mapType === 'grammar') && (
                        <button onClick={(e) => { e.stopPropagation(); markLessonLearned(item.id); }} style={{ fontSize: 12, background: item.learnCount > 0 ? '#3fb95033' : 'var(--surface2)', border: '1px solid var(--border)', cursor: 'pointer', padding: '4px 8px', borderRadius: 6, color: item.learnCount > 0 ? '#3fb950' : 'var(--muted)', fontWeight: 700 }}>
                          ✓
                        </button>
                      )}
                      {mapType === 'vocab' && (
                        <button onClick={(e) => { e.stopPropagation(); speak(item.content, globalSpeed, globalVoice, globalTtsProvider); }} style={{ fontSize: 14, background: 'var(--accent)15', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6, color: 'var(--accent)' }}>
                          🔊
                        </button>
                      )}
                      <button onClick={async (e) => {
                        e.stopPropagation();
                        await fetch('/api/english', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id }) });
                        loadHistory();
                      }} style={{ fontSize: 12, color: '#f85149', background: '#f8514915', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6, transition: 'all 0.15s' }} onMouseEnter={e => { e.currentTarget.style.background = '#f8514930' }} onMouseLeave={e => { e.currentTarget.style.background = '#f8514915' }}>
                        🗑
                      </button>
                    </div>

                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
