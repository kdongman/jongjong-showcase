import {
  BOOTH_ROOM_CANONICAL_HEIGHT,
  BOOTH_ROOM_CANONICAL_WIDTH,
  BOOTH_ROOM_HEIGHT,
  BOOTH_ROOM_WIDTH,
  PET_ROOM_FLOOR_STYLES,
  PET_ROOM_WALL_STYLES,
  boothRoomProjection,
  normalizeCutoutPlacementType,
  petVisualAssets,
  projectBoothRoomPoint,
  resolveItemVisualSizePx,
  splitBoothRoomPlates,
  type BoothRoomSnapshot,
  type PetRoomItem,
} from '@couplePet';

export type BoothRoomPlateSet = { back: Blob; front: Blob };

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function image(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const value = new Image();
    const timeout = window.setTimeout(() => reject(new Error('OUR_ROOM_MEDIA_TIMEOUT')), 12_000);
    value.crossOrigin = 'anonymous';
    value.onload = () => { window.clearTimeout(timeout); resolve(value); };
    value.onerror = () => { window.clearTimeout(timeout); reject(new Error('OUR_ROOM_MEDIA_FAILED')); };
    value.src = url;
  });
}

async function loadMedia(snapshot: BoothRoomSnapshot): Promise<Map<string, HTMLImageElement>> {
  const entries = [
    ...snapshot.items.flatMap((item) => item.photo?.signedUrl ? [[`photo:${item.id}`, item.photo.signedUrl] as const] : []),
    ...snapshot.items.flatMap((item) => item.cutout?.signedUrl ? [[`cutout:${item.id}`, item.cutout.signedUrl] as const] : []),
    ...snapshot.pets.map((pet) => [`pet:${pet.id}`, petVisualAssets(pet.species, pet.growthStage).default.webPath] as const),
  ];
  return new Map(await Promise.all(entries.map(async ([key, url]) => [key, await image(url)] as const)));
}

function drawCoverCrop(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  focalX: number,
  focalY: number,
  zoom: number,
): void {
  const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight) * Math.max(1, zoom);
  const sw = width / scale;
  const sh = height / scale;
  const sx = Math.max(0, Math.min(img.naturalWidth - sw, focalX * img.naturalWidth - sw / 2));
  const sy = Math.max(0, Math.min(img.naturalHeight - sh, focalY * img.naturalHeight - sh / 2));
  ctx.drawImage(img, sx, sy, sw, sh, x, y, width, height);
}

function drawPhotoFrame(ctx: CanvasRenderingContext2D, item: PetRoomItem, media: Map<string, HTMLImageElement>, width: number, height: number): void {
  ctx.fillStyle = item.frameStyle === 'minimal' ? '#F7F2F8' : item.frameStyle === 'polaroid' ? '#FFFDF8' : '#E8D8C4';
  roundedRect(ctx, -width / 2, -height / 2, width, height, Math.max(4, width * 0.06));
  ctx.fill();
  ctx.strokeStyle = item.frameStyle === 'minimal' ? 'rgba(126,89,171,0.28)' : '#C4A88A';
  ctx.lineWidth = Math.max(2, width * 0.025);
  ctx.stroke();
  const pad = Math.max(6, width * 0.08);
  const bottom = item.frameStyle === 'polaroid' ? Math.max(pad, height * 0.18) : pad;
  const inner = { x: -width / 2 + pad, y: -height / 2 + pad, width: width - pad * 2, height: height - pad - bottom };
  roundedRect(ctx, inner.x, inner.y, inner.width, inner.height, Math.max(2, width * 0.035));
  ctx.clip();
  const photo = item.photo;
  const img = media.get(`photo:${item.id}`);
  if (photo && img) drawCoverCrop(ctx, img, inner.x, inner.y, inner.width, inner.height, photo.focalX, photo.focalY, photo.zoom);
  else {
    ctx.fillStyle = '#F4EEF6';
    ctx.fillRect(inner.x, inner.y, inner.width, inner.height);
  }
}

