'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { speakText, stopTTS } from '@/lib/tts';
import GuideTab from './_tabs/GuideTab';
import DictTab from './_tabs/DictTab';
import VocabTab from './_tabs/VocabTab';
import ReadTab from './_tabs/ReadTab';
import GrammarTab from './_tabs/GrammarTab';
import WriteTab from './_tabs/WriteTab';
import SpeakTab from './_tabs/SpeakTab';
import CurriculumTab from './_tabs/CurriculumTab';

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
      .replace(/^#### (.*$)/g, '<h4 style="font-size:15px; margin:8px 0 4px; font-weight:600; color:var(--text-main)">$1</h4>')
      .replace(/^##### (.*$)/g, '<h5 style="font-size:14px; margin:6px 0 2px; font-weight:600; color:var(--text-main)">$1</h5>')
      // IN ĐẬM VÀ TÔ MÀU số thứ tự đầu dòng (ví dụ: 1. Sáng kiến)
      .replace(/^(\d+\.)(?!\d*\/)\s*(.*)/g, '<strong style="color:var(--accent)">$1</strong> $2')
      // Render Bold and Italic correctly
      .replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--accent)">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em style="color:var(--purple)">$1</em>')
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
  ],
  'interview-coder': [
    'a candidate answering "Tell me about yourself" in a software engineer interview',
    'an interviewer asking about a challenging bug the candidate has fixed',
    'a candidate explaining a past project using the STAR method',
    'a system design interview discussing scalability trade-offs',
    'an interviewer asking "Why do you want to work at our company?"',
    'a candidate negotiating salary and benefits with a tech recruiter',
    'a behavioral interview about handling conflict with a teammate',
    'a candidate asking smart questions at the end of a tech interview',
    'a coding interview where the candidate explains their thought process out loud',
    'an interviewer asking about strengths, weaknesses, and career goals'
  ],
  'interview-finance': [
    'a candidate answering "Walk me through your resume" in a banking interview',
    'an interviewer asking about valuation methods (DCF, comparables)',
    'a candidate explaining why they want to work in investment banking',
    'a behavioral interview about working long hours under pressure',
    'an interviewer asking about a recent market trend or deal',
    'a candidate discussing a financial model they built',
    'a fit interview about teamwork and leadership in finance',
    'an interviewer asking "Why finance and not consulting?"',
    'a candidate negotiating compensation with an HR manager at a bank',
    'a technical interview about accounting and financial statements'
  ]
};

interface EngLesson { id: number; type: string; content: string; metadata: string; completed: boolean; learnCount: number; createdAt: string; nextReviewAt?: string | null; lastReviewedAt?: string | null; intervalDays?: number; easeFactor?: number; reviewCount?: number; }

const READ_LEVELS = [
  { id: 'A1', label: 'A1' },
  { id: 'A2', label: 'A2' },
  { id: 'B1', label: 'B1' },
  { id: 'B2', label: 'B2' },
  { id: 'C1', label: 'C1' },
];

// CEFR curriculum — bám sát BẢN CHẤT của từng cấp độ (grammar + vocab + skill)
const CEFR_CURRICULUM: Record<string, { grammar: string; vocab: string; skill: string; sentence: string }> = {
  A1: {
    grammar: 'to be (am/is/are), have/has, Present Simple, possessive (my/your), this/that, there is/are, can/can\'t, plural -s, basic question (what/where/who)',
    vocab: '500-1000 từ thông dụng: gia đình, số đếm, màu sắc, ngày tháng, đồ ăn, nghề nghiệp, đồ vật quanh nhà',
    skill: 'Câu chào hỏi, giới thiệu bản thân, mô tả người/vật đơn giản',
    sentence: 'Câu rất ngắn (5-8 từ), 1 mệnh đề, present tense.',
  },
  A2: {
    grammar: 'Past Simple (regular/irregular), Present Continuous, going to (future), comparative/superlative, adverbs of frequency, must/should, prepositions of time/place',
    vocab: '1500-2500 từ: du lịch, mua sắm, sức khoẻ, thời tiết, sở thích, cảm xúc cơ bản',
    skill: 'Kể chuyện đơn giản, mô tả thói quen, nói về quá khứ gần',
    sentence: 'Câu 8-12 từ, có thể dùng and/but/because.',
  },
  B1: {
    grammar: 'Present Perfect (vs Past Simple), Past Continuous, First/Second Conditional, Passive Voice (Present/Past), Reported Speech (basic), Relative Clauses (who/which/that), modal (might/could/would)',
    vocab: '2500-3500 từ: công việc, công nghệ cơ bản, môi trường, tin tức, cảm xúc đa dạng, idiom thông dụng',
    skill: 'Trình bày ý kiến, kể trải nghiệm, viết email không trang trọng, thảo luận pros/cons',
    sentence: 'Câu 12-18 từ, dùng linking word (however, although, in addition).',
  },
  B2: {
    grammar: 'Present Perfect Continuous, Past Perfect, Third Conditional & Mixed Conditional, Passive (all tenses), Reported Speech (advanced), Gerund vs Infinitive, Wish/If only, Causative (have something done), advanced modal (must have/might have)',
    vocab: '4000-6000 từ: kinh doanh, học thuật, abstract noun (achievement, attitude), phrasal verb, collocation',
    skill: 'Tranh luận, viết essay có argument, diễn đạt sắc thái, nói về chủ đề trừu tượng',
    sentence: 'Câu 15-25 từ, mệnh đề phức, đa dạng cấu trúc.',
  },
  C1: {
    grammar: 'Inversion (Hardly had..., Not only...), Cleft sentence (It was... that), Subjunctive, advanced passive, ellipsis, complex conditional, nuanced modal (would rather, had better)',
    vocab: '8000+ từ: idiom, formal/academic vocab, register (formal vs informal), nuance, connotation',
    skill: 'Diễn đạt ý phức tạp tự nhiên, viết bài học thuật, persuasive writing, hùng biện',
    sentence: 'Câu phức tạp 20-35 từ, đa dạng cấu trúc nâng cao.',
  },
};

