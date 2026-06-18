import { motion } from 'framer-motion';
import { ExternalLink } from 'lucide-react';
import { cn } from '../lib/utils';
import { BotAvatar } from './BotAvatar';
import type { Agent } from '../types';

interface AgentCardProps {
  agent: Agent;
  /** Posição na ordem de execução do time (1-based). */
  order?: number;
  onOpenEditor?: () => void;
}

export function AgentCard({ agent, order, onOpenEditor }: AgentCardProps) {
  const isActive = agent.enabled !== false;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-card rounded-2xl border border-border p-4 shadow-card hover:shadow-cardHover transition-shadow"
    >
      <div className="flex items-center gap-3">
        {/* Número da etapa na ordem de execução */}
        {order != null && (
          <span
            className={cn(
              'shrink-0 w-6 h-6 rounded-full grid place-items-center text-[12px] font-bold tabular-nums',
              isActive ? 'bg-purple-softer text-purple' : 'bg-[#f0f0f4] text-muted',
            )}
            title={`Etapa ${order}`}
          >
            {order}
          </span>
        )}

        {/* Avatar com pulinho enquanto ativo */}
        {isActive ? (
          <motion.div
            animate={{ y: [0, -4, 0, -1.5, 0] }}
            transition={{ duration: 1.2, ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.4 }}
            className="origin-bottom shrink-0"
          >
            <BotAvatar seed={agent.icon || agent.slug} size={32} />
          </motion.div>
        ) : (
          <BotAvatar seed={agent.icon || agent.slug} size={32} grayscale />
        )}

        {/* Identidade */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'text-[14px] font-semibold truncate flex-1',
                isActive ? 'text-primary' : 'text-muted',
              )}
              title={agent.name}
            >
              {agent.name}
            </span>
            {/* Status: dot com pulso de radar sincronizado (sem label) */}
            <span
              className="relative flex w-2 h-2 shrink-0"
              title={isActive ? 'Ativo' : 'Pausado'}
            >
              {isActive && (
                <span className="absolute inset-0 rounded-full bg-green animate-radar-ping pointer-events-none" />
              )}
              <span
                className={cn(
                  'relative inline-flex w-2 h-2 rounded-full',
                  isActive ? 'bg-green' : 'bg-[#cdcdd6]',
                )}
              />
            </span>
            {/* Abrir no editor de agentes */}
            {onOpenEditor && (
              <button
                onClick={onOpenEditor}
                title="Abrir no editor de agentes"
                aria-label="Abrir no editor de agentes"
                className="w-6 h-6 rounded-md text-purple hover:bg-purple-softer transition grid place-items-center shrink-0"
              >
                <ExternalLink size={12} />
              </button>
            )}
          </div>
          <div className="text-[11.5px] text-secondary truncate" title={agent.description}>
            {agent.description}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
