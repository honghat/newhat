'use client';
import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';

const WORK_MIN = 50, BREAK_MIN = 10;

let _actx: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  try {
    if (!_actx || _actx.state === 'closed') {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      _actx = new AC();
    }
    return _actx;
  } catch { return null; }
}

export function unlockAudio() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

async function beep(type: 'work' | 'break') {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') await ctx.resume();
    (type === 'work' ? [523, 659, 784] : [784, 659, 523]).forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.4, ctx.currentTime + i * 0.25);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.25 + 0.4);
      o.start(ctx.currentTime + i * 0.25);
      o.stop(ctx.currentTime + i * 0.25 + 0.4);
    });
  } catch { /**/ }
}

interface TimerCtx {
  isWork: boolean; secs: number; running: boolean; session: number;
  todaySessions: number; toggle: ()=>void; reset: ()=>void; switchMode: (w:boolean)=>void;
}

const Ctx = createContext<TimerCtx|null>(null);
export const useTimer = () => { const c = useContext(Ctx); if (!c) throw new Error('useTimer'); return c; };

export function TimerProvider({ children }: { children: ReactNode }) {
  const [isWork, setIsWork] = useState(true);
  const [secs, setSecs] = useState(WORK_MIN*60);
  const [running, setRunning] = useState(false);
  const [session, setSession] = useState(0);
  const [todaySessions, setTodaySessions] = useState(0);
  const ref = useRef<NodeJS.Timeout|null>(null);
  const today = new Date().toISOString().slice(0,10);

  // Load from DB on mount
  useEffect(() => {
    async function init() {
      try {
        const res = await fetch(`/api/pomodoro?date=${today}`);
        const data = await res.json();
        setTodaySessions(data.sessions || 0);

        if (data.currentEndTime && data.currentEndTime > Date.now()) {
          const rem = Math.max(0, Math.floor((data.currentEndTime - Date.now()) / 1000));
          if (rem > 0) {
            setIsWork(data.currentMode === 'work');
            setSecs(rem);
            setRunning(true);
            return;
          }
        }
        setRunning(true); // fresh start
      } catch { setRunning(true); }
    }
    init();
  }, [today]);

  // Save state to DB when timer state changes
  const saveState = useCallback(async (w: boolean, r: boolean) => {
    const endTime = r ? Date.now() + (w ? WORK_MIN : BREAK_MIN) * 60 * 1000 : 0;
    try {
      await fetch('/api/pomodoro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: today,
          sessions: todaySessions,
          currentEndTime: endTime,
          currentMode: w ? 'work' : 'break',
        }),
      });
    } catch { /**/ }
  }, [today, todaySessions]);

  const saveSessions = useCallback(async (n:number) => {
    try {
      await fetch('/api/pomodoro',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date:today,sessions:n,currentEndTime:0,currentMode:'work'})});
    } catch { /**/ }
  }, [today]);

  const switchMode = useCallback((toWork:boolean) => {
    setIsWork(toWork); setSecs(toWork?WORK_MIN*60:BREAK_MIN*60); setRunning(false);
    if (ref.current) clearInterval(ref.current);
    saveState(toWork, false);
  }, [saveState]);

  // Save when running state changes
  useEffect(() => {
    saveState(isWork, running);
  }, [running, isWork, saveState]);

  useEffect(() => {
    if (!running) return;
    ref.current = setInterval(()=>{
      setSecs(s=>{
        if (s<=1) {
          if (isWork) {
            beep('work');
            setTodaySessions(p=>{const n=p+1; saveSessions(n); return n;});
            setSession(p=>p+1);
            const d = new Date().toISOString().slice(0,10);
            fetch('/api/logs', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ date: d, addHours: WORK_MIN/60, addTopic: 'Pomodoro' }) });
            switchMode(false);
          } else { beep('break'); switchMode(true); }
          return 0;
        }
        return s-1;
      });
    },1000);
    return ()=>{ if(ref.current) clearInterval(ref.current); };
  },[running,isWork,saveSessions,switchMode]);

  useEffect(() => {
    if (running) {
      const mm = String(Math.floor(secs/60)).padStart(2,'0');
      const ss = String(secs%60).padStart(2,'0');
      document.title = `${isWork?'🔴':'🟢'} ${mm}:${ss} — NewHat`;
    } else {
      document.title = 'NewHat — 60 Ngày Thay Đổi';
    }
  },[secs, running, isWork]);

  return (
    <Ctx.Provider value={{ isWork, secs, running, session, todaySessions,
      toggle: ()=>{ unlockAudio(); setRunning(r=>!r); },
      reset: ()=>{ setRunning(false); setSecs(isWork?WORK_MIN*60:BREAK_MIN*60); },
      switchMode,
    }}>
      {children}
    </Ctx.Provider>
  );
}