// Giáo trình theo BÀI — mỗi Bài có 1 chủ đề chung cho cả 4 kỹ năng
const UNIT_CURRICULUM: Record<string, { title: string; grammar: string; vocab: string; scenario: string }[]> = {
  A1: [
    { title: 'Hello & Introductions', grammar: 'to be (am/is/are), my/your', vocab: 'name, country, age, job', scenario: 'Meeting someone new for the first time' },
    { title: 'My Family', grammar: 'have/has, possessive', vocab: 'family members, ages', scenario: 'Talking about your family' },
    { title: 'Numbers & Time', grammar: 'present simple with time', vocab: 'numbers 1-100, days, months, time', scenario: 'Asking about time and dates' },
    { title: 'Daily Routine', grammar: 'present simple, adverbs of frequency', vocab: 'wake up, brush teeth, eat, work, sleep', scenario: 'Describing your typical day' },
    { title: 'Food & Drink', grammar: 'a/an, some/any, like/don\'t like', vocab: 'breakfast, lunch, dinner, common foods', scenario: 'Ordering at a café' },
    { title: 'My House', grammar: 'there is / there are, prepositions of place', vocab: 'rooms, furniture', scenario: 'Describing your home' },
    { title: 'Shopping', grammar: 'how much / how many, this/that', vocab: 'clothes, prices, sizes', scenario: 'Buying clothes at a shop' },
    { title: 'Hobbies', grammar: 'present simple, like + verb-ing', vocab: 'sports, music, reading, games', scenario: 'Talking about free time' },
    { title: 'Weather & Seasons', grammar: 'it is + adjective', vocab: 'hot, cold, rainy, sunny, seasons', scenario: 'Discussing the weather' },
    { title: 'Directions', grammar: 'imperatives, prepositions of direction', vocab: 'turn left/right, straight, near, opposite', scenario: 'Asking and giving directions' },
  ],
  A2: [
    { title: 'Past Holidays', grammar: 'Past Simple (regular & irregular)', vocab: 'travel, places, activities', scenario: 'Talking about a recent vacation' },
    { title: 'Future Plans', grammar: 'going to, will', vocab: 'plans, predictions, ambitions', scenario: 'Describing weekend plans' },
    { title: 'At the Restaurant', grammar: 'would like, can I have...', vocab: 'menu, dishes, drinks, bill', scenario: 'Ordering food at a restaurant' },
    { title: 'Health & Body', grammar: 'should/shouldn\'t, modal advice', vocab: 'body parts, illness, doctor', scenario: 'Visiting the doctor' },
    { title: 'Comparing Things', grammar: 'comparative & superlative', vocab: 'adjectives: big, small, fast, expensive', scenario: 'Comparing products before buying' },
    { title: 'At Work', grammar: 'present continuous for now', vocab: 'office, meeting, colleague, deadline', scenario: 'Describing your current work' },
    { title: 'Travel & Transport', grammar: 'prepositions of movement, modals', vocab: 'plane, train, bus, ticket, station', scenario: 'Booking a train ticket' },
    { title: 'Personal Stories', grammar: 'past simple narrative', vocab: 'first, then, after that, finally', scenario: 'Telling a story from your childhood' },
    { title: 'Technology Around Us', grammar: 'present simple + passive intro', vocab: 'phone, app, internet, social media', scenario: 'Describing how you use your phone' },
    { title: 'Goals & Dreams', grammar: 'want to, hope to, plan to', vocab: 'career, study, learn, achieve', scenario: 'Talking about your goals for next year' },
  ],
  B1: [
    { title: 'Life Experiences', grammar: 'Present Perfect vs Past Simple', vocab: 'experience, ever, never, since, for', scenario: 'Discussing things you have done in your life' },
    { title: 'If I Could...', grammar: 'Second Conditional', vocab: 'imaginary situations, would, might', scenario: 'Discussing hypothetical situations' },
    { title: 'News & Events', grammar: 'Passive Voice (Present/Past)', vocab: 'announce, report, discover, build', scenario: 'Reporting recent news' },
    { title: 'Workplace Communication', grammar: 'Reported Speech basics', vocab: 'meeting, said, asked, mentioned', scenario: 'Reporting what colleagues said' },
    { title: 'Describing People', grammar: 'Relative Clauses (who/which/that)', vocab: 'personality, appearance, character', scenario: 'Describing a person you admire' },
    { title: 'Pros & Cons', grammar: 'linking words (however, although)', vocab: 'advantage, disadvantage, on the other hand', scenario: 'Discussing pros and cons of remote work' },
    { title: 'Cultural Differences', grammar: 'modals of possibility (might/could)', vocab: 'culture, tradition, custom, etiquette', scenario: 'Comparing cultures' },
    { title: 'Solving Problems', grammar: 'First Conditional', vocab: 'issue, solution, fix, troubleshoot', scenario: 'Describing how you solved a problem at work' },
    { title: 'Environment', grammar: 'should + passive', vocab: 'pollution, recycle, climate, sustainable', scenario: 'Discussing environmental issues' },
    { title: 'Personal Achievements', grammar: 'Present Perfect Continuous', vocab: 'achieve, accomplish, proud, milestone', scenario: 'Talking about an achievement you are proud of' },
  ],
  B2: [
    { title: 'Career Development', grammar: 'Present Perfect Continuous', vocab: 'promotion, growth, skill, expertise', scenario: 'Discussing your career progression' },
    { title: 'Regrets & Reflections', grammar: 'Third Conditional, wish + past perfect', vocab: 'regret, decision, hindsight, lesson', scenario: 'Reflecting on past decisions' },
    { title: 'Technology & Society', grammar: 'Mixed Conditionals', vocab: 'innovation, disruption, AI, automation', scenario: 'Debating the impact of AI on jobs' },
    { title: 'Persuasion & Argument', grammar: 'modal perfect (must have, might have)', vocab: 'argue, persuade, convince, evidence', scenario: 'Building a persuasive argument' },
    { title: 'Project Management', grammar: 'Causative (have something done)', vocab: 'deadline, milestone, deliverable, stakeholder', scenario: 'Reporting project status to stakeholders' },
    { title: 'Abstract Concepts', grammar: 'Gerund vs Infinitive', vocab: 'freedom, responsibility, ethics, justice', scenario: 'Discussing abstract values' },
    { title: 'Interview Skills', grammar: 'advanced reported speech', vocab: 'strength, weakness, scenario, hypothetical', scenario: 'Answering tough job interview questions' },
    { title: 'Negotiation', grammar: 'softening language, hedging', vocab: 'compromise, agree, terms, conditions', scenario: 'Negotiating salary or contract terms' },
    { title: 'Critical Thinking', grammar: 'complex sentences with multiple clauses', vocab: 'analyze, evaluate, assumption, bias', scenario: 'Critically reviewing a proposal' },
    { title: 'Future of Work', grammar: 'Future Perfect, Future Continuous', vocab: 'remote, hybrid, gig economy, upskill', scenario: 'Predicting how work will change in 10 years' },
  ],
  C1: [
    { title: 'Sophisticated Storytelling', grammar: 'Inversion (Hardly had..., Not only...)', vocab: 'narrative devices, vivid description', scenario: 'Telling a story with dramatic effect' },
    { title: 'Academic Discussion', grammar: 'Cleft sentences, nominalization', vocab: 'hypothesis, methodology, paradigm, framework', scenario: 'Discussing a research finding' },
    { title: 'Diplomatic Language', grammar: 'softeners, subjunctive', vocab: 'tactful, diplomatic, nuance, register', scenario: 'Delivering difficult feedback diplomatically' },
    { title: 'Idioms & Nuance', grammar: 'idiomatic expressions, collocations', vocab: 'common idioms, phrasal verbs at C1 level', scenario: 'Using idioms naturally in conversation' },
    { title: 'Public Speaking', grammar: 'rhetorical devices, parallel structure', vocab: 'audience, captivate, articulate, eloquent', scenario: 'Delivering a TED-style talk' },
    { title: 'Complex Argumentation', grammar: 'concessive clauses, advanced linking', vocab: 'notwithstanding, albeit, conversely', scenario: 'Constructing a multi-layered argument' },
    { title: 'Cultural Subtleties', grammar: 'register shifts (formal/informal)', vocab: 'connotation, undertone, implication', scenario: 'Navigating cultural sensitivities' },
    { title: 'Ethics & Philosophy', grammar: 'hypothetical & abstract structures', vocab: 'ethical dilemma, moral, principle, virtue', scenario: 'Discussing an ethical dilemma' },
    { title: 'Leadership Communication', grammar: 'persuasive structures, ellipsis', vocab: 'vision, mission, inspire, mobilize', scenario: 'Inspiring a team with a vision speech' },
    { title: 'Mastering Nuance', grammar: 'all advanced structures combined', vocab: 'precision, subtlety, mastery', scenario: 'Expressing complex emotions with precision' },
  ],
};

function cefrHint(level: string): string {
  const c = CEFR_CURRICULUM[level] || CEFR_CURRICULUM.A2;
  return `\n\n📚 CHUẨN CEFR ${level} (BẮT BUỘC bám sát bản chất cấp độ này):
- Ngữ pháp được phép dùng: ${c.grammar}
- Từ vựng cấp độ: ${c.vocab}
- Kỹ năng mục tiêu: ${c.skill}
- Độ dài/độ phức tạp câu: ${c.sentence}
TUYỆT ĐỐI không dùng grammar/vocab vượt cấp độ ${level}.`;
}
const READ_TOPICS = ['Web Development', 'Career & Jobs', 'Technology', 'Daily Life', 'Science', 'Business'];

const VOCAB_TOPICS = ['programming', 'web development', 'databases', 'networking', 'AI & ML', 'DevOps', 'career & jobs', 'daily life', 'finance', 'investing'];
const INTERVIEW_VOCAB_TOPICS = [
  'job interview phrases', 'CV & resume action verbs', 'describing strengths & skills',
  'behavioral interview (STAR method)', 'salary negotiation', 'company culture & values',
  'technical interview (problem solving)', 'teamwork & collaboration', 'leadership & management',
  'career goals & ambitions', 'email & professional communication', 'meeting & presentation phrases',
];

