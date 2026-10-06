import type { BoothCandidate } from '@shared/types';
import { selectionOrderLabel } from '@shared/selection';
import {
  canShowSameSpaceComposition,
  canShowSameSpaceLayers,
  cutoutUrlKey,
  sameSpaceUrlKeys,
  type SameSpaceShotAssets,
} from '@shared/sameSpaceAssets';
import type { SameSpaceBackground } from '@shared/sameSpaceBackground';
import type { SameSpaceSoloLayout } from '@shared/sameSpaceLayoutSpec';
import type { BoothSceneSpanMode, CaptureViewportMode } from '@shared/boothSceneSpec';
import type { SubjectPlacement } from '@shared/subjectPlacement';
import { sameSpaceCutoutMirrorMeta } from '@shared/mirrorDraw';
import { SameSpaceScenePreview } from './SameSpaceScenePreview';
import type { BoothSharedSceneId } from '@shared/sharedScene';

type Props = {
  candidates: BoothCandidate[];
  selected: number[];
  urls: Record<string, string>;
  onToggle?: (shotIndex: number) => void;
  onOpenPreview?: (shotIndex: number) => void;
  onEditComposition?: (shotIndex: number) => void;
  selectable: boolean;
  sameSpace?: boolean;
  activeShotIndex?: number;
  leftUserId?: string;
  rightUserId?: string;
  background?: SameSpaceBackground;
  sharedSceneId?: BoothSharedSceneId;
  lightingEnabled?: boolean;
  companions?: import('@shared/coupleBoothStage').BoothCompanionSnapshot[];
  companionsByShot?: Record<number, import('@shared/coupleBoothStage').BoothCompanionSnapshot[]>;
  soloLayout?: SameSpaceSoloLayout;
  sceneSpanMode?: BoothSceneSpanMode;
  captureViewportMode?: CaptureViewportMode;
  slotSubjectPlacements?: Record<number, Record<string, SubjectPlacement>>;
  slotFrontSubjectIds?: Record<number, string | null>;
  onRetryUrl?: (shotIndex: number) => void;
};

function candidateAssets(candidate: BoothCandidate): SameSpaceShotAssets | null {
  const hostShot = candidate.hostShot;
  const guestShot = candidate.guestShot;
  if (!hostShot || !guestShot) return null;
  if (hostShot.userId === guestShot.userId) return null;
  if (hostShot.imagePath === guestShot.imagePath) return null;
  if (hostShot.captureId !== guestShot.captureId) return null;
  return {
    shotIndex: candidate.shotIndex,
    captureId: hostShot.captureId,
    hostShot,
    guestShot,
  };
}

