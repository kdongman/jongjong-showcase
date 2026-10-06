import type { BoothCompanionPlacement } from '@shared/companionState';
import { normalizeBoothCompanionPlacements } from '@shared/companionState';
import type { CouplePet } from '../companions/couplePetBoothAdapter';
import { defaultBoothCompanionPlacement, petPoseAsset } from '../companions/couplePetBoothAdapter';

type Props = {
  pets: CouplePet[];
  placements: BoothCompanionPlacement[];
  disabled?: boolean;
  onChange: (next: BoothCompanionPlacement[]) => void;
};

export function PetDecoratePanel({ pets, placements, disabled, onChange }: Props) {
  const [selectedPetId, setSelectedPetId] = useState<string | null>(placements.at(-1)?.petId ?? null);
  useEffect(() => {
    if (!placements.some((item) => item.petId === selectedPetId)) setSelectedPetId(placements.at(-1)?.petId ?? null);
  }, [placements, selectedPetId]);
  const selected = placements.find((item) => item.petId === selectedPetId) ?? placements.at(-1);
  const toggle = (petId: string) => {
    if (disabled) return;
    const exists = placements.some((item) => item.petId === petId);
    if (exists) { setSelectedPetId(petId); return; }
    setSelectedPetId(petId);
    if (placements.length === 0) {
      onChange([{ ...defaultBoothCompanionPlacement(petId, 0), x: 0.5 }]);
      return;
    }
    onChange(normalizeBoothCompanionPlacements([
      { ...placements[0]!, x: 0.2 },
      { ...defaultBoothCompanionPlacement(petId, 1), x: 0.8 },
    ]).slice(0, 2));
  };
  const update = (patch: Partial<BoothCompanionPlacement>) => {
    if (!selected || disabled) return;
    onChange(normalizeBoothCompanionPlacements(placements.map((item) => item.petId === selected.petId ? { ...item, ...patch } : item)));
  };

  return <section className="booth-pet-panel" aria-label="Booth pets">
    <div className="booth-pet-panel__header"><strong>Pets in this booth</strong><span className="muted">Optional · up to 2</span></div>
    {pets.length === 0 ? <p className="muted">No available pets. The booth still works normally.</p> : <div className="booth-pet-picker">
      {pets.map((pet) => {
        if (!pet.species) return null;
        const active = placements.some((item) => item.petId === pet.id);
        const asset = petPoseAsset(pet.species, 'sit_bottom_left');
        return <button key={pet.id} type="button" className={`booth-pet-choice${active ? ' is-selected' : ''}`} disabled={disabled || (!active && placements.length >= 2)} onClick={() => toggle(pet.id)} aria-pressed={active}>
          <img src={asset.webPath} alt="" /><span>{pet.name}</span>
        </button>;
      })}
      {placements.length > 0 ? <button type="button" className="btn btn-ghost" disabled={disabled} onClick={() => onChange([])}>No pets</button> : null}
    </div>}
    {selected ? <div className="booth-pet-controls">
      <label>Horizontal <input type="range" min="0.04" max="0.96" step="0.01" value={selected.x} disabled={disabled} onChange={(event) => update({ x: Number(event.target.value) })} /></label>
      <label>Vertical <input type="range" min="0.5" max="0.98" step="0.01" value={selected.y} disabled={disabled} onChange={(event) => update({ y: Number(event.target.value) })} /></label>
      <label>Scale <input type="range" min="0.08" max="0.35" step="0.01" value={selected.scale} disabled={disabled} onChange={(event) => update({ scale: Number(event.target.value) })} /></label>
      <div className="row">
        <button type="button" className="btn btn-ghost" disabled={disabled} onClick={() => update({ flipX: !selected.flipX })}>Flip</button>
        <button type="button" className="btn btn-ghost" disabled={disabled} onClick={() => update({ zIndex: Math.max(...placements.map((item) => item.zIndex)) + 1 })}>Bring front</button>
        <button type="button" className="btn btn-ghost" disabled={disabled} onClick={() => update({ zIndex: Math.min(...placements.map((item) => item.zIndex)) - 1 })}>Send back</button>
        <button type="button" className="btn btn-ghost" disabled={disabled} onClick={() => {
          const remaining = placements.filter((item) => item.petId !== selected.petId);
          onChange(remaining.length === 1 ? [{ ...remaining[0]!, x: 0.5 }] : remaining);
        }}>Remove</button>
      </div>
    </div> : null}
  </section>;
}
import { useEffect, useState } from 'react';
