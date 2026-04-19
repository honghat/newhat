'use client';
import dynamic from 'next/dynamic';

const LearnPageClient = dynamic(() => import('./LearnPage'), { 
  ssr: false,
  loading: () => (
    <div style={{ padding: 20, color: 'var(--muted)', textAlign: 'center' }}>
      🚀 Đang tải Learn AI...
    </div>
  )
});

export default function LearnPage() {
  return <LearnPageClient />;
}
