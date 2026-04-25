'use client';
import React, { useMemo, useState } from 'react';

interface EngLesson {
  id: number;
  type: string;
  content: string;
  metadata: string;
  completed: boolean;
  learnCount: number;
  createdAt: string;
  nextReviewAt?: string | null;
}

interface Props {
  history: EngLesson[];
  loadLesson: (item: EngLesson) => void;
  deleteUnit: (unitNum: number, level: string) => void;
  historyLoading: boolean;
}

const SKILL_TYPES = [
  { id: 'listen',  label: '🎧 Nghe',     dbType: 'listen' },
  { id: 'speak',   label: '🎤 Nói',      dbType: 'speak' },
  { id: 'read',    label: '📖 Đọc',      dbType: 'reading' },
  { id: 'write',   label: '✍️ Viết',     dbType: 'writing' },
  { id: 'vocab',   label: '📚 Từ vựng',  dbType: 'vocab' },
  { id: 'grammar', label: '📐 Ngữ pháp', dbType: 'grammar' },
] as const;

const LEVEL_COLORS: Record<string, string> = {
  A1: '#58a6ff',
  A2: '#3fb950',
  B1: '#d29922',
  B2: '#f78166',
  C1: '#d2a8ff',
};

function parseMeta(raw: string) {
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

function getTitle(item: EngLesson): string {
  const m = parseMeta(item.metadata);
  if (item.type === 'reading') return m.title || item.content.slice(0, 60);
  if (item.type === 'listen') return m.title || item.content.slice(0, 60);
  if (item.type === 'speak') return m.topic || item.content.slice(0, 60);
  if (item.type === 'writing') return m.prompt || m.topic || item.content.slice(0, 60);
  if (item.type === 'grammar') return m.topic || item.content.slice(0, 60);
  if (item.type === 'vocab') {
    try { const cards = JSON.parse(item.content); return `${cards.length} từ vựng`; } catch {}
    return item.content.slice(0, 40);
  }
  return item.content.slice(0, 60);
}

/** Nhóm bài theo metadata.unit (số bài AI đã tạo sẵn trong DB) */
export default function CurriculumTab({ history, loadLesson, deleteUnit, historyLoading }: Props) {
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set());
  const [hoveredUnit, setHoveredUnit] = useState<string | null>(null);
  const [deleteConfirmKey, setDeleteConfirmKey] = useState<string | null>(null);

  // ── Nhóm theo metadata.unit ──
  // Bài có unit → "Bài 1, Bài 2, ..."
  // Bài không có unit → nhóm "Học ngẫu nhiên"
  // Vocab: gom theo unit (kể cả từ riêng lẻ có unit trong metadata)
  type UnitGroup = {
    unitNum: number;
    unitTitle: string;
    level: string;
    skills: Partial<Record<string, EngLesson[]>>;
    latestAt: string;
  };

  const { unitGroups, randomLessons } = useMemo(() => {
    const unitMap = new Map<string, UnitGroup>();
    const random: EngLesson[] = [];

    for (const item of history) {
      const m = parseMeta(item.metadata);
      const unitNum = m.unit ? Number(m.unit) : 0;
      const level = m.level || '?';
      const itemMode = m.mode || 'other';

      if (unitNum === 0) {
        // Vocab đơn lẻ (tra từ) không cần hiện ở danh mục
        if (item.type === 'vocab' && (m.def || !m.unit)) continue;
        random.push(item);
        continue;
      }

      // Nhóm theo Mode + UnitNum để phân biệt giáo trình Coder/Giao tiếp/...
      const key = `${itemMode}|||${unitNum}`;
      if (!unitMap.has(key)) {
        unitMap.set(key, {
          unitNum,
          unitTitle: m.unitTitle || '',
          level: level !== '?' ? level : '',
          skills: {},
          latestAt: item.createdAt,
        });
      }
      const group = unitMap.get(key)!;

      // Cập nhật level/title nếu item có thông tin rõ ràng hơn
      if (level !== '?' && (!group.level || group.level === '?')) group.level = level;
      if (m.unitTitle && !group.unitTitle) group.unitTitle = m.unitTitle;

      // Gom vào skill type
      const skillType = item.type;
      if (!group.skills[skillType]) group.skills[skillType] = [];
      group.skills[skillType]!.push(item);

      if (new Date(item.createdAt) > new Date(group.latestAt)) {
        group.latestAt = item.createdAt;
      }
    }

    // Sort: Theo UnitNum
    const sorted = Array.from(unitMap.values()).sort((a, b) => a.unitNum - b.unitNum);

    return { unitGroups: sorted, randomLessons: random };
  }, [history]);

  // ── Nhóm học ngẫu nhiên ──
  const randomGroups = useMemo(() => {
    const groups: Partial<Record<string, EngLesson[]>> = {};
    for (const item of randomLessons) {
      if (!groups[item.type]) groups[item.type] = [];
      groups[item.type]!.push(item);
    }
    return groups;
  }, [randomLessons]);

  function toggleUnit(key: string) {
    setExpandedUnits(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (historyLoading) {
    return (
      <div className="card fade-in" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
        <div style={{ fontSize: 14 }}>Đang tải danh sách bài học...</div>
      </div>
    );
  }

  if (unitGroups.length === 0 && randomLessons.length === 0) {
    return (
      <div className="card fade-in" style={{ textAlign: 'center', padding: 48 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-main)', marginBottom: 8 }}>Chưa có bài học nào</div>
        <div style={{ fontSize: 14, color: 'var(--muted)', maxWidth: 400, margin: '0 auto' }}>
          Hãy chuyển sang các tab <strong>Nghe / Nói / Đọc / Viết / Từ vựng / Ngữ pháp</strong> và nhấn
          <strong> "Tạo Bài tiếp theo"</strong> để AI tạo bài học. Các bài sẽ tự động xuất hiện ở đây.
        </div>
      </div>
    );
  }

  // Hàm lấy bài "đại diện" cho skill (mới nhất)
  function getRepLesson(items: EngLesson[] | undefined): EngLesson | null {
    if (!items || items.length === 0) return null;
    // Cho vocab: lấy bài đầu tiên (batch vocab thường lưu từng từ)
    // Cho các skill khác: lấy bài mới nhất
    return items.reduce((best, cur) =>
      new Date(cur.createdAt) > new Date(best.createdAt) ? cur : best
    );
  }

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="card" style={{ padding: '24px' }}>
        <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <span style={{ fontSize: '24px' }}>🗂️</span>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--text-main)' }}>Danh mục bài học Tiếng Anh</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 500 }}>Nhóm theo từng bài học và kỹ năng</div>
          </div>
        </div>

        {/* ═══ Bài 1, Bài 2, ... (theo metadata.unit) ═══ */}
        {unitGroups.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
            {unitGroups.map((group) => {
              const key = `unit|||${group.level}|||${group.unitNum}`;
              const isExpanded = expandedUnits.has(key);
              const color = LEVEL_COLORS[group.level] || '#888';

              // Đếm skills đã có & đã học
              const skillsWithData = SKILL_TYPES.filter(s => {
                const items = group.skills[s.dbType];
                return items && items.length > 0;
              });
              const learnedSkills = skillsWithData.filter(s => {
                const items = group.skills[s.dbType];
                if (!items) return false;
                return items.some(i => i.learnCount > 0);
              });

              return (
                <div 
                  key={key} 
                  onMouseEnter={() => setHoveredUnit(key)}
                  onMouseLeave={() => setHoveredUnit(null)}
                  style={{
                    background: 'var(--surface2)',
                    border: `1px solid ${learnedSkills.length === SKILL_TYPES.length ? color + '44' : 'var(--border)'}`,
                    borderRadius: 12,
                    overflow: 'hidden',
                    transition: 'all 0.2s',
                    boxShadow: hoveredUnit === key ? '0 4px 12px rgba(0,0,0,0.2)' : 'none',
                    transform: hoveredUnit === key ? 'translateY(-1px)' : 'none'
                  }}
                >
                  {/* Unit header */}
                  <button
                    onClick={() => toggleUnit(key)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center',
                      gap: 12, padding: '14px 18px',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{
                      background: color, color: '#0d1117', borderRadius: 6,
                      padding: '3px 10px', fontWeight: 900, fontSize: 11, flexShrink: 0,
                      boxShadow: `0 0 10px ${color}44`
                    }}>{group.level || '?'}</span>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', color: 'var(--text-main)', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        Bài {group.unitNum}{group.unitTitle ? `: ${group.unitTitle}` : ''}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 500, marginTop: '2px' }}>
                        Hoàn thành: {learnedSkills.length}/{SKILL_TYPES.length} kỹ năng
                      </div>
                    </div>

                    {/* Progress dots */}
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginRight: '10px' }}>
                      {SKILL_TYPES.map(s => {
                        const items = group.skills[s.dbType];
                        const has = items && items.length > 0;
                        const done = has && items!.some(i => i.learnCount > 0);
                        return (
                          <div key={s.id} title={s.label} style={{
                            width: 10, height: 10, borderRadius: '3px',
                            background: done ? color : has ? color + '44' : 'var(--border)',
                            transition: 'all 0.2s',
                          }} />
                        );
                      })}
                    </div>
                    
                    {/* Nút xóa */}
                    {(hoveredUnit === key || deleteConfirmKey === key) && (
                      <div style={{ marginRight: '10px' }}>
                        {deleteConfirmKey === key ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteUnit(group.unitNum, group.level); setDeleteConfirmKey(null); }}
                            style={{
                              background: '#f85149', border: 'none',
                              cursor: 'pointer', borderRadius: 6,
                              padding: '5px 12px', color: '#fff', fontSize: 10, fontWeight: 900,
                              boxShadow: '0 4px 10px rgba(248,81,73,0.3)'
                            }}
                          >
                            XÓA BÀI {group.unitNum}?
                          </button>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirmKey(key); setTimeout(() => setDeleteConfirmKey(null), 3000); }}
                            style={{
                              background: 'var(--surface)', border: '1px solid var(--border)', 
                              cursor: 'pointer', borderRadius: 8, width: '34px', height: '34px',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: 'var(--red)', fontSize: '14px', transition: 'all 0.2s'
                            }}
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    )}

                    <span style={{ color: 'var(--muted)', fontSize: '14px', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>
                      ▼
                    </span>
                  </button>

                  {/* Skill buttons — expanded */}
                  {isExpanded && (
                    <div style={{
                      padding: '0 18px 18px',
                      display: 'flex', gap: 10, flexWrap: 'wrap',
                    }}>
                      <div style={{ width: '100%', height: '1px', background: 'var(--border)', marginBottom: '14px' }} />
                      {SKILL_TYPES.map(skill => {
                        const items = group.skills[skill.dbType];
                        const rep = getRepLesson(items);
                        
                        const vocabCount = skill.dbType === 'vocab' && items ? items.length : 0;
                        const done = items && items.some(i => i.learnCount > 0);
                        const now = Date.now();
                        const due = rep?.nextReviewAt && new Date(rep.nextReviewAt).getTime() <= now;

                        return (
                          <button
                            key={skill.id}
                            onClick={() => rep && loadLesson(rep)}
                            disabled={!rep}
                            style={{
                              padding: '10px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                              cursor: rep ? 'pointer' : 'not-allowed',
                              border: '1px solid',
                              borderColor: rep ? (done ? color : color + '44') : 'var(--border)',
                              background: rep ? (done ? color + '15' : 'transparent') : 'var(--surface)',
                              color: rep ? (done ? color : 'var(--text)') : 'var(--muted)',
                              transition: 'all 0.2s',
                              display: 'flex', alignItems: 'center', gap: '6px'
                            }}
                          >
                            <span>{skill.label.split(' ')[0]}</span>
                            <span>{skill.label.split(' ').slice(1).join(' ')}</span>
                            {vocabCount > 1 && <span style={{ fontSize: '10px', opacity: 0.7 }}>({vocabCount})</span>}
                            {done && <span style={{ color: 'var(--green)' }}>✓</span>}
                            {due && !done && <span>🔔</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ Nhóm học ngẫu nhiên ═══ */}
        {randomLessons.length > 0 && (
          <div style={{ marginTop: '32px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, marginBottom: '20px',
              padding: '0 4px'
            }}>
              <div style={{
                background: 'linear-gradient(135deg, #d29922, #f78166)',
                color: '#0d1117', borderRadius: '8px',
                padding: '4px 14px', fontWeight: 900, fontSize: '13px',
                boxShadow: '0 4px 12px rgba(210,153,34,0.3)'
              }}>🎲 Học ngẫu nhiên & Bổ trợ</div>
              <div style={{ color: 'var(--muted)', fontSize: '13px', fontWeight: 500 }}>
                {randomLessons.length} bài đã phân theo kỹ năng
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {SKILL_TYPES.map(skill => {
                const items = randomGroups[skill.dbType];
                if (!items || items.length === 0) return null;

                return (
                  <div key={skill.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', paddingLeft: '4px' }}>
                      {skill.label}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px' }}>
                      {items.map(item => {
                        const m = parseMeta(item.metadata);
                        const color = LEVEL_COLORS[m.level] || 'var(--accent)';
                        const done = item.learnCount > 0;
                        const rawTitle = getTitle(item);
                        const title = rawTitle.replace(/^Bài \d+:\s*/i, '');

                        return (
                          <button
                            key={item.id}
                            onClick={() => loadLesson(item)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '12px',
                              padding: '12px 14px', borderRadius: '12px',
                              background: 'var(--surface2)',
                              border: '1px solid var(--border)',
                              cursor: 'pointer', textAlign: 'left',
                              transition: 'all 0.15s',
                              position: 'relative', overflow: 'hidden'
                            }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = color + '66'}
                            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                          >
                            {done && <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '3px', background: 'var(--green)' }} />}
                            
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {title}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                {m.level && (
                                  <span style={{ fontSize: '10px', color: color, fontWeight: 800 }}>{m.level}</span>
                                )}
                                <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                                  {new Date(item.createdAt).toLocaleDateString('vi')}
                                </span>
                                {done && <span style={{ fontSize: '10px', color: 'var(--green)', fontWeight: 800 }}>✓ Đã học</span>}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
