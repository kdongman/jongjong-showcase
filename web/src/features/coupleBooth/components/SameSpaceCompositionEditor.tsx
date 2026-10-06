import { useEffect, useRef, useState } from 'react';
import type { SameSpaceBackground } from '@shared/sameSpaceBackground';
import {
  type SameSpaceCompositionSlot,
  type SameSpaceSoloLayout,
} from '@shared/sameSpaceLayoutSpec';
import type { BoothSceneSpanMode } from '@shared/boothSceneSpec';
import type { CaptureViewportMode } from '@shared/boothSceneSpec';
import { DEFAULT_BOOTH_SCENE_SPAN_MODE } from '@shared/boothSceneSpec';
import type { BoothMirrorMeta } from '@shared/mirrorDraw';
import {
  clampNormalizedRect,
  cloneSubjectPlacement,
  DEFAULT_SUBJECT_PLACEMENT,
  type NormalizedSubjectRect,
  type SubjectPlacement,
} from '@shared/subjectPlacement';
import {
  SameSpaceScenePreview,
  type SameSpaceScenePreviewHandle,
} from './SameSpaceScenePreview';
import { proposeBoothAutoAlignment } from '@shared/autoAlignment';
import type { BoothSharedSceneId } from '@shared/sharedScene';
import type { BoothCompanionPlacement } from '@shared/companionState';
import { BoothCompanionOverlay } from './BoothCompanionOverlay';

type Props = {
  open: boolean;
  title: string;
  leftUrl?: string | null;
  rightUrl?: string | null;
  leftSubjectId: string;
  rightSubjectId: string;
  /** Prefer this for [나] label; falls back to localSlot mapping. */
  localSubjectId?: string;
  /** Which composition home slot is the local user — maps to subjectId for labels. */
  localSlot?: SameSpaceCompositionSlot;
  background: SameSpaceBackground;
  sharedSceneId?: BoothSharedSceneId;
  lightingEnabled?: boolean;
  companions?: import('@shared/coupleBoothStage').BoothCompanionSnapshot[];
  companionPlacements?: BoothCompanionPlacement[];
  onCompanionPlacementsChange?: (next: BoothCompanionPlacement[]) => void;
  soloLayout: SameSpaceSoloLayout;
  initialPlacements: Record<string, SubjectPlacement>;
  initialFrontSubjectId?: string | null;
  colorFilter?: string;
  sceneSpanMode?: BoothSceneSpanMode;
  captureViewportMode?: CaptureViewportMode;
  leftMirror?: BoothMirrorMeta | null;
  rightMirror?: BoothMirrorMeta | null;
  onClose: () => void;
  onSave: (
    placements: Record<string, SubjectPlacement>,
    frontSubjectId: string | null,
  ) => void;
};

function cloneShotMode(
  value: Record<string, SubjectPlacement> | null | undefined,
): Record<string, SubjectPlacement> {
  const out: Record<string, SubjectPlacement> = {};
  for (const [id, placement] of Object.entries(value ?? {})) {
    out[id] = cloneSubjectPlacement(placement);
  }
  return out;
}

function subjectLabel(subjectId: string, localSubjectId: string): string {
  return subjectId === localSubjectId ? '나' : '상대';
}

function scaleRectAboutCenter(
  rect: NormalizedSubjectRect,
  factor: number,
): NormalizedSubjectRect {
  const width = rect.width * factor;
  const height = rect.height * factor;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  return clampNormalizedRect({
    x: cx - width / 2,
    y: cy - height / 2,
    width,
    height,
  });
}

function nudgeRect(
  rect: NormalizedSubjectRect,
  dx: number,
  dy: number,
): NormalizedSubjectRect {
  return clampNormalizedRect({
    ...rect,
    x: rect.x + dx,
    y: rect.y + dy,
  });
}

/**
 * Full-screen Review composition editor — people are directly draggable.
 * Shared by shot-card and final-strip entry points.
 */
