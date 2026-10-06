import { BOOTH_SHARED_SCENE_DEFINITIONS, type BoothSharedSceneId } from '@shared/sharedScene';

type Props = {
  activeSceneId: BoothSharedSceneId;
  disabled?: boolean;
  onSelect: (sceneId: BoothSharedSceneId) => void;
};

export function BoothSharedScenePicker({ activeSceneId, disabled = false, onSelect }: Props) {
  return (
    <div className="booth-shared-scene-picker" role="group" aria-label="Shared scene">
      <strong className="booth-shared-scene-picker-label">Scene</strong>
      <div className="booth-shared-scene-picker-options">
        {BOOTH_SHARED_SCENE_DEFINITIONS.map((scene) => {
          const active = scene.id === activeSceneId;
          return (
            <button
              key={scene.id}
              type="button"
              className={`booth-shared-scene-option is-${scene.id}${active ? ' is-active' : ''}`}
              aria-pressed={active}
              title={scene.displayName}
              disabled={disabled}
              onClick={() => onSelect(scene.id)}
            >
              <span className="booth-shared-scene-swatch" aria-hidden="true" />
              <span>{scene.compactLabel}</span>
              {active ? <span className="booth-shared-scene-check" aria-hidden="true">✓</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
