import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRadarStore } from '../store/useRadarStore';

// Frases que descrevem as etapas da varredura.
const PHRASES = [
  'Refletindo sobre melhores oportunidades…',
  'Lendo oportunidades…',
  'Calculando match…',
  'Ordenando por maior match…',
  'Quase pronto…',
];

// Linhas de "texto" do documento desenhado (viewBox 0 0 100 100). Cada item é
// uma barra arredondada; larguras variadas pra parecer um parágrafo real.
const DOC_LINES: Array<{ y: number; w: number }> = [
  { y: 41, w: 72 },
  { y: 48, w: 68 },
  { y: 55, w: 55 },
  { y: 67, w: 70 },
  { y: 74, w: 75 },
  { y: 81, w: 46 },
];

/** Overlay de carregamento exibido enquanto uma varredura está em andamento. */
export function ScanningModal() {
  const scanning = useRadarStore((s) => s.scanning);
  return (
    <AnimatePresence>{scanning && <ScanningOverlay key="scanning" />}</AnimatePresence>
  );
}

function ScanningOverlay() {
  const [phrase, setPhrase] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setPhrase((p) => (p + 1) % PHRASES.length), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[60] grid place-items-center bg-black/45 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
        className="bg-card rounded-[28px] border border-border shadow-cardHover px-14 py-12 flex flex-col items-center gap-7"
      >
        {/* Área de scanner: documento (QR) + feixe + molduras de mira */}
        <div className="relative w-[300px] h-[300px]">
          {/* Documento sendo escaneado */}
          <div className="absolute inset-7 rounded-2xl bg-white border border-border overflow-hidden shadow-[inset_0_1px_3px_rgba(16,24,40,0.06)]">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              {/* Título do documento */}
              <rect x={14} y={15} width={50} height={6} rx={3} style={{ fill: 'rgb(var(--text-primary))' }} />
              {/* Etiqueta/subtítulo (acento roxo) */}
              <rect x={14} y={26} width={28} height={4} rx={2} style={{ fill: 'rgb(var(--purple))' }} />
              {/* Corpo: linhas de texto em parágrafos */}
              {DOC_LINES.map((l) => (
                <rect
                  key={l.y}
                  x={14}
                  y={l.y}
                  width={l.w}
                  height={3}
                  rx={1.5}
                  style={{ fill: 'rgb(var(--text-muted))' }}
                  opacity={0.55}
                />
              ))}
            </svg>

            {/* Feixe de varredura — sobe e desce continuamente */}
            <motion.div
              className="absolute inset-x-0 top-0"
              initial={{ y: 12 }}
              animate={{ y: [12, 234, 12] }}
              transition={{ duration: 2.6, ease: 'easeInOut', repeat: Infinity }}
            >
              {/* Halo (luz da varredura) que tinge o documento ao passar */}
              <div className="absolute inset-x-0 -top-12 h-24 bg-gradient-to-b from-transparent via-purple/25 to-transparent" />
              {/* Linha-núcleo brilhante */}
              <div className="absolute inset-x-0 top-0 h-[2.5px] bg-gradient-to-r from-transparent via-purple to-transparent shadow-[0_0_16px_3px_rgb(var(--purple)/0.6)]" />
              {/* Reflexo fino logo abaixo do núcleo */}
              <div className="absolute inset-x-6 top-[3px] h-px bg-purple/40" />
            </motion.div>
          </div>

          {/* Molduras de mira (reticle) nos 4 cantos */}
          <span className="absolute top-0 left-0 w-9 h-9 border-t-[3px] border-l-[3px] border-purple rounded-tl-2xl" />
          <span className="absolute top-0 right-0 w-9 h-9 border-t-[3px] border-r-[3px] border-purple rounded-tr-2xl" />
          <span className="absolute bottom-0 left-0 w-9 h-9 border-b-[3px] border-l-[3px] border-purple rounded-bl-2xl" />
          <span className="absolute bottom-0 right-0 w-9 h-9 border-b-[3px] border-r-[3px] border-purple rounded-br-2xl" />
        </div>

        {/* Frase ciclando + rótulo */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="h-6 flex items-center">
            <AnimatePresence mode="wait">
              <motion.span
                key={phrase}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.28 }}
                className="text-[15px] font-semibold text-primary"
              >
                {PHRASES[phrase]}
              </motion.span>
            </AnimatePresence>
          </div>
          <div className="text-[12px] text-muted uppercase tracking-wider">Escaneando oportunidades</div>
        </div>
      </motion.div>
    </motion.div>
  );
}
