import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { BoothCompanionPlacement } from '@shared/companionState';
import type { BoothCompanionSnapshot } from '@shared/coupleBoothStage';
import { isBoothCompanionTapGesture } from '@shared/companionReaction';

type Props = {
  companions: BoothCompanionSnapshot[];
  placements: BoothCompanionPlacement[];
  disabled?: boolean;
  onChange: (next: BoothCompanionPlacement[]) => void;
  onTap?: (petId: string) => void;
};

export function BoothCompanionOverlay({ companions, placements, disabled, onChange, onTap }: Props) {
  const drag = useRef<{
    petId: string;
    x: number;
    y: number;
    clientX: number;
    clientY: number;
    moved: boolean;
  } | null>(null);
  const update = (petId: string, patch: Partial<BoothCompanionPlacement>) => {
    onChange(placements.map((item) => item.petId === petId ? { ...item, ...patch } : item));
  };
  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const active = drag.current;
    if (!active || active.petId !== event.currentTarget.dataset.petId) return;
    const rect = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!rect) return;
    const dx = event.clientX - active.clientX;
    const dy = event.clientY - active.clientY;
    if (!active.moved && isBoothCompanionTapGesture(dx, dy)) return;
    active.moved = true;
    update(active.petId, {
      x: Math.max(0.04, Math.min(0.96, active.x + dx / rect.width)),
      y: Math.max(0.5, Math.min(0.98, active.y + dy / rect.height)),
    });
  };
  return <div className="booth-companion-overlay" aria-label="Drag booth pets">
    {companions.map((companion) => {
      const placement = placements.find((item) => item.petId === companion.id);
      if (!placement) return null;
      return <button
        key={companion.id}
        type="button"
        data-pet-id={companion.id}
        className="booth-companion-hit"
        aria-label={`Move ${companion.displayName ?? 'pet'}`}
        disabled={disabled}
        style={{ left: `${placement.x * 100}%`, top: `${placement.y * 100}%`, width: `${placement.scale * 75}%`, aspectRatio: '1 / 1' }}
        onPointerDown={(event) => {
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { petId: companion.id, x: placement.x, y: placement.y, clientX: event.clientX, clientY: event.clientY, moved: false };
        }}
        onPointerMove={move}
        onPointerUp={(event) => {
          const active = drag.current;
          if (active?.petId === companion.id && !active.moved && isBoothCompanionTapGesture(
            event.clientX - active.clientX,
            event.clientY - active.clientY,
          )) onTap?.(companion.id);
          drag.current = null;
        }}
        onPointerCancel={() => { drag.current = null; }}
        onDoubleClick={() => update(companion.id, { flipX: !placement.flipX })}
      />;
    })}
  </div>;
}
