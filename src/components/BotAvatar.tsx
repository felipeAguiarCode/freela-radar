import { useMemo } from 'react';
import { createAvatar } from '@dicebear/core';
import { bottts, botttsNeutral } from '@dicebear/collection';
import { cn } from '../lib/utils';

interface BotAvatarProps {
  seed: string;
  size?: number;
  className?: string;
  grayscale?: boolean;
  /** Usa a coleção colorida (bottts) em vez da neutra (botttsNeutral). */
  colorful?: boolean;
}

export function useBotAvatarDataUri(seed: string, size = 96, colorful = false): string {
  return useMemo(() => {
    const avatar = createAvatar(colorful ? bottts : botttsNeutral, {
      seed: seed || 'default',
      size,
    });
    return avatar.toDataUri();
  }, [seed, size, colorful]);
}

export function BotAvatar({ seed, size = 40, className, grayscale = false, colorful = false }: BotAvatarProps) {
  const dataUri = useBotAvatarDataUri(seed, size, colorful);
  // Apenas o robô (estilo bottts-neutral), sem fundo colorido nem moldura.
  // `grayscale` desatura o avatar para sinalizar estado inativo/cancelado.
  return (
    <img
      src={dataUri}
      alt={`Avatar ${seed}`}
      width={size}
      height={size}
      className={cn('block shrink-0', grayscale && 'grayscale opacity-60', className)}
    />
  );
}