const TABS = [
  { id: 'curriculum', l: '🗂️ Danh mục' },
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
const INTERVIEW_GRAMMAR_TOPICS = [
  'Present Perfect (I have worked / I have achieved) — dùng trong phỏng vấn',
  'Past Simple — kể kinh nghiệm làm việc (STAR method)',
  'Second Conditional (If I were... I would...) — câu hỏi tình huống giả định',
  'Modal Verbs (can/could/would/should) — thể hiện năng lực & đề xuất',
  'Future with Will & Going To — nói về kế hoạch & mục tiêu',
  'Passive Voice — mô tả quy trình & trách nhiệm công việc',
  'Reported Speech — trích dẫn & kể lại tình huống',
  'Gerund & Infinitive — "I enjoy leading...", "I plan to..."',
  'Comparatives & Superlatives — so sánh phương án, kinh nghiệm',
  'Relative Clauses — mô tả project/kỹ năng chi tiết',
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
  const [tab, setTab] = useState<'curriculum' | 'listen' | 'speak' | 'write' | 'vocab' | 'read' | 'dict' | 'grammar' | 'guide'>('curriculum');
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
    }).catch(() => { });
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
  const [listenLooping, setListenLooping] = useState(false);
  const listenLoopingRef = useRef(false);
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
  const [vocabRecordId, setVocabRecordId] = useState<number | null>(null);

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

  // Batch
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState('');
  const [batchMsg, setBatchMsg] = useState('');
  const batchStopRef = useRef(false);

  // Grammar
  const [grammarTopic, setGrammarTopic] = useState(GRAMMAR_TOPICS[0]);
  const [grammarCustomTopic, setGrammarCustomTopic] = useState('');
  const [grammarLoading, setGrammarLoading] = useState(false);
  const [grammarLesson, setGrammarLesson] = useState<string | null>(null);
  const [grammarRecordId, setGrammarRecordId] = useState<number | null>(null);
  const [grammarQuizAnswers, setGrammarQuizAnswers] = useState<string[]>([]);
  const [grammarUserAnswers, setGrammarUserAnswers] = useState<string[]>([]);
  const [grammarSubmitted, setGrammarSubmitted] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // Flag để skip auto-load khi loadLesson đã set dữ liệu rồi
  const skipAutoLoadRef = useRef(false);

  function loadLesson(item: EngLesson) {
    skipAutoLoadRef.current = true; // Ngăn useEffect đè lại
    const mapType = item.type;
    if (mapType === 'listen') {
      setListenText(item.content);
      try {
        const m = JSON.parse(item.metadata || '{}');
        setListenVi(m.vi || '');
        setListenVocab(m.vocab || []);
        setListenLevel(m.level || 'A2');
        setListenRecordId(item.id);
      } catch { }
      setShowListenVi(false);
      setTab('listen');
    } else if (mapType === 'speak') {
      setSpkRecordId(item.id);
      try {
        const m = JSON.parse(item.metadata || '{}');
        if (m.topic) setSpkTopic(m.topic);
        setSpkFeedback(m.feedback || '');
        setSpkLevel(m.level || 'A2');
      } catch { }
      setTranscript('');
      setTab('speak');
    } else if (mapType === 'writing') {
      setWriteText(item.content);
      setWriteRecordId(item.id);
      try {
        const m = JSON.parse(item.metadata || '{}');
        if (m.prompt) setWritePrompt(m.prompt);
        setWriteFeedback(m.feedback || '');
        setWriteLevel(m.level || 'A2');
      } catch { }
      setTab('write');
    } else if (mapType === 'reading') {
      setReadRecordId(item.id);
      try {
        const m = JSON.parse(item.metadata || '{}');
        setReadTopic(m.topic || '');
        setReadLevel(m.level || 'B1');
        setReadQuestions(m.questions || []);
        setReadAnswers([]);
        setReadSubmitted(false);
        setReadArticle({ title: m.title || '', body: item.content, wordCount: item.content.split(/\s+/).length });
      } catch { }
      setReadSelected(''); setReadLookup(''); setReadChat([]);
      setTab('read');
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
      } catch { }
      setTab('grammar');
    } else if (mapType === 'vocab') {
      let unitCards: { word: string; def: string; ex: string; vi: string }[] = [];
      try {
        const m = JSON.parse(item.metadata || '{}');
        if (m.unit && m.mode) {
          // Tìm các từ cùng Unit & Mode
          const unitWords = history.filter(h => {
            if (h.type !== 'vocab') return false;
            try {
              const hm = JSON.parse(h.metadata || '{}');
              return hm.unit === m.unit && hm.mode === m.mode;
            } catch { return false; }
          });
          unitCards = unitWords.map(h => {
            try {
              const hm = JSON.parse(h.metadata || '{}');
              return { word: h.content, def: hm.def || '', ex: hm.ex || '', vi: hm.vi || '' };
            } catch { return { word: h.content, def: '', ex: '', vi: '' }; }
          });
          setVocabRecordId(item.id); // Dùng ID của từ đang nhấn (hoặc từ đầu tiên)
        } else if (m.def) {
          unitCards = [{ word: item.content, def: m.def, ex: m.ex, vi: m.vi }];
          setVocabRecordId(item.id);
        }
      } catch { }

      if (unitCards.length > 0) {
        setCards(unitCards);
        const idx = unitCards.findIndex(c => c.word === item.content);
        setCardIdx(idx !== -1 ? idx : 0);
        setFlipped(unitCards.length === 1);
        setKnown([]);
        setTab('vocab');
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function deleteUnit(unitNum: number, level: string) {
    if (!confirm(`Xóa toàn bộ Bài ${unitNum} (${level})? Thao tác này không thể hoàn tác.`)) return;
    const idsToDelete = history
      .filter(h => {
        try {
          const m = JSON.parse(h.metadata || '{}');
          return m.unit === unitNum && (m.level === level || (!m.level && level === '?') || (!m.level && !level));
        } catch { return false; }
      })
      .map(h => h.id);

    if (idsToDelete.length === 0) return;

    try {
      const res = await fetch('/api/english', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsToDelete })
      });
      if (res.ok) {
        await loadHistory();
      }
    } catch (e) {
      console.error('Delete unit error:', e);
    }
  }

  // legacy (unused by CurriculumTab now, kept for other callers)
  function jumpToLesson(skill: string, level: string, title: string) {
    if (skill === 'listen') { setListenLevel(level); setListenCustomTopic(title); setTab('listen'); }
    else if (skill === 'speak') { setSpkLevel(level); setSpkCustomTopic(title); setTab('speak'); }
    else if (skill === 'read') { setReadLevel(level); setReadCustomTopic(title); setTab('read'); }
    else if (skill === 'write') { setWriteLevel(level); setWriteCustomPrompt(title); setTab('write'); }
    else if (skill === 'grammar') { setGrammarCustomTopic(title); setTab('grammar'); }
    else if (skill === 'vocab') { setVocabTopic(title); setTab('vocab'); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function genGrammarLesson() {
    setGrammarLoading(true); setGrammarLesson(null); setGrammarSubmitted(false); setGrammarUserAnswers([]);
    const p = `Bạn là một giáo viên dạy Tiếng Anh chuyên nghiệp. Hãy soạn một bài giảng NGỮ PHÁP CHI TIẾT về chủ đề: "${grammarTopic}".
    Sử dụng Markdown để trình bày đẹp mắt.

    Cấu trúc bài giảng bắt buộc (Giải thích bằng Tiếng Việt):
    ### 1. Khái niệm & Cấu trúc
    (Định nghĩa và công thức chính, trình bày công thức rõ ràng)

    ### 2. Cách dùng & Ví dụ
    (Giải thích các trường hợp sử dụng. Với mỗi trường hợp, đưa ra ít nhất 1 ví dụ thực tế)
    - **Ví dụ**: *English sentence* -> Bản dịch tiếng Việt

    ### 3. Lưu ý (nếu có)
    (Các lỗi thường gặp hoặc mẹo ghi nhớ)

    ### 4. Quiz
    Q1: [Câu hỏi]
    A) [Lựa chọn] B) [Lựa chọn] C) [Lựa chọn]
    ANSWER: [A/B/C]

    Lưu ý: Bắt đầu tiêu đề phần bằng ###. Trình bày sạch sẽ, không dùng quá nhiều cấp độ tiêu đề.`;

    try {
      const result = await genTopicTask('grammar', p, () => { });
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
    let historyData: EngLesson[] = [];
    try {
      const res = await fetch('/api/english');
      const data = await res.json();
      historyData = data.filter((h: any) => !h.type.endsWith('_pending'));
      setHistory(historyData);
    } catch { }
    setHistoryLoading(false);
    return historyData;
  }, []);

  const getGenMessage = useCallback((elapsed: number, action = 'tạo') => {
    return `⏳ AI đang làm...`;
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Tự động load bài mới nhất khi chuyển Tab
  useEffect(() => {
    if (skipAutoLoadRef.current) {
      skipAutoLoadRef.current = false;
      return;
    }
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
      } catch { }
    } else if (tab === 'speak') {
      try {
        const m = JSON.parse(latest.metadata || '{}');
        setSpkTopic(m.topic || latest.content);
        setSpkSample(m.sample || '');
        setSpkRecordId(latest.id);
        setSpkLevel(m.level || 'A2');
        setTranscript(''); setSpkFeedback('');
      } catch { }
    } else if (tab === 'write') {
      try {
        const m = JSON.parse(latest.metadata || '{}');
        setWritePrompt(m.prompt || latest.content);
        setWriteSample(m.sample || '');
        setWriteRecordId(latest.id);
        setWriteLevel(m.level || 'A2');
        setWriteFeedback(''); setWriteText('');
      } catch { }
    } else if (tab === 'read') {
      try {
        const m = JSON.parse(latest.metadata || '{}');
        setReadArticle({ title: m.title || 'Bài đọc', body: latest.content, wordCount: m.wordCount || 0 });
        setReadRecordId(latest.id);
        setReadLevel(m.level || 'A2');
        setReadQuestions(m.questions || []);
        setReadAnswers([]); setReadSubmitted(false);
      } catch { }
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
      } catch { }
    } else if (tab === 'vocab') {
      try {
        setCards(JSON.parse(latest.content));
        setCardIdx(0); setFlipped(false);
      } catch { }
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

    skipAutoLoadRef.current = true;
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

  async function genBatch() {
    if (batchRunning) { batchStopRef.current = true; return; }
    if (mode === 'all') { alert('Vui lòng chọn mode cụ thể để tạo batch'); return; }
    const batchType = tab === 'write' ? 'writing' : tab === 'read' ? 'reading' : tab;
    if (!['listen', 'speak', 'writing', 'reading', 'vocab', 'grammar'].includes(batchType)) {
      alert('Batch chỉ hỗ trợ tab Nghe, Nói, Viết, Đọc, Từ vựng, Ngữ pháp'); return;
    }
    setBatchRunning(true); batchStopRef.current = false; setBatchMsg('');
    const MAX = 10; let made = 0; const failures: string[] = [];
    let snapshot = [...history];

    for (let i = 0; i < MAX * 3 && made < MAX && !batchStopRef.current; i++) {
      setBatchProgress(`${made + 1}/${MAX}`);
      try {
        const existingTitles = snapshot
          .filter(h => { try { return h.type === batchType && JSON.parse(h.metadata || '{}').mode === mode; } catch { return false; } })
          .map(h => { try { return JSON.parse(h.metadata || '{}').title || JSON.parse(h.metadata || '{}').topic || JSON.parse(h.metadata || '{}').prompt || h.content.slice(0, 40); } catch { return h.content.slice(0, 40); } });
        const avoidStr = existingTitles.length > 0 ? `\n\nAvoid these existing: ${existingTitles.slice(-20).join('; ')}` : '';
        const curLevel = batchType === 'listen' ? listenLevel : batchType === 'speak' ? spkLevel : batchType === 'writing' ? writeLevel : readLevel;
        const mDesc = MODES.find(m2 => m2.id === mode)?.desc || 'developer';
        const cefr = cefrHint(curLevel);

        let content = ''; let meta: Record<string, unknown> = { mode, level: curLevel };

        if (batchType === 'listen') {
          const scenarios = LISTEN_SCENARIOS[mode as keyof typeof LISTEN_SCENARIOS] || LISTEN_SCENARIOS.coder;
          const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
          const p = `Generate a unique English listening exercise (4-6 sentences) for a ${curLevel} learner.\nScenario: ${scenario}\nContext: ${mDesc}${avoidStr}${cefr}\nRequirements: natural English matching ${curLevel}, include 3-4 vocab words, realistic dialogue/monologue.\nReturn JSON ONLY:\n{"title":"...","en":"English text...","vi":"Bản dịch tiếng Việt...","vocab":[{"w":"word","m":"nghĩa"}]}`;
          const raw = await askAI(p, aiModel);
          const m = raw?.match(/\{[\s\S]*\}/);
          if (!m) { failures.push(`lần ${i + 1}: parse lỗi`); continue; }
          const d = JSON.parse(m[0]);
          if (!d.en) { failures.push(`lần ${i + 1}: rỗng`); continue; }
          content = d.en; meta = { title: d.title, vi: d.vi, vocab: d.vocab, topic: scenario, level: curLevel, mode };
        } else if (batchType === 'speak') {
          const p = `Give ONE short English speaking question for ${curLevel} level learner: ${mDesc}.${avoidStr}${cefr}\nReply with the question ONLY.`;
          const t = await askAI(p, aiModel);
          if (!t?.trim()) { failures.push(`lần ${i + 1}: rỗng`); continue; }
          content = ''; meta = { topic: t.trim(), mode, level: curLevel };
        } else if (batchType === 'writing') {
          const p = `Give ONE English writing prompt for ${curLevel} level learner: ${mDesc}.${avoidStr}${cefr}\nReply with the prompt ONLY.`;
          const t = await askAI(p, aiModel);
          if (!t?.trim()) { failures.push(`lần ${i + 1}: rỗng`); continue; }
          content = ''; meta = { prompt: t.trim(), mode, level: curLevel };
        } else if (batchType === 'reading') {
          const topics = READ_TOPICS;
          const topic = topics[Math.floor(Math.random() * topics.length)];
          const wordRange = curLevel === 'A1' ? '50-80' : curLevel === 'A2' ? '80-120' : curLevel === 'B1' ? '150-200' : curLevel === 'B2' ? '200-280' : '280-380';
          const p = `You are an English reading teacher. Create a reading passage for a Vietnamese learner. Context: ${mDesc}.\nLevel: ${curLevel}\nTopic: ${topic}${avoidStr}${cefr}\nReturn JSON ONLY:\n{"title":"...","body":"4-6 paragraphs \\n\\n separated, ${wordRange} words","questions":[{"q":"...","options":["A","B","C","D"],"answer":0},{"q":"...","options":["A","B","C","D"],"answer":2},{"q":"...","options":["A","B","C","D"],"answer":1},{"q":"...","options":["A","B","C","D"],"answer":3}]}`;
          const raw = await askAI(p, aiModel);
          const m = raw?.match(/\{[\s\S]*\}/);
          if (!m) { failures.push(`lần ${i + 1}: parse lỗi`); continue; }
          const d = JSON.parse(m[0]);
          if (!d.body) { failures.push(`lần ${i + 1}: rỗng`); continue; }
          content = d.body; meta = { title: d.title, level: curLevel, topic, questions: d.questions, mode };
        }

        if (batchType === 'vocab') {
          // Vocab: lưu từng từ trong set 10 từ
          const allTopics = [...VOCAB_TOPICS, ...INTERVIEW_VOCAB_TOPICS];
          const topic = allTopics[Math.floor(Math.random() * allTopics.length)];
          const curLevel = listenLevel;
          const existingWords = snapshot.filter(h => h.type === 'vocab').map(h => h.content);
          const avoidW = existingWords.length ? `\nAvoid: ${existingWords.slice(-30).join(', ')}` : '';
          const p = `Give 10 useful English vocabulary words for a ${curLevel} learner. Topic: "${topic}". Context: ${mDesc}${avoidW}${cefrHint(curLevel)}\nReturn JSON array ONLY: [{"word":"...","ipa":"...","def":"short English definition","ex":"Example sentence","vi":"nghĩa tiếng Việt"}]`;
          const raw = await askAI(p, aiModel);
          const mArr = raw?.match(/\[[\s\S]*\]/);
          if (!mArr) { failures.push(`lần ${i + 1}: parse lỗi`); continue; }
          const words = JSON.parse(mArr[0]);
          let wordSaved = 0;
          for (const w of words) {
            const wMeta = { word: w.word, ipa: w.ipa || '', def: w.def, ex: w.ex, vi: w.vi, topic, mode };
            const s = await fetch('/api/english', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'vocab', content: w.word, metadata: wMeta }) }).then(r => r.json());
            if (s?.id) { snapshot = [...snapshot, { ...s, metadata: JSON.stringify(wMeta) }]; wordSaved++; }
          }
          if (wordSaved > 0) made++;
          else failures.push(`lần ${i + 1}: lưu lỗi`);
          continue;
        } else if (batchType === 'grammar') {
          // Grammar: mỗi batch item = 1 bài giảng
          const allTopics = [...GRAMMAR_TOPICS, ...INTERVIEW_GRAMMAR_TOPICS];
          const existingGram = snapshot.filter(h => h.type === 'grammar').map(h => { try { return JSON.parse(h.metadata || '{}').topic || ''; } catch { return ''; } });
          const remaining = allTopics.filter(t => !existingGram.includes(t));
          const topic = remaining.length ? remaining[Math.floor(Math.random() * remaining.length)] : allTopics[Math.floor(Math.random() * allTopics.length)];
          const curLevel = listenLevel;
          const p = `Bạn là giáo viên tiếng Anh. Soạn bài giảng ngữ pháp CHI TIẾT về: "${topic}" (cấp ${curLevel}).\nGiải thích bằng tiếng Việt:\n1. **Khái niệm & Cấu trúc**\n2. **Cách dùng** (2-3 ví dụ thực tế)\n3. **Dùng trong phỏng vấn**: ví dụ câu dùng grammar này khi phỏng vấn\n4. **Quiz** (3 câu):\nQ1: ...\nA) ... B) ... C) ...\nANSWER: [A/B/C]\n\nQ2: ...\nA) ... B) ... C) ...\nANSWER: [A/B/C]\n\nQ3: ...\nA) ... B) ... C) ...\nANSWER: [A/B/C]`;
          const raw = await askAI(p, aiModel);
          if (!raw?.trim()) { failures.push(`lần ${i + 1}: rỗng`); continue; }
          meta = { topic, level: curLevel, mode };
          content = raw;
          const saved = await fetch('/api/english', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'grammar', content, metadata: meta }) }).then(r => r.json());
          if (saved?.id) { snapshot = [...snapshot, { ...saved, metadata: JSON.stringify(meta) }]; made++; }
          else failures.push(`lần ${i + 1}: lưu lỗi`);
          continue;
        }

        const saved = await fetch('/api/english', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: batchType, content, metadata: meta }) }).then(r => r.json());
        if (saved?.id) { snapshot = [...snapshot, { ...saved, metadata: JSON.stringify(meta) }]; made++; }
        else { failures.push(`lần ${i + 1}: lưu lỗi`); }
      } catch (e) { failures.push(`lần ${i + 1}: ${String(e)}`); }
    }

    await loadHistory();
    setBatchRunning(false); setBatchProgress('');
    if (batchStopRef.current) setBatchMsg(`⏸ Đã dừng sau ${made} bài.`);
    else if (failures.length) setBatchMsg(`✅ Tạo ${made} bài. ⚠️ Bỏ qua: ${failures.length} lần.`);
    else setBatchMsg(`✅ Đã tạo ${made} bài tiếng Anh.`);
  }

  // Tạo 1 Bài (Unit) gồm cả 4 kỹ năng cùng chủ đề, theo giáo trình CEFR
  async function genNextUnit() {
    if (batchRunning) { batchStopRef.current = true; return; }
    if (mode === 'all') { alert('Vui lòng chọn mode cụ thể trước'); return; }
    const level = listenLevel;
    const units = UNIT_CURRICULUM[level] || [];
    if (units.length === 0) { alert(`Chưa có giáo trình cho ${level}`); return; }

    // Đếm số unit đã học (theo metadata.unit) trong cùng level + mode
    const doneUnits = new Set<number>();
    for (const h of history) {
      try {
        const m = JSON.parse(h.metadata || '{}');
        if (m.level === level && m.mode === mode && typeof m.unit === 'number') doneUnits.add(m.unit);
      } catch { /**/ }
    }
    const nextUnitIdx = units.findIndex((_, i) => !doneUnits.has(i + 1));
    if (nextUnitIdx === -1) { setBatchMsg(`✅ Bạn đã hoàn thành toàn bộ ${units.length} bài cấp ${level} (${mode}).`); return; }

    const unitNum = nextUnitIdx + 1;
    const unit = units[nextUnitIdx];
    setBatchRunning(true); batchStopRef.current = false; setBatchMsg('');
    setBatchProgress(`Bài ${unitNum}: ${unit.title}`);

    const mDesc = MODES.find(m2 => m2.id === mode)?.desc || 'developer';
    const cefr = cefrHint(level);
    const unitCtx = `\n\nĐây là BÀI ${unitNum} của giáo trình ${level}.\nChủ đề: ${unit.title}\nGrammar focus: ${unit.grammar}\nVocab focus: ${unit.vocab}\nScenario: ${unit.scenario}`;
    const failures: string[] = [];
    let made = 0;

    type SkillItem = { type: string; build: () => Promise<{ content: string; meta: Record<string, unknown>; multi?: { content: string; meta: Record<string, unknown> }[] } | null> };
    const skills: SkillItem[] = [
      {
        type: 'listen',
        build: async () => {
          const p = `Generate an English listening exercise (4-6 sentences) for ${level} learner. Context: ${mDesc}.${unitCtx}${cefr}\nMUST use the grammar/vocab focus. Realistic dialogue/monologue.\nReturn JSON ONLY:\n{"title":"...","en":"...","vi":"...","vocab":[{"w":"word","m":"nghĩa"}]}`;
          const raw = await askAI(p, aiModel);
          const m = raw?.match(/\{[\s\S]*\}/); if (!m) return null;
          const d = JSON.parse(m[0]); if (!d.en) return null;
          return { content: d.en, meta: { title: `Bài ${unitNum}: ${unit.title} — Nghe`, vi: d.vi, vocab: d.vocab, topic: unit.scenario, level, mode, unit: unitNum, unitTitle: unit.title } };
        }
      },
      {
        type: 'speak',
        build: async () => {
          const p = `Give ONE English speaking question for ${level} learner. Context: ${mDesc}.${unitCtx}${cefr}\nQuestion phải khớp scenario & grammar focus.\nReply with the question ONLY.`;
          const t = await askAI(p, aiModel);
          if (!t?.trim()) return null;
          return { content: '', meta: { topic: t.trim(), level, mode, unit: unitNum, unitTitle: unit.title, title: `Bài ${unitNum}: ${unit.title} — Nói` } };
        }
      },
      {
        type: 'writing',
        build: async () => {
          const p = `Give ONE English writing prompt for ${level} learner. Context: ${mDesc}.${unitCtx}${cefr}\nPrompt phải khớp scenario.\nReply with the prompt ONLY.`;
          const t = await askAI(p, aiModel);
          if (!t?.trim()) return null;
          return { content: '', meta: { prompt: t.trim(), level, mode, unit: unitNum, unitTitle: unit.title, title: `Bài ${unitNum}: ${unit.title} — Viết` } };
        }
      },
      {
        type: 'reading',
        build: async () => {
          const wordRange = level === 'A1' ? '50-80' : level === 'A2' ? '80-120' : level === 'B1' ? '150-200' : level === 'B2' ? '200-280' : '280-380';
          const p = `Create an English reading passage for ${level} learner. Context: ${mDesc}.${unitCtx}${cefr}\nMUST use the grammar/vocab focus.\nReturn JSON ONLY:\n{"title":"...","body":"4-6 paragraphs \\n\\n separated, ${wordRange} words","questions":[{"q":"...","options":["A","B","C","D"],"answer":0},{"q":"...","options":["A","B","C","D"],"answer":2},{"q":"...","options":["A","B","C","D"],"answer":1},{"q":"...","options":["A","B","C","D"],"answer":3}]}`;
          const raw = await askAI(p, aiModel);
          const m = raw?.match(/\{[\s\S]*\}/); if (!m) return null;
          const d = JSON.parse(m[0]); if (!d.body) return null;
          return { content: d.body, meta: { title: `Bài ${unitNum}: ${unit.title} — Đọc`, level, topic: unit.scenario, questions: d.questions, mode, unit: unitNum, unitTitle: unit.title } };
        }
      },
      {
        // Từ vựng — 10 từ theo vocab focus của bài, lưu từng từ riêng để "nhả ra từng từ" trong lịch sử
        type: 'vocab',
        build: async () => {
          const p = `Give 10 useful English vocabulary words for a ${level} learner. Topic: "${unit.vocab}". Context: ${mDesc}.${unitCtx}\nFocus on words that appear in this unit's grammar/scenario.\nReturn JSON array ONLY: [{"word":"...","ipa":"...","def":"short English definition","ex":"Example sentence using the grammar focus","vi":"nghĩa tiếng Việt"}]`;
          const raw = await askAI(p, aiModel);
          const m = raw?.match(/\[[\s\S]*\]/); if (!m) return null;
          const words = JSON.parse(m[0]);
          if (!words?.length) return null;
          return {
            content: words[0].word,
            meta: { word: words[0].word, ipa: words[0].ipa, def: words[0].def, ex: words[0].ex, vi: words[0].vi, topic: unit.vocab, unit: unitNum, unitTitle: unit.title, mode, level },
            multi: words.map((w: any) => ({ content: w.word, meta: { word: w.word, ipa: w.ipa || '', def: w.def, ex: w.ex, vi: w.vi, topic: unit.vocab, unit: unitNum, unitTitle: unit.title, mode, level } }))
          };
        }
      },
      {
        // Ngữ pháp — bài giảng về grammar focus của unit
        type: 'grammar',
        build: async () => {
          const gramFocus = unit.grammar;
          const p = `Bạn là giáo viên tiếng Anh. Soạn bài giảng ngữ pháp CHI TIẾT về: "${gramFocus}" (cấp ${level}).\nNgữ cảnh ứng dụng: ${unit.scenario}.\n\nGiải thích bằng tiếng Việt, ngắn gọn:\n1. **Khái niệm & Cấu trúc**: Công thức + ví dụ.\n2. **Cách dùng trong ${unit.title}**: 2-3 câu ví dụ thực tế với scenario.\n3. **Phỏng vấn**: Cách dùng grammar này khi phỏng vấn xin việc.\n4. **Quiz** (3 câu):\nQ1: ...\nA) ... B) ... C) ...\nANSWER: [A/B/C]\n\nQ2: ...\nA) ... B) ... C) ...\nANSWER: [A/B/C]\n\nQ3: ...\nA) ... B) ... C) ...\nANSWER: [A/B/C]`;
          const raw = await askAI(p, aiModel);
          if (!raw?.trim()) return null;
          return { content: raw, meta: { topic: `Bài ${unitNum}: ${unit.title} — Ngữ pháp: ${gramFocus}`, level, mode, unit: unitNum, unitTitle: unit.title } };
        }
      },
    ];

    const TOTAL = 6;
    for (const skill of skills) {
      if (batchStopRef.current) break;
      setBatchProgress(`Bài ${unitNum} — ${skill.type}`);
      try {
        const r = await skill.build();
        if (!r) { failures.push(skill.type); continue; }
        const items = (r as any).multi || [{ content: r.content, meta: r.meta }];
        for (const item of items) {
          const saved = await fetch('/api/english', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: skill.type, content: item.content, metadata: item.meta })
          }).then(res => res.json());
          if (saved?.id) made++;
        }
      } catch (e) { failures.push(`${skill.type}: ${String(e)}`); }
    }

    await loadHistory();
    setBatchRunning(false); setBatchProgress('');
    if (batchStopRef.current) setBatchMsg(`⏸ Đã dừng. Tạo ${made}/${TOTAL} mục cho Bài ${unitNum}.`);
    else if (failures.length) setBatchMsg(`✅ Bài ${unitNum} (${unit.title}): ${made} mục (6 kỹ năng). Lỗi: ${failures.join(', ')}`);
    else setBatchMsg(`✅ Bài ${unitNum}: ${unit.title} — đủ 6 kỹ năng (Nghe/Nói/Viết/Đọc + 10 từ vựng + Ngữ pháp).`);
  }

  // Tạo 10 bài liên tục (mỗi bài đủ 6 kỹ năng)
  async function gen10Units() {
    if (batchRunning) { batchStopRef.current = true; return; }
    if (mode === 'all') { alert('Vui lòng chọn mode cụ thể trước'); return; }
    const level = listenLevel;
    const units = UNIT_CURRICULUM[level] || [];
    if (units.length === 0) { alert(`Chưa có giáo trình cho ${level}`); return; }

    setBatchRunning(true); batchStopRef.current = false; setBatchMsg('');
    let totalMade = 0;
    let unitsMade = 0;

    let currentHistory = history;

    for (let round = 0; round < 10 && !batchStopRef.current; round++) {
      // Tìm unit tiếp theo chưa học
      const doneUnits = new Set<number>();
      for (const h of currentHistory) {
        try {
          const m = JSON.parse(h.metadata || '{}');
          if (m.level === level && m.mode === mode && typeof m.unit === 'number') doneUnits.add(m.unit);
        } catch { /**/ }
      }
      const nextUnitIdx = units.findIndex((_, i) => !doneUnits.has(i + 1));
      if (nextUnitIdx === -1) { setBatchMsg(`✅ Đã hoàn thành toàn bộ ${units.length} bài cấp ${level}. Tạo ${unitsMade} bài mới.`); break; }

      const unitNum = nextUnitIdx + 1;
      const unit = units[nextUnitIdx];
      setBatchProgress(`Bài ${unitNum}/${Math.min(unitsMade + 10, units.length)}: ${unit.title}`);

      const mDesc = MODES.find(m2 => m2.id === mode)?.desc || 'developer';
      const cefr = cefrHint(level);
      const unitCtx = `\n\nĐây là BÀI ${unitNum} của giáo trình ${level}.\nChủ đề: ${unit.title}\nGrammar focus: ${unit.grammar}\nVocab focus: ${unit.vocab}\nScenario: ${unit.scenario}`;

      const skills = [
        { type: 'listen', build: async () => { const p = `Generate an English listening exercise (4-6 sentences) for ${level} learner. Context: ${mDesc}.${unitCtx}${cefr}\nMUST use the grammar/vocab focus. Realistic dialogue/monologue.\nReturn JSON ONLY:\n{"title":"...","en":"...","vi":"...","vocab":[{"w":"word","m":"nghĩa"}]}`; const raw = await askAI(p, aiModel); const m = raw?.match(/\{[\s\S]*\}/); if (!m) return null; const d = JSON.parse(m[0]); if (!d.en) return null; return { content: d.en, meta: { title: `Bài ${unitNum}: ${unit.title} — Nghe`, vi: d.vi, vocab: d.vocab, topic: unit.scenario, level, mode, unit: unitNum, unitTitle: unit.title } }; } },
        { type: 'speak', build: async () => { const p = `Give ONE English speaking question for ${level} learner. Context: ${mDesc}.${unitCtx}${cefr}\nQuestion phải khớp scenario & grammar focus.\nReply with the question ONLY.`; const t = await askAI(p, aiModel); if (!t?.trim()) return null; return { content: '', meta: { topic: t.trim(), level, mode, unit: unitNum, unitTitle: unit.title, title: `Bài ${unitNum}: ${unit.title} — Nói` } }; } },
        { type: 'writing', build: async () => { const p = `Give ONE English writing prompt for ${level} learner. Context: ${mDesc}.${unitCtx}${cefr}\nPrompt phải khớp scenario.\nReply with the prompt ONLY.`; const t = await askAI(p, aiModel); if (!t?.trim()) return null; return { content: '', meta: { prompt: t.trim(), level, mode, unit: unitNum, unitTitle: unit.title, title: `Bài ${unitNum}: ${unit.title} — Viết` } }; } },
        { type: 'reading', build: async () => { const wordRange = level === 'A1' ? '50-80' : level === 'A2' ? '80-120' : level === 'B1' ? '150-200' : level === 'B2' ? '200-280' : '280-380'; const p = `Create an English reading passage for ${level} learner. Context: ${mDesc}.${unitCtx}${cefr}\nMUST use the grammar/vocab focus.\nReturn JSON ONLY:\n{"title":"...","body":"4-6 paragraphs \\n\\n separated, ${wordRange} words","questions":[{"q":"...","options":["A","B","C","D"],"answer":0},{"q":"...","options":["A","B","C","D"],"answer":2},{"q":"...","options":["A","B","C","D"],"answer":1},{"q":"...","options":["A","B","C","D"],"answer":3}]}`; const raw = await askAI(p, aiModel); const m = raw?.match(/\{[\s\S]*\}/); if (!m) return null; const d = JSON.parse(m[0]); if (!d.body) return null; return { content: d.body, meta: { title: `Bài ${unitNum}: ${unit.title} — Đọc`, level, topic: unit.scenario, questions: d.questions, mode, unit: unitNum, unitTitle: unit.title } }; } },
        { type: 'vocab', build: async () => { const p = `Give 10 useful English vocabulary words for a ${level} learner. Topic: "${unit.vocab}". Context: ${mDesc}.${unitCtx}\nFocus on words that appear in this unit's grammar/scenario.\nReturn JSON array ONLY: [{"word":"...","ipa":"...","def":"short English definition","ex":"Example sentence using the grammar focus","vi":"nghĩa tiếng Việt"}]`; const raw = await askAI(p, aiModel); const m = raw?.match(/\[[\s\S]*\]/); if (!m) return null; const words = JSON.parse(m[0]); if (!words?.length) return null; return { content: words[0].word, meta: { word: words[0].word, ipa: words[0].ipa, def: words[0].def, ex: words[0].ex, vi: words[0].vi, topic: unit.vocab, unit: unitNum, unitTitle: unit.title, mode, level }, multi: words.map((w: any) => ({ content: w.word, meta: { word: w.word, ipa: w.ipa || '', def: w.def, ex: w.ex, vi: w.vi, topic: unit.vocab, unit: unitNum, unitTitle: unit.title, mode, level } })) }; } },
        { type: 'grammar', build: async () => { const gramFocus = unit.grammar; const p = `Bạn là giáo viên tiếng Anh. Soạn bài giảng ngữ pháp CHI TIẾT về: "${gramFocus}" (cấp ${level}).\nNgữ cảnh ứng dụng: ${unit.scenario}.\n\nGiải thích bằng tiếng Việt, ngắn gọn:\n1. **Khái niệm & Cấu trúc**: Công thức + ví dụ.\n2. **Cách dùng trong ${unit.title}**: 2-3 câu ví dụ thực tế với scenario.\n3. **Phỏng vấn**: Cách dùng grammar này khi phỏng vấn xin việc.\n4. **Quiz** (3 câu):\nQ1: ...\nA) ... B) ... C) ...\nANSWER: [A/B/C]\n\nQ2: ...\nA) ... B) ... C) ...\nANSWER: [A/B/C]\n\nQ3: ...\nA) ... B) ... C) ...\nANSWER: [A/B/C]`; const raw = await askAI(p, aiModel); if (!raw?.trim()) return null; return { content: raw, meta: { topic: `Bài ${unitNum}: ${unit.title} — Ngữ pháp: ${gramFocus}`, level, mode, unit: unitNum, unitTitle: unit.title } }; } },
      ];

      for (const skill of skills) {
        if (batchStopRef.current) break;
        setBatchProgress(`Bài ${unitNum} — ${skill.type}`);
        try {
          const r = await skill.build();
          if (!r) continue;
          const items = (r as any).multi || [{ content: r.content, meta: r.meta }];
          for (const item of items) {
            const saved = await fetch('/api/english', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: skill.type, content: item.content, metadata: item.meta })
            }).then(res => res.json());
            if (saved?.id) totalMade++;
          }
        } catch { /**/ }
      }
      unitsMade++;
      currentHistory = await loadHistory();
    }

    setBatchRunning(false); setBatchProgress('');
    if (batchStopRef.current) setBatchMsg(`⏸ Đã dừng sau ${unitsMade} bài.`);
    else setBatchMsg(`✅ Đã tạo ${unitsMade} bài (${totalMade} mục) đủ 6 kỹ năng.`);
  }

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
Context: ${modeDesc}${avoidList}${cefrHint(listenLevel)}

