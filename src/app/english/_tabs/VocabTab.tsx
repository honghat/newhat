'use client';
import type { Dispatch, SetStateAction } from 'react';

interface EngLesson { id: number; type: string; content: string; metadata: string; completed: boolean; learnCount: number; createdAt: string; }
interface Card { word: string; def: string; ex: string; vi: string; }

interface Props {
  cards: Card[];
  setCards: Dispatch<SetStateAction<Card[]>>;
  cardIdx: number;
  setCardIdx: Dispatch<SetStateAction<number>>;
  flipped: boolean;
  setFlipped: Dispatch<SetStateAction<boolean>>;
  known: number[];
  vocabLoading: boolean;
  loadVocab: () => void;
  history: EngLesson[];
  mode: string;
  speak: (text: string, speed?: number, voice?: string, server?: string) => void;
  globalSpeed: number;
  globalVoice: string;
  globalTtsProvider: string;
  markLessonLearned: (id: number) => void;
}

export default function VocabTab({
  cards, setCards, cardIdx, setCardIdx, flipped, setFlipped, known,
  vocabLoading, loadVocab,
  history, mode,
  speak, globalSpeed, globalVoice, globalTtsProvider,
  markLessonLearned,
}: Props) {
  const card = cards[cardIdx];

  const findNeighbor = (dir: -1 | 1) => {
    if (!card) return;
    const vocabHistory = history.filter(h => h.type === 'vocab' && (() => {
      try {
        const itemMode = JSON.parse(h.metadata || '{}').mode || 'coder';
        return itemMode === mode;
      } catch { return false; }
    })());
    const currentIdx = vocabHistory.findIndex(h => h.content === card.word);
    const targetIdx = currentIdx + dir;
    if (targetIdx < 0 || targetIdx >= vocabHistory.length) return;
    const item = vocabHistory[targetIdx];
    try {
      const m = JSON.parse(item.metadata || '{}');
      setCards([{ word: item.content, def: m.def, ex: m.ex, vi: m.vi }]);
      setCardIdx(0);
      setFlipped(false);
    } catch { /**/ }
  };

  return (
    <div className="desktop-2col">
      <div>
        <button className="btn btn-green" style={{ width: '100%', marginBottom: 16, height: 46 }} onClick={loadVocab} disabled={vocabLoading}>
          {vocabLoading ? '⏳ AI đang tạo từ...' : '🤖 AI tạo 10 từ mới — lưu vào DB'}
        </button>

        {cards.length > 0 && card && (
          <>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, textAlign: 'center' }}>
              {cardIdx + 1}/{cards.length} • <span style={{ color: 'var(--green)' }}>{known.length} đã biết</span>
            </div>
            <div className="flashcard-container" style={{ marginBottom: 12 }}>
              <div className={`flashcard${flipped ? ' flipped' : ''}`} onClick={() => setFlipped(f => !f)}>
                <div className="flashcard-front">
                  <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--accent)', marginBottom: 10 }}>{card.word}</div>
                  <button onClick={e => { e.stopPropagation(); speak(card.word, globalSpeed, globalVoice, globalTtsProvider); }} style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>🔊 Phát âm</button>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>Bấm để xem nghĩa</div>
                </div>
                <div className="flashcard-back">
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, textAlign: 'center' }}>{card.def}</div>
                  <div style={{ fontSize: 12, color: 'var(--orange)', fontStyle: 'italic', marginBottom: 8, textAlign: 'center' }}>&quot;{card.ex}&quot;</div>
                  <div style={{ fontSize: 16, color: 'var(--green)', fontWeight: 700 }}>🇻🇳 {card.vi}</div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setFlipped(false); findNeighbor(-1); }}>← Trước</button>

              {cardIdx === cards.length - 1 && (
                <button onClick={() => {
                  cards.forEach((c) => {
                    const item = history.find(h => h.type === 'vocab' && h.content === c.word);
                    if (item) markLessonLearned(item.id);
                  });
                }} style={{ flex: 2, borderRadius: 8, background: '#3fb950', color: '#000', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: '0 2px 8px rgba(63,185,80,0.3)' }}>
                  ✓ Đã học xong!
                </button>
              )}

              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setFlipped(false); findNeighbor(1); }}>Tiếp →</button>
            </div>
          </>
        )}
      </div>
      <div />
    </div>
  );
}
