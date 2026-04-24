'use client';
import type { Dispatch, SetStateAction } from 'react';

const GRAMMAR_TOPICS_DEFAULT = [
  'Thì hiện tại đơn', 'Thì hiện tại tiếp diễn', 'Thì hiện tại hoàn thành',
  'Thì quá khứ đơn', 'Thì tương lai đơn',
  'Câu điều kiện loại 1', 'Câu điều kiện loại 2', 'Câu bị động',
  'Câu gián tiếp', 'Mệnh đề quan hệ', 'So sánh', 'Giới từ',
];

interface Props {
  grammarTopics: string[];
  grammarTopic: string; setGrammarTopic: (v: string) => void;
  grammarCustomTopic: string; setGrammarCustomTopic: (v: string) => void;
  grammarLoading: boolean;
  grammarLesson: string | null;
  grammarRecordId: number | null;
  grammarQuizAnswers: string[];
  grammarUserAnswers: string[]; setGrammarUserAnswers: Dispatch<SetStateAction<string[]>>;
  grammarSubmitted: boolean; setGrammarSubmitted: (v: boolean) => void;
  genGrammarLesson: () => void;
  markLessonLearned: (id: number, score?: number, total?: number) => void;
  parseMarkdown: (text: string) => string;
}

export default function GrammarTab({
  grammarTopics = GRAMMAR_TOPICS_DEFAULT,
  grammarTopic, setGrammarTopic,
  grammarCustomTopic, setGrammarCustomTopic,
  grammarLoading, grammarLesson, grammarRecordId,
  grammarQuizAnswers, grammarUserAnswers, setGrammarUserAnswers,
  grammarSubmitted, setGrammarSubmitted,
  genGrammarLesson, markLessonLearned, parseMarkdown,
}: Props) {
  return (
    <div className="fade-in">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title">📐 Luyện Ngữ Pháp AI</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {grammarTopics.map(t => (
            <button key={t} onClick={() => { setGrammarTopic(t); setGrammarCustomTopic(''); }} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderColor: grammarTopic === t && !grammarCustomTopic ? 'var(--accent)' : 'var(--border)', background: grammarTopic === t && !grammarCustomTopic ? 'var(--accent)22' : 'transparent', color: grammarTopic === t && !grammarCustomTopic ? 'var(--accent)' : 'var(--muted)' }}>{t}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            className="input"
            placeholder="Hoặc tự nhập chủ đề (VD: Câu chẻ, Đảo ngữ loại 3...)"
            value={grammarCustomTopic}
            onChange={e => {
              setGrammarCustomTopic(e.target.value);
              if (e.target.value) setGrammarTopic(e.target.value);
            }}
            style={{ flex: 1, marginBottom: 0, fontSize: 13 }}
          />
        </div>

        <button className="btn btn-primary" style={{ width: '100%' }} onClick={genGrammarLesson} disabled={grammarLoading || (grammarCustomTopic === '' && !grammarTopic)}>
          {grammarLoading ? '⏳ AI đang soạn bài...' : `📖 Học về ${grammarCustomTopic || grammarTopic}`}
        </button>
      </div>

      {grammarLesson && (
        <div className="card fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent)' }}>{grammarTopic}</div>
            {grammarRecordId && (
              <button onClick={() => {
                const score = grammarSubmitted ? grammarUserAnswers.filter((a, i) => a === grammarQuizAnswers[i]).length : undefined;
                const total = grammarSubmitted ? grammarQuizAnswers.length : undefined;
                markLessonLearned(grammarRecordId, score, total);
              }} style={{ fontSize: 11, color: 'var(--green)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>✓ Hoàn thành</button>
            )}
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text)' }} dangerouslySetInnerHTML={{ __html: parseMarkdown(grammarLesson.split(/Q1:|1\.\s*\[Question\]/)[0]) }} />

          {grammarQuizAnswers.length > 0 && (
            <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: 'var(--orange)' }}>🧠 Bài tập củng cố</div>
              {grammarQuizAnswers.map((_, i) => {
                const qNum = i + 1;
                const quizPart = grammarLesson.split(/Q\d+:/)[qNum];
                if (!quizPart) return null;
                const question = quizPart.split('A)')[0].trim();
                const optA = quizPart.match(/A\)\s*([^B\n]+)/)?.[1]?.trim() || '';
                const optB = quizPart.match(/B\)\s*([^C\n]+)/)?.[1]?.trim() || '';
                const optC = quizPart.match(/C\)\s*([^\n]+)/)?.[1]?.trim() || '';
                const opts = [optA, optB, optC];

                return (
                  <div key={i} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{qNum}. {question}</div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {['A', 'B', 'C'].map((opt, oi) => {
                        const isSelected = grammarUserAnswers[i] === opt;
                        const isCorrect = grammarQuizAnswers[i] === opt;
                        let bg = 'var(--surface2)', border = 'var(--border)', color = 'var(--text)';
                        if (grammarSubmitted) {
                          if (isCorrect) { bg = '#0d1a0e'; border = '#3fb950'; color = '#3fb950'; }
                          else if (isSelected) { bg = '#1a0a0a'; border = '#f85149'; color = '#f85149'; }
                        } else if (isSelected) { bg = 'var(--accent)22'; border = 'var(--accent)'; }

                        return (
                          <button key={opt} onClick={() => !grammarSubmitted && setGrammarUserAnswers(prev => { const n = [...prev]; n[i] = opt; return n; })}
                            style={{ textAlign: 'left', padding: '10px 14px', borderRadius: 8, border: `1px solid ${border}`, background: bg, color, fontSize: 13, cursor: 'pointer' }}>
                            {opt}) {opts[oi]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {!grammarSubmitted ? (
                <button className="btn btn-green" style={{ width: '100%', marginTop: 10 }} onClick={() => setGrammarSubmitted(true)} disabled={grammarUserAnswers.some(a => !a)}>Nộp bài</button>
              ) : (
                <div style={{ textAlign: 'center', padding: 12, background: 'var(--surface2)', borderRadius: 8, marginTop: 10 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--green)' }}>
                    Kết quả: {grammarUserAnswers.filter((a, i) => a === grammarQuizAnswers[i]).length} / {grammarQuizAnswers.length}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