export function ShotCandidateGrid({
  candidates,
  selected,
  urls,
  onToggle,
  onOpenPreview,
  onEditComposition,
  selectable,
  sameSpace,
  activeShotIndex,
  leftUserId,
  rightUserId,
  background,
  sharedSceneId = 'classic',
  lightingEnabled = true,
  companions,
  companionsByShot,
  soloLayout,
  sceneSpanMode,
  captureViewportMode,
  slotSubjectPlacements,
  slotFrontSubjectIds,
  onRetryUrl,
}: Props) {
  return (
    <div className="shot-grid" role="list">
      {candidates.map((candidate) => {
        const order = selectionOrderLabel(selected, candidate.shotIndex);
        const assets = candidateAssets(candidate);
        const keys = assets ? sameSpaceUrlKeys(assets.hostShot.id, assets.guestShot.id) : null;

        let leftUrl: string | undefined;
        let rightUrl: string | undefined;
        let leftCutout: string | undefined;
        let rightCutout: string | undefined;
        let preparingSameSpace = false;
        let leftShot = candidate.hostShot?.userId === leftUserId
          ? candidate.hostShot
          : candidate.guestShot?.userId === leftUserId
            ? candidate.guestShot
            : undefined;
        let rightShot = candidate.hostShot?.userId === rightUserId
          ? candidate.hostShot
          : candidate.guestShot?.userId === rightUserId
            ? candidate.guestShot
            : undefined;

        if (sameSpace && leftUserId && rightUserId) {
          leftUrl = leftShot ? urls[leftShot.id] : undefined;
          rightUrl = rightShot ? urls[rightShot.id] : undefined;
          leftCutout = leftShot ? urls[cutoutUrlKey(leftShot.id)] : undefined;
          rightCutout = rightShot ? urls[cutoutUrlKey(rightShot.id)] : undefined;
          preparingSameSpace = Boolean(
            (leftShot?.segmentationStatus === 'processing')
            || (rightShot?.segmentationStatus === 'processing'),
          );
        } else {
          leftShot = assets?.hostShot;
          rightShot = assets?.guestShot;
          leftUrl = keys ? urls[keys.hostOriginalKey] : undefined;
          rightUrl = keys ? urls[keys.guestOriginalKey] : undefined;
          leftCutout = keys ? urls[keys.hostCutoutKey] : undefined;
          rightCutout = keys ? urls[keys.guestCutoutKey] : undefined;
          preparingSameSpace = Boolean(
            sameSpace
            && (
              candidate.hostShot?.segmentationStatus === 'processing'
              || candidate.guestShot?.segmentationStatus === 'processing'
            ),
          );
        }

        const showSameSpacePair = canShowSameSpaceComposition({
          sameSpaceEnabled: Boolean(sameSpace),
          hostCutoutUrl: leftCutout,
          guestCutoutUrl: rightCutout,
          assets,
        });
        const showSameSpaceSolo = canShowSameSpaceLayers({
          sameSpaceEnabled: Boolean(sameSpace),
          leftCutoutUrl: leftCutout,
          rightCutoutUrl: rightCutout,
        });
        const showSameSpace = showSameSpacePair || showSameSpaceSolo;
        const complete = Boolean(leftUrl || rightUrl) && (Boolean(leftUrl && rightUrl) || Boolean(sameSpace && (leftUrl || rightUrl)));
        const loadingFailed = !leftUrl && !rightUrl && Boolean(candidate.hostShot || candidate.guestShot);
        const ready = complete && !preparingSameSpace;
        const editableLayers = Boolean(leftCutout || rightCutout);
        const placements = slotSubjectPlacements?.[candidate.shotIndex] ?? null;
        const frontSubjectId = slotFrontSubjectIds?.[candidate.shotIndex] ?? null;

        return (
          <div
            key={candidate.shotIndex}
            role="listitem"
            className={`shot-card${order ? ' selected' : ''}${activeShotIndex === candidate.shotIndex ? ' active-slot-target' : ''}${!ready ? ' is-loading' : ''}`}
          >
            <button
              type="button"
              className={showSameSpace ? 'same-space-shot shot-card-media' : 'pair shot-card-media'}
              data-capture-viewport={captureViewportMode ?? 'desktop'}
              disabled={!ready}
              onClick={() => onOpenPreview?.(candidate.shotIndex)}
              aria-label={`촬영 ${candidate.shotIndex} 크게 보기${order ? `, 선택 순서 ${order}` : ''}`}
            >
              {showSameSpace ? (
                <SameSpaceScenePreview
                  leftUrl={leftCutout}
                  rightUrl={rightCutout}
                  leftSubjectId={leftUserId}
                  rightSubjectId={rightUserId}
                  placementsBySubjectId={placements}
                  frontSubjectId={frontSubjectId}
                  background={background}
                  sharedSceneId={sharedSceneId}
                  lightingEnabled={lightingEnabled}
                  companions={companionsByShot?.[candidate.shotIndex] ?? companions}
                  soloLayout={soloLayout}
                  leftMirror={leftShot ? sameSpaceCutoutMirrorMeta(leftShot.mirrorX) : null}
                  rightMirror={rightShot ? sameSpaceCutoutMirrorMeta(rightShot.mirrorX) : null}
                  sceneSpanMode={sceneSpanMode}
                  captureViewportMode={captureViewportMode}
                  compactFit
                  alt={`합성 촬영 ${candidate.shotIndex}`}
                />
              ) : (
                <>
                  {leftUrl ? <img src={leftUrl} alt={`왼쪽 촬영 ${candidate.shotIndex}`} /> : <div className="shot-placeholder" />}
                  {rightUrl ? <img src={rightUrl} alt={`오른쪽 촬영 ${candidate.shotIndex}`} /> : <div className="shot-placeholder" />}
                </>
              )}
              {order ? <span className="shot-order-badge" aria-hidden>{order}</span> : null}
              {preparingSameSpace ? <span className="shot-status-badge">처리 중</span> : null}
              {!complete && !loadingFailed ? <span className="shot-status-badge">준비 중</span> : null}
            </button>
            <div className="shot-meta">
              <span>#{candidate.shotIndex}</span>
              <div className="shot-meta-actions">
                {selectable ? (
                  <button
                    type="button"
                    className={`btn ${order ? 'btn-secondary' : 'btn-ghost'} shot-select-btn`}
                    disabled={!ready}
                    aria-pressed={Boolean(order)}
                    onClick={() => onToggle?.(candidate.shotIndex)}
                  >
                    {order ? `선택 ${order}` : '선택'}
                  </button>
                ) : null}
                {selectable && showSameSpace && editableLayers && onEditComposition ? (
                  <button
                    type="button"
                    className="btn btn-secondary shot-select-btn"
                    data-testid={`shot-compose-${candidate.shotIndex}`}
                    disabled={!ready}
                    onClick={() => onEditComposition(candidate.shotIndex)}
                  >
                    구도 조정
                  </button>
                ) : null}
                {selectable && showSameSpace && !editableLayers ? (
                  <span className="muted" style={{ fontSize: '0.72rem' }}>레이어 없음</span>
                ) : null}
                {loadingFailed ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => onRetryUrl?.(candidate.shotIndex)}
                  >
                    다시 불러오기
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
