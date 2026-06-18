import { useMemo } from 'react';

const COLORS = [
  '#6d4aff', '#8a6bff', '#22c55e', '#2388ff',
  '#f59e0b', '#e11d48', '#06b6d4', '#ec4899',
];

interface ConfettiPiece {
  id: number;
  left: number;
  drift: number;
  spin: number;
  dur: number;
  delay: number;
  w: number;
  h: number;
  color: string;
  rounded: boolean;
}

/**
 * Chuva de confete em tela cheia. Cada peça cai com deriva/rotação/cor/duração
 * aleatórias, usando o keyframe `confetti-fall` (definido em index.css). É só
 * visual: `pointer-events-none` e auto-removível pelo pai (montar/desmontar).
 */
export function Confetti({ count = 150 }: { count?: number }) {
  const pieces = useMemo<ConfettiPiece[]>(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        drift: (Math.random() * 2 - 1) * 16,
        spin: 360 + Math.random() * 1080,
        dur: 2.6 + Math.random() * 2.4,
        delay: Math.random() * 0.7,
        w: 6 + Math.random() * 8,
        h: 8 + Math.random() * 8,
        color: COLORS[i % COLORS.length],
        rounded: Math.random() > 0.5,
      })),
    [count],
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-[120] overflow-hidden" aria-hidden="true">
      {pieces.map((p) => {
        const style = {
          position: 'absolute',
          top: 0,
          left: `${p.left}vw`,
          width: `${p.w}px`,
          height: `${p.h}px`,
          background: p.color,
          borderRadius: p.rounded ? '9999px' : '2px',
          '--cf-drift': `${p.drift}vw`,
          '--cf-spin': `${p.spin}deg`,
          animation: `confetti-fall ${p.dur}s linear ${p.delay}s forwards`,
        } as React.CSSProperties;
        return <span key={p.id} style={style} />;
      })}
    </div>
  );
}