Requirements:
- Natural conversational English MATCHING ${listenLevel} grammar/vocab
- Include 3-4 useful vocabulary words appropriate for ${listenLevel}
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
    const loop = text === listenText;
    do {
      await speak(text, globalSpeed, globalVoice, globalTtsProvider);
      if (loop && listenLoopingRef.current) {
        await new Promise(r => setTimeout(r, 1000));
      }
    } while (loop && listenLoopingRef.current);
    setPlaying(false);
  }

  function stopPlayText() {
    setPlaying(false);
    setListenLooping(false);
    listenLoopingRef.current = false;
    stopTTS();
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

    const p = `Give ONE short English speaking question for ${spkLevel} level learner: ${modeDesc}.${avoidList}${cefrHint(spkLevel)}

Question phải dùng grammar/vocab chuẩn ${spkLevel}, không quá khó cũng không quá dễ.
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
    const raw = await askAI(`Answer this English question at ${spkLevel} level in 3-4 natural sentences: "${spkTopic}"${directionText}${cefrHint(spkLevel)}

**English:** (3-4 sentences, grammar & vocab phải đúng chuẩn ${spkLevel})
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
    const raw = await askAI(`Write a concise sample response at ${writeLevel} level (80-120 words) for: "${writePrompt}"${directionText}${cefrHint(writeLevel)}

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
      skipAutoLoadRef.current = true;
      if (spkRecordId) {
        await fetch('/api/english', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: spkRecordId, content: transcript, metadata: { topic: spkTopic, feedback: fb, sample: spkSample, mode, level: spkLevel } }),
        });
        loadHistory();
      } else {
        const d2 = await saveToDb('speak', transcript, { topic: spkTopic, feedback: fb, sample: spkSample, level: spkLevel }, mode);
        if (d2?.id) { setSpkRecordId(d2.id); loadHistory(); }
      }
    }
    setSpkLoading(false);
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

    const p = `Give ONE English writing prompt for ${writeLevel} level learner: ${modeDesc}.${avoidList}${cefrHint(writeLevel)}

Prompt phù hợp với grammar/vocab chuẩn ${writeLevel}.
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
      skipAutoLoadRef.current = true;
      if (writeRecordId) {
        await fetch('/api/english', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: writeRecordId, content: writeText, metadata: { prompt: writePrompt, feedback: fb, sample: writeSample, words: writeText.split(/\s+/).filter(Boolean).length, mode, level: writeLevel } }),
        });
        loadHistory();
      } else {
        const d2 = await saveToDb('writing', writeText, { prompt: writePrompt, feedback: fb, sample: writeSample, words: writeText.split(/\s+/).filter(Boolean).length, level: writeLevel }, mode);
        if (d2?.id) { setWriteRecordId(d2.id); loadHistory(); }
      }
    }
    setWriteLoading(false);
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

    const wordRange = readLevel === 'A1' ? '50-80' : readLevel === 'A2' ? '80-120' : readLevel === 'B1' ? '150-200' : readLevel === 'B2' ? '200-280' : '280-380';
    const p = `You are an English reading teacher. Create a reading passage for a Vietnamese learner. Context: ${modeDesc}.
Level: ${readLevel}
Topic: ${topicToUse}${avoidList}${cefrHint(readLevel)}

Return JSON ONLY (no markdown code blocks, just raw json):
{"title":"...","body":"4-6 paragraphs separated by \\n\\n, ${wordRange} words, grammar/vocab đúng chuẩn ${readLevel}","questions":[{"q":"...","options":["A","B","C","D"],"answer":0},{"q":"...","options":["A","B","C","D"],"answer":2},{"q":"...","options":["A","B","C","D"],"answer":1},{"q":"...","options":["A","B","C","D"],"answer":3}]}`;

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

      {/* Batch + Admin */}
      {['curriculum', 'listen', 'speak', 'write', 'read', 'vocab', 'grammar'].includes(tab) && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <button
            className={`btn ${batchRunning ? 'btn-danger-soft' : 'btn-premium'}`}
            style={{ flex: '1 1 0', minWidth: 140, minHeight: 48, fontSize: 14, lineHeight: 1.25, whiteSpace: 'normal', wordBreak: 'break-word' }}
            onClick={genNextUnit}
            title="Tạo Bài tiếp theo theo giáo trình CEFR — Nghe/Nói/Viết/Đọc + 10 từ vựng + Ngữ pháp"
          >
            {batchRunning ? `⏸ ${batchProgress || 'Dừng'}` : '📚 Tạo Bài tiếp theo'}
          </button>
          <button
            className={`btn ${batchRunning ? 'btn-danger-soft' : 'btn-secondary'}`}
            style={{ flex: '1 1 0', minWidth: 140, minHeight: 48, fontSize: 14, lineHeight: 1.25, whiteSpace: 'normal', wordBreak: 'break-word' }}
            onClick={gen10Units}
            title="Tạo 10 bài liên tiếp theo giáo trình, mỗi bài đủ 6 kỹ năng"
          >
            {batchRunning ? `⏸ Dừng ${batchProgress}` : '🚀 Tạo 10 bài'}
          </button>
          {/* <button
            className={`btn ${batchRunning ? 'btn-danger-soft' : 'btn-secondary'}`}
            style={{ flex: '1 1 180px', minWidth: 0, minHeight: 48, fontSize: 13, lineHeight: 1.25, whiteSpace: 'normal', wordBreak: 'break-word' }}
            onClick={genBatch}
            title="Tạo 10 bài cho tab hiện tại (không theo giáo trình)"
          >
            {batchRunning ? `⏸ Dừng ${batchProgress}` : `🚀 10 ${tab === 'listen' ? 'bài Nghe' : tab === 'speak' ? 'bài Nói' : tab === 'write' ? 'bài Viết' : tab === 'read' ? 'bài Đọc' : tab === 'vocab' ? 'bộ Từ vựng' : 'bài Ngữ pháp'}`}
          </button> */}
        </div>
      )}
      {batchMsg && (() => {
        const isSuccess = batchMsg.startsWith('✅');
        const isPaused = batchMsg.startsWith('⏸');
        const color = isSuccess ? '#3fb950' : isPaused ? '#d29922' : '#f85149';
        const bg = isSuccess ? '#0a1a0d' : isPaused ? '#1a1408' : '#1a0a0a';
        return <div style={{ background: bg, border: `1px solid ${color}`, borderRadius: 8, padding: 10, marginBottom: 16, color, fontSize: 13 }}>{batchMsg}</div>;
      })()}

      <div className="desktop-main-side">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, minWidth: 0 }}>
          {/* ── CURRICULUM ── */}
          {tab === 'curriculum' && (
            <CurriculumTab
              history={history}
              loadLesson={loadLesson}
              deleteUnit={deleteUnit}
              historyLoading={historyLoading}
            />
          )}

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
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-secondary" style={{ flex: 1, height: 42 }} onClick={genListenText} disabled={listenLoading}>
                      {listenLoading ? '⏳ Tạo...' : '🤖 Tạo mới'}
                    </button>
                    <button onClick={() => { const next = !listenLooping; setListenLooping(next); listenLoopingRef.current = next; }} className="btn btn-secondary" style={{ flex: 1, height: 42, background: listenLooping ? 'var(--accent)22' : undefined, color: listenLooping ? 'var(--accent)' : undefined, borderColor: listenLooping ? 'var(--accent)' : undefined }} title="Lặp lại">
                      {listenLooping ? '🔂 Lặp' : '🔁 Lặp'}
                    </button>
                    {playing ? (
                      <button className="btn btn-danger-soft" style={{ flex: 1, height: 42 }} onClick={stopPlayText}>
                        ⏸ Dừng
                      </button>
                    ) : (
                      <button className="btn btn-premium" style={{ flex: 1, height: 42 }} onClick={() => playText()} disabled={!listenText}>
                        ▶ Phát
                      </button>
                    )}
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
              vocabRecordId={vocabRecordId}
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
              history={history}
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
                  if (mode === 'all') return true;
                  const itemMode = (() => { try { return JSON.parse(h.metadata || '{}').mode || 'coder'; } catch { return 'coder'; } })();
                  return itemMode === mode;
                });
                if (!items.length && !historyLoading) return <div style={{ color: 'var(--muted)', fontSize: 13, padding: 10 }}>Chưa có bài lưu cho phần này.</div>;

                return items.map(item => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 8px', borderBottom: '1px solid var(--surface2)', cursor: 'pointer', borderRadius: 8, transition: 'background 0.15s' }}
                    onClick={() => loadLesson(item)}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>
                        {mapType === 'vocab' ? item.content : (
                          (mapType === 'speak' || mapType === 'writing' || mapType === 'grammar') ? (() => { try { const m = JSON.parse(item.metadata || '{}'); return m.topic || m.prompt || item.content.slice(0, 50) || 'Bài học'; } catch { return item.content.slice(0, 50); } })()
                            : (mapType === 'reading') ? (() => { try { return JSON.parse(item.metadata || '{}').title; } catch { return item.content.slice(0, 50); } })()
                              : item.content.slice(0, 60))}
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
                          } catch { return null; }
                        })()}
                        <span style={{
                          padding: '1px 6px', borderRadius: 4,
                          background: item.learnCount > 0 ? '#3fb95022' : 'var(--surface2)',
                          color: item.learnCount > 0 ? '#3fb950' : 'var(--muted)',
                          fontWeight: 700, fontSize: 9
                        }}>
                          {item.learnCount > 0 ? `✓ Lần ${item.learnCount}` : '⏳ Chưa học'}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {(mapType === 'speak' || mapType === 'writing' || mapType === 'reading' || mapType === 'grammar' || mapType === 'vocab') && (
                        <button onClick={(e) => { e.stopPropagation(); markLessonLearned(item.id); }} style={{ fontSize: 12, background: item.learnCount > 0 ? '#3fb95033' : 'var(--surface2)', border: '1px solid var(--border)', cursor: 'pointer', padding: '4px 8px', borderRadius: 6, color: item.learnCount > 0 ? '#3fb950' : 'var(--muted)', fontWeight: 700 }}>
                          ✓
                        </button>
                      )}
                      {mapType === 'vocab' && (
                        <button onClick={(e) => { e.stopPropagation(); speak(item.content, globalSpeed, globalVoice, globalTtsProvider); }} style={{ fontSize: 14, background: 'var(--accent)15', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6, color: 'var(--accent)' }}>
                          🔊
                        </button>
                      )}
                      
                      {deleteConfirmId === item.id ? (
                        <button 
                          onClick={async (e) => {
                            e.stopPropagation();
                            await fetch('/api/english', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id }) });
                            setDeleteConfirmId(null);
                            loadHistory();
                          }} 
                          style={{ fontSize: 10, color: '#fff', background: '#f85149', border: 'none', cursor: 'pointer', padding: '4px 10px', borderRadius: 6, fontWeight: 900 }}
                        >
                          XÓA?
                        </button>
                      ) : (
                        <button onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmId(item.id);
                          setTimeout(() => setDeleteConfirmId(prev => prev === item.id ? null : prev), 3000);
                        }} style={{ fontSize: 12, color: '#f85149', background: '#f8514915', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6, transition: 'all 0.15s' }} onMouseEnter={e => { e.currentTarget.style.background = '#f8514930' }} onMouseLeave={e => { e.currentTarget.style.background = '#f8514915' }}>
                          🗑
                        </button>
                      )}
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