export function SameSpaceCompositionEditor({
  open,
  title,
  leftUrl,
  rightUrl,
  leftSubjectId,
  rightSubjectId,
  localSubjectId,
  localSlot = 'left',
  background,
  sharedSceneId = 'classic',
  lightingEnabled = true,
  companions,
  companionPlacements = [],
  onCompanionPlacementsChange,
  soloLayout,
  initialPlacements,
  initialFrontSubjectId = null,
  colorFilter,
  sceneSpanMode = DEFAULT_BOOTH_SCENE_SPAN_MODE,
  captureViewportMode = 'desktop',
  leftMirror = null,
  rightMirror = null,
  onClose,
  onSave,
}: Props) {
  const previewRef = useRef<SameSpaceScenePreviewHandle>(null);
  const draftRef = useRef<Record<string, SubjectPlacement>>(cloneShotMode(initialPlacements));
  const draftFrontSubjectIdRef = useRef<string | null>(initialFrontSubjectId ?? null);
  const scaleBasisRef = useRef<Record<string, NormalizedSubjectRect>>({});

  const resolvedLocalSubjectId = localSubjectId
    ?? (localSlot === 'left' ? leftSubjectId : rightSubjectId);

  const [draft, setDraft] = useState<Record<string, SubjectPlacement>>(() => cloneShotMode(initialPlacements));
  const [selectedSubjectId, setSelectedSubjectId] = useState(
    leftUrl ? leftSubjectId : rightSubjectId,
  );
  const [frontSubjectId, setFrontSubjectId] = useState<string | null>(initialFrontSubjectId ?? null);
  const [alignmentNotice, setAlignmentNotice] = useState<string | null>(null);

  const setDraftSync = (next: Record<string, SubjectPlacement>) => {
    const cloned = cloneShotMode(next);
    draftRef.current = cloned;
    setDraft(cloned);
  };

  const setFrontSync = (next: string | null) => {
    draftFrontSubjectIdRef.current = next;
    setFrontSubjectId(next);
  };

  useEffect(() => {
    if (!open) return;
    const nextDraft = cloneShotMode(initialPlacements);
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    setFrontSync(initialFrontSubjectId ?? null);
    setSelectedSubjectId(leftUrl ? leftSubjectId : rightSubjectId);
    scaleBasisRef.current = {};
    setAlignmentNotice(null);
  }, [open, initialPlacements, initialFrontSubjectId, leftUrl, leftSubjectId, rightSubjectId]);

  const ensureManualPlacement = (subjectId: string): SubjectPlacement => {
    const current = draftRef.current[subjectId] ?? DEFAULT_SUBJECT_PLACEMENT;
    if (current.mode === 'manual' && current.rect) return cloneSubjectPlacement(current);
    previewRef.current?.flush();
    const logical = previewRef.current?.getLogicalVisibleRects()?.[subjectId];
    if (!logical) return cloneSubjectPlacement(current);
    if (!scaleBasisRef.current[subjectId]) {
      scaleBasisRef.current[subjectId] = { ...logical };
    }
    return { mode: 'manual', rect: clampNormalizedRect(logical) };
  };

  const updateSubjectRect = (
    subjectId: string,
    mutate: (rect: NormalizedSubjectRect) => NormalizedSubjectRect,
  ) => {
    const manual = ensureManualPlacement(subjectId);
    if (!manual.rect) return;
    const nextRect = mutate(manual.rect);
    if (!scaleBasisRef.current[subjectId]) {
      scaleBasisRef.current[subjectId] = { ...manual.rect };
    }
    setDraftSync({
      ...draftRef.current,
      [subjectId]: { mode: 'manual', rect: nextRect },
    });
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      const step = event.shiftKey ? 0.04 : 0.012;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      updateSubjectRect(selectedSubjectId, (rect) => {
        let dx = 0;
        let dy = 0;
        if (event.key === 'ArrowLeft') dx = -step;
        if (event.key === 'ArrowRight') dx = step;
        if (event.key === 'ArrowUp') dy = -step;
        if (event.key === 'ArrowDown') dy = step;
        return nudgeRect(rect, dx, dy);
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, selectedSubjectId]);

  if (!open) return null;

  const canEdit = Boolean(leftUrl || rightUrl);
  const activePlacement = draft[selectedSubjectId] ?? DEFAULT_SUBJECT_PLACEMENT;
  const activeRect = activePlacement.mode === 'manual' && activePlacement.rect
    ? activePlacement.rect
    : scaleBasisRef.current[selectedSubjectId] ?? null;
  const basis = scaleBasisRef.current[selectedSubjectId] ?? activeRect;
  const uiScale = activeRect && basis && basis.width > 0
    ? activeRect.width / basis.width
    : 1;

  const handleSave = () => {
    previewRef.current?.flush();
    const snapshot = cloneShotMode(draftRef.current);
    onSave(snapshot, draftFrontSubjectIdRef.current);
    onClose();
  };

  const handleAutoAlign = () => {
    previewRef.current?.flush();
    const result = proposeBoothAutoAlignment({
      subjects: previewRef.current?.getAutoAlignmentSubjects() ?? [],
      spanMode: sceneSpanMode,
    });
    if (result.status !== 'proposed') {
      setAlignmentNotice(`Auto align unavailable: ${result.reason}`);
      return;
    }
    const next = cloneShotMode(draftRef.current);
    for (const proposal of result.proposals) {
      next[proposal.participantId] = {
        mode: 'manual',
        rect: clampNormalizedRect(proposal.visibleBounds),
      };
      scaleBasisRef.current[proposal.participantId] = { ...proposal.visibleBounds };
    }
    setDraftSync(next);
    setAlignmentNotice(
      result.reason === 'source-edge-cropped'
        ? 'Auto aligned from the visible crop. You can fine-tune it.'
        : 'Auto aligned. You can still drag or resize either person.',
    );
  };

  return (
    <div
      className="same-space-composition-editor"
      role="dialog"
      aria-modal="true"
      aria-label="구도 조정"
      data-testid="same-space-composition-editor"
    >
      <button type="button" className="same-space-composition-editor-backdrop" aria-label="닫기" onClick={onClose} />
      <div className="same-space-composition-editor-panel">
        <header className="same-space-composition-editor-toolbar">
          <div>
            <p className="muted" style={{ margin: 0 }}>구도 조정</p>
            <h3 style={{ margin: '2px 0 0' }}>{title}</h3>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose}>취소</button>
        </header>

        <div className="same-space-composition-editor-stage" style={{ filter: colorFilter }}>
          {canEdit ? (
            <SameSpaceScenePreview
              ref={previewRef}
              leftUrl={leftUrl}
              rightUrl={rightUrl}
              leftSubjectId={leftSubjectId}
              rightSubjectId={rightSubjectId}
              background={background}
              sharedSceneId={sharedSceneId}
              lightingEnabled={lightingEnabled}
              companions={companions}
              frontSubjectId={frontSubjectId}
              soloLayout={soloLayout}
              placementsBySubjectId={draft}
              leftMirror={leftMirror}
              rightMirror={rightMirror}
          sceneSpanMode={sceneSpanMode}
          captureViewportMode={captureViewportMode}
              compactFit={false}
              editable
              selectedSubjectId={selectedSubjectId}
              onSelectedSubjectChange={setSelectedSubjectId}
              onPlacementsChange={(next) => {
                setDraftSync(next);
              }}
              onPlacementsCommit={(next) => {
                setDraftSync(next);
              }}
              exportMode
              alt={`${title} 구도 편집`}
            />
          ) : (
            <p className="muted">이 사진은 사람별 누끼가 없어 구도를 편집할 수 없어요.</p>
          )}
          {companions && onCompanionPlacementsChange ? <BoothCompanionOverlay companions={companions} placements={companionPlacements} onChange={onCompanionPlacementsChange} /> : null}
        </div>

        <div className="same-space-composition-editor-controls">
          <p className="muted" style={{ margin: 0 }}>
            {subjectLabel(selectedSubjectId, resolvedLocalSubjectId)} 선택됨 · 드래그하거나 버튼을 사용하세요
          </p>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary"
              data-testid="compose-auto-align"
              disabled={!leftUrl || !rightUrl}
              onClick={handleAutoAlign}
            >
              Auto align
            </button>
            <button
              type="button"
              className={`btn btn-secondary${selectedSubjectId === leftSubjectId ? ' is-active' : ''}`}
              data-testid="compose-select-left"
              disabled={!leftUrl}
              onClick={() => setSelectedSubjectId(leftSubjectId)}
            >
              {subjectLabel(leftSubjectId, resolvedLocalSubjectId)}
            </button>
            <button
              type="button"
              className={`btn btn-secondary${selectedSubjectId === rightSubjectId ? ' is-active' : ''}`}
              data-testid="compose-select-right"
              disabled={!rightUrl}
              onClick={() => setSelectedSubjectId(rightSubjectId)}
            >
              {subjectLabel(rightSubjectId, resolvedLocalSubjectId)}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => updateSubjectRect(selectedSubjectId, (rect) => scaleRectAboutCenter(rect, 1 / 1.06))}
            >
              작게
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => updateSubjectRect(selectedSubjectId, (rect) => scaleRectAboutCenter(rect, 1.06))}
            >
              크게
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                const left = ensureManualPlacement(leftSubjectId);
                const right = ensureManualPlacement(rightSubjectId);
                if (!left.rect || !right.rect) return;
                setDraftSync({
                  ...draftRef.current,
                  [leftSubjectId]: {
                    mode: 'manual',
                    rect: nudgeRect(left.rect, 0.03, 0),
                  },
                  [rightSubjectId]: {
                    mode: 'manual',
                    rect: nudgeRect(right.rect, -0.03, 0),
                  },
                });
              }}
            >
              가까이
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              data-testid="compose-reset-selected"
              onClick={() => {
                delete scaleBasisRef.current[selectedSubjectId];
                setDraftSync({
                  ...draftRef.current,
                  [selectedSubjectId]: { ...DEFAULT_SUBJECT_PLACEMENT },
                });
              }}
            >
              선택 인물 초기화
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              data-testid="compose-reset-all"
              onClick={() => {
                scaleBasisRef.current = {};
                setDraftSync({
                  [leftSubjectId]: { ...DEFAULT_SUBJECT_PLACEMENT },
                  [rightSubjectId]: { ...DEFAULT_SUBJECT_PLACEMENT },
                });
              }}
            >
              위치 초기화
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                const other = selectedSubjectId === leftSubjectId ? rightSubjectId : leftSubjectId;
                setFrontSync(frontSubjectId === selectedSubjectId ? other : selectedSubjectId);
              }}
            >
              {frontSubjectId === selectedSubjectId ? '뒤로' : '앞으로'}
            </button>
          </div>
          {alignmentNotice ? (
            <p className="muted" data-testid="compose-auto-align-notice" style={{ margin: 0 }}>
              {alignmentNotice}
            </p>
          ) : null}
          <label className="same-space-composition-editor-scale">
            확대
            <input
              type="range"
              min={0.2}
              max={5}
              step={0.02}
              value={uiScale}
              onChange={(event) => {
                const scale = Number(event.target.value);
                const manual = ensureManualPlacement(selectedSubjectId);
                const base = scaleBasisRef.current[selectedSubjectId] ?? manual.rect;
                if (!base) return;
                if (!scaleBasisRef.current[selectedSubjectId]) {
                  scaleBasisRef.current[selectedSubjectId] = { ...base };
                }
                setDraftSync({
                  ...draftRef.current,
                  [selectedSubjectId]: {
                    mode: 'manual',
                    rect: scaleRectAboutCenter(scaleBasisRef.current[selectedSubjectId]!, scale),
                  },
                });
              }}
            />
          </label>
          <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>취소</button>
            <button
              type="button"
              className="btn btn-primary"
              data-testid="compose-save"
              disabled={!canEdit}
              onClick={handleSave}
            >
              완료
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
