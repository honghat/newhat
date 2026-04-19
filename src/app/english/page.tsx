'use client';

import dynamic from 'next/dynamic';

const EnglishContent = dynamic(() => import('./EnglishContent'), { 
  ssr: false,
  loading: () => (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
      Loading English Learning...
    </div>
  )
});

export default function EnglishPage() {
  return <EnglishContent />;
}
