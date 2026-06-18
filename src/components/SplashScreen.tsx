import { useEffect, useState } from 'react';

/**
 * Splash screen estilo Netflix + radar pulse.
 *
 * Fases (ms):
 *   0      → logo fade-in + scale + radar pulse começa
 *   800    → nome da app aparece
 *   1600   → crédito aparece
 *   3800   → tudo faz fade-out / scale-up (saída)
 *   4500   → componente desmonta (onDone)
 */
export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 50);
    const t2 = setTimeout(() => setPhase(2), 800);
    const t3 = setTimeout(() => setPhase(3), 1600);
    const t4 = setTimeout(() => setPhase(4), 3800);
    const t5 = setTimeout(() => onDone(), 4500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5); };
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0a0a12] transition-opacity duration-600"
      style={{ opacity: phase >= 4 ? 0 : 1, transitionDuration: '600ms' }}
    >
      {/* Radar pulse rings — ondas emanando do logo */}
      {phase >= 1 && phase < 4 && (
        <>
          <div className="absolute rounded-full border border-[#6D4AFF]/25 animate-[splash-ping_2.8s_ease-out_infinite]" style={{ width: 88, height: 88 }} />
          <div className="absolute rounded-full border border-[#6D4AFF]/20 animate-[splash-ping_2.8s_ease-out_0.9s_infinite]" style={{ width: 88, height: 88 }} />
          <div className="absolute rounded-full border border-[#6D4AFF]/15 animate-[splash-ping_2.8s_ease-out_1.8s_infinite]" style={{ width: 88, height: 88 }} />
        </>
      )}

      {/* Glow sutil atrás do logo */}
      <div
        className="absolute rounded-full transition-all duration-[1200ms]"
        style={{
          width: 280,
          height: 280,
          background: 'radial-gradient(circle, rgba(109,74,255,0.22) 0%, transparent 70%)',
          opacity: phase >= 1 && phase < 4 ? 1 : 0,
          transform: phase >= 4 ? 'scale(2.5)' : 'scale(1)',
        }}
      />

      {/* Logo */}
      <div
        className="relative transition-all duration-700 ease-out"
        style={{
          opacity: phase >= 1 ? 1 : 0,
          transform:
            phase >= 4
              ? 'scale(1.2) translateY(-8px)'
              : phase >= 1
                ? 'scale(1) translateY(0)'
                : 'scale(0.7) translateY(16px)',
        }}
      >
        <div className="w-[88px] h-[88px] rounded-[20px] bg-gradient-to-br from-[#9484FF] via-[#7456FF] to-[#5B3ED6] flex items-center justify-center shadow-2xl shadow-[#6D4AFF]/30">
          <svg width="50" height="50" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="40" stroke="white" strokeWidth="2.4" opacity=".2" />
            <circle cx="50" cy="50" r="27" stroke="white" strokeWidth="2.4" opacity=".35" />
            <circle cx="50" cy="50" r="14" stroke="white" strokeWidth="2.4" opacity=".52" />
            <circle cx="50" cy="50" r="4" fill="white" opacity=".92" />
            {/* Sweep line — rotaciona continuamente */}
            <g style={{ transformOrigin: '50px 50px' }} className="animate-[splash-sweep_3s_linear_infinite]">
              <line x1="50" y1="50" x2="50" y2="10" stroke="white" strokeWidth="2" strokeLinecap="round" opacity=".5" />
              <circle cx="50" cy="23" r="3" fill="white" opacity=".8" />
            </g>
          </svg>
        </div>
      </div>

      {/* App name */}
      <h1
        className="mt-7 text-[28px] font-bold tracking-tight text-white transition-all ease-out"
        style={{
          opacity: phase >= 2 ? 1 : 0,
          transform: phase >= 2 ? 'translateY(0)' : 'translateY(14px)',
          transitionDuration: '600ms',
        }}
      >
        Freela Radar
      </h1>

      {/* Credit — parte inferior */}
      <p
        className="absolute bottom-14 text-[13px] font-medium tracking-wide text-white/40 transition-all ease-out"
        style={{
          opacity: phase >= 3 ? 1 : 0,
          transform: phase >= 3 ? 'translateY(0)' : 'translateY(10px)',
          transitionDuration: '500ms',
        }}
      >
        ⌨️ Desenvolvido por <span className="text-white/60">Felipe Aguiar</span>
      </p>
    </div>
  );
}