function drawDecor(ctx: CanvasRenderingContext2D, item: PetRoomItem, width: number, height: number): void {
  const w = width;
  const h = height;
  ctx.lineJoin = 'round';
  switch (item.catalogItemId) {
    case 'accent_rug':
      ctx.fillStyle = '#D8BFA8'; ctx.beginPath(); ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(112,82,60,.22)'; ctx.lineWidth = h * 0.06; ctx.stroke(); break;
    case 'sofa':
      ctx.fillStyle = '#BFA9D4'; roundedRect(ctx, -w / 2, -h * 0.32, w, h * 0.66, h * 0.14); ctx.fill();
      ctx.fillStyle = '#D4C2E2'; roundedRect(ctx, -w * 0.43, -h * 0.48, w * 0.86, h * 0.48, h * 0.12); ctx.fill();
      ctx.strokeStyle = '#9B82B3'; ctx.lineWidth = h * 0.035; ctx.stroke(); break;
    case 'shelf': case 'console': case 'dresser': case 'side_table':
      ctx.fillStyle = '#B78E6D'; roundedRect(ctx, -w / 2, -h / 2, w, h, h * 0.08); ctx.fill();
      ctx.fillStyle = '#E1C4A7'; ctx.fillRect(-w / 2, -h / 2, w, h * 0.12);
      ctx.strokeStyle = 'rgba(91,62,43,.28)'; ctx.lineWidth = 2; ctx.strokeRect(-w * 0.4, -h * 0.2, w * 0.8, h * 0.22); break;
    case 'bed':
      ctx.fillStyle = '#B89FCB'; roundedRect(ctx, -w / 2, -h * 0.35, w, h * 0.7, h * 0.22); ctx.fill();
      ctx.fillStyle = '#EEE4F4'; roundedRect(ctx, -w * 0.4, -h * 0.28, w * 0.8, h * 0.36, h * 0.16); ctx.fill(); break;
    case 'plant': case 'small_plant':
      ctx.fillStyle = '#B87955'; roundedRect(ctx, -w * 0.3, h * 0.08, w * 0.6, h * 0.42, w * 0.1); ctx.fill();
      ctx.fillStyle = '#6F9C72'; for (const dx of [-0.22, 0, 0.22]) { ctx.beginPath(); ctx.ellipse(w * dx, -h * 0.14, w * 0.22, h * 0.34, dx * -1.2, 0, Math.PI * 2); ctx.fill(); } break;
    case 'floor_lamp': case 'table_lamp':
      ctx.strokeStyle = '#796A82'; ctx.lineWidth = w * 0.07; ctx.beginPath(); ctx.moveTo(0, h * 0.45); ctx.lineTo(0, -h * 0.15); ctx.stroke();
      ctx.fillStyle = '#F4DDB4'; ctx.beginPath(); ctx.moveTo(-w * 0.38, -h * 0.12); ctx.lineTo(w * 0.38, -h * 0.12); ctx.lineTo(w * 0.24, -h * 0.48); ctx.lineTo(-w * 0.24, -h * 0.48); ctx.closePath(); ctx.fill(); break;
    case 'wall_art': case 'wall_poster':
      ctx.fillStyle = '#E8D8C4'; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.fillStyle = '#D8C6E7'; ctx.fillRect(-w * 0.42, -h * 0.4, w * 0.84, h * 0.8); break;
    case 'string_lights':
      ctx.strokeStyle = '#9D849E'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-w / 2, -h * 0.2); ctx.quadraticCurveTo(0, h * 0.3, w / 2, -h * 0.2); ctx.stroke();
      ctx.fillStyle = '#FFD88B'; for (let i = 0; i < 7; i += 1) { const x = -w / 2 + i * w / 6; const y = -h * 0.2 + h * 0.5 * (1 - Math.abs(i - 3) / 3); ctx.beginPath(); ctx.arc(x, y, h * 0.08, 0, Math.PI * 2); ctx.fill(); } break;
    case 'cushion': case 'plush':
      ctx.fillStyle = item.catalogItemId === 'plush' ? '#D5B690' : '#D7C4E5'; roundedRect(ctx, -w / 2, -h / 2, w, h, Math.min(w, h) * 0.3); ctx.fill(); break;
    case 'bowl':
      ctx.fillStyle = '#CFA0AF'; ctx.beginPath(); ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#F6E9DE'; ctx.beginPath(); ctx.ellipse(0, -h * 0.08, w * 0.34, h * 0.22, 0, 0, Math.PI * 2); ctx.fill(); break;
    case 'toy':
      ctx.fillStyle = '#E9A2A9'; ctx.beginPath(); ctx.arc(0, 0, w / 2, 0, Math.PI * 2); ctx.fill(); break;
    case 'vase': case 'keepsake':
      ctx.fillStyle = '#C9A7BD'; roundedRect(ctx, -w * 0.34, -h / 2, w * 0.68, h, w * 0.2); ctx.fill(); break;
    case 'text': {
      const text = item.textObject;
      ctx.fillStyle = text?.preset === 'note' ? '#F7E7C6' : text?.preset === 'sign' ? '#C9A07A' : 'transparent';
      if (text?.preset !== 'plain') roundedRect(ctx, -w / 2, -h / 2, w, h, 8), ctx.fill();
      ctx.fillStyle = '#5C4638';
      ctx.font = `${Math.max(11, h * 0.22)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text?.body ?? '', 0, 0, w * 0.86);
      break;
    }
    default:
      ctx.fillStyle = '#CBB8D8'; roundedRect(ctx, -w / 2, -h / 2, w, h, Math.min(w, h) * 0.14); ctx.fill();
  }
}

function drawItem(ctx: CanvasRenderingContext2D, item: PetRoomItem, media: Map<string, HTMLImageElement>, scale: number, offsetX: number): void {
  const size = resolveItemVisualSizePx(item, { width: BOOTH_ROOM_CANONICAL_WIDTH, height: BOOTH_ROOM_CANONICAL_HEIGHT });
  const placement = item.catalogItemId === 'cutout' ? normalizeCutoutPlacementType(item.placementType) : null;
  const anchorX = placement === 'wall' ? 0.5 : item.cutout?.anchorX ?? 0.5;
  const anchorY = placement === 'wall' ? 0.5 : item.cutout?.anchorY ?? 0.5;
  const center = projectBoothRoomPoint({ x: item.x, y: item.y });
  const w = size.width * scale;
  const h = size.height * scale;
  ctx.save();
  ctx.translate(center.x + offsetX, center.y);
  if (item.catalogItemId === 'cutout') {
    ctx.translate(w * (0.5 - anchorX), h * (0.5 - anchorY));
  }
  ctx.rotate(item.rotation * Math.PI / 180);
  if (item.flipX) ctx.scale(-1, 1);
  if (item.catalogItemId === 'photo_frame' || item.catalogItemId === 'photo_strip_frame') drawPhotoFrame(ctx, item, media, w, h);
  else if (item.catalogItemId === 'cutout') {
    const img = media.get(`cutout:${item.id}`);
    if (img) ctx.drawImage(img, -w / 2, -h / 2, w, h);
  } else drawDecor(ctx, item, w, h);
  ctx.restore();
}

function drawRoomShell(ctx: CanvasRenderingContext2D, snapshot: BoothRoomSnapshot): void {
  const wall = PET_ROOM_WALL_STYLES[snapshot.wallStyleId];
  const floor = PET_ROOM_FLOOR_STYLES[snapshot.floorStyleId];
  const groundY = BOOTH_ROOM_HEIGHT - 148 * (BOOTH_ROOM_HEIGHT / BOOTH_ROOM_CANONICAL_HEIGHT);
  ctx.fillStyle = wall.color; ctx.fillRect(0, 0, BOOTH_ROOM_WIDTH, groundY);
  const wash = ctx.createLinearGradient(0, 0, BOOTH_ROOM_WIDTH, groundY);
  wash.addColorStop(0, wall.warmth); wash.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = wash; ctx.fillRect(0, 0, BOOTH_ROOM_WIDTH, groundY);
  if (wall.pattern === 'dots') {
    ctx.fillStyle = 'rgba(120,94,72,.12)';
    for (let y = 24; y < groundY; y += 48) for (let x = 24; x < BOOTH_ROOM_WIDTH; x += 48) { ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.fillStyle = floor.color; ctx.fillRect(0, groundY, BOOTH_ROOM_WIDTH, BOOTH_ROOM_HEIGHT - groundY);
  ctx.strokeStyle = floor.board; ctx.lineWidth = 3;
  for (let x = 0; x < BOOTH_ROOM_WIDTH; x += 120) { ctx.beginPath(); ctx.moveTo(x, groundY); ctx.lineTo(x - 80, BOOTH_ROOM_HEIGHT); ctx.stroke(); }
  const depth = ctx.createLinearGradient(0, groundY, 0, BOOTH_ROOM_HEIGHT); depth.addColorStop(0, 'rgba(255,255,255,0)'); depth.addColorStop(1, floor.depth); ctx.fillStyle = depth; ctx.fillRect(0, groundY, BOOTH_ROOM_WIDTH, BOOTH_ROOM_HEIGHT - groundY);
}

function drawPets(ctx: CanvasRenderingContext2D, snapshot: BoothRoomSnapshot, media: Map<string, HTMLImageElement>): void {
  const projection = boothRoomProjection();
  for (const pet of snapshot.pets) {
    const img = media.get(`pet:${pet.id}`);
    if (!img) continue;
    const visual = petVisualAssets(pet.species, pet.growthStage).visual;
    const petHeight = 150 * projection.scale * (visual?.roomScale ?? 1);
    const petWidth = petHeight * img.naturalWidth / Math.max(1, img.naturalHeight);
    const point = projectBoothRoomPoint(pet.placement, projection);
    const baseline = visual?.footBaseline ?? 0.88;
    ctx.drawImage(img, point.x - petWidth * (visual?.contentCenterX ?? 0.5), point.y - petHeight * baseline, petWidth, petHeight);
  }
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('OUR_ROOM_PLATE_ENCODE_FAILED')), 'image/png'));
}

/** One high-resolution render per frozen session snapshot; never called per video frame. */
export async function renderBoothRoomPlates(snapshot: BoothRoomSnapshot): Promise<BoothRoomPlateSet> {
  const media = await loadMedia(snapshot);
  const plates = splitBoothRoomPlates(snapshot);
  const projection = boothRoomProjection();
  const offsetX = 0;
  const back = document.createElement('canvas'); back.width = BOOTH_ROOM_WIDTH; back.height = BOOTH_ROOM_HEIGHT;
  const front = document.createElement('canvas'); front.width = BOOTH_ROOM_WIDTH; front.height = BOOTH_ROOM_HEIGHT;
  const backCtx = back.getContext('2d'); const frontCtx = front.getContext('2d');
  if (!backCtx || !frontCtx) throw new Error('CANVAS_UNSUPPORTED');
  for (const ctx of [backCtx, frontCtx]) { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; }
  drawRoomShell(backCtx, snapshot);
  for (const item of plates.back) drawItem(backCtx, item as PetRoomItem, media, projection.scale, offsetX);
  for (const item of plates.front) drawItem(frontCtx, item as PetRoomItem, media, projection.scale, offsetX);
  if (snapshot.includePets) drawPets(frontCtx, snapshot, media);
  return { back: await canvasBlob(back), front: await canvasBlob(front) };
}
