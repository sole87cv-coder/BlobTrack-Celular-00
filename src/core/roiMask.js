// Rasterize stage-space rectangles into an analysis-frame mask.
export function createRoiMask({
  width,
  height,
  sourceWidth,
  sourceHeight,
  viewWidth,
  viewHeight,
  rects,
  mirror = false,
  flip = false,
  gearVr = false,
}) {
  if (!rects?.length || width < 1 || height < 1 || sourceWidth < 1 || sourceHeight < 1 || viewWidth <= 0 || viewHeight <= 0) return null;
  const mask = new Uint8Array(width * height);
  const sourceAspect = sourceWidth / sourceHeight;
  const viewAspect = viewWidth / viewHeight;
  let containLeft = 0, containTop = 0, containWidth = viewWidth, containHeight = viewHeight;
  let visibleX = 1, visibleY = 1;
  if (gearVr) {
    const scale = Math.min(viewWidth / sourceWidth, viewHeight / sourceHeight);
    containWidth = sourceWidth * scale;
    containHeight = sourceHeight * scale;
    containLeft = (viewWidth - containWidth) / 2;
    containTop = (viewHeight - containHeight) / 2;
  } else if (sourceAspect > viewAspect) visibleX = viewAspect / sourceAspect;
  else if (sourceAspect < viewAspect) visibleY = sourceAspect / viewAspect;

  let index = 0;
  for (let y = 0; y < height; y++) {
    let viewY = (y + 0.5) / height;
    if (gearVr) viewY = (containTop + viewY * containHeight) / viewHeight;
    else if (visibleY < 1) viewY = (viewY - (1 - visibleY) / 2) / visibleY;
    if (flip) viewY = 1 - viewY;
    for (let x = 0; x < width; x++, index++) {
      let viewX = (x + 0.5) / width;
      if (gearVr) viewX = (containLeft + viewX * containWidth) / viewWidth;
      else if (visibleX < 1) viewX = (viewX - (1 - visibleX) / 2) / visibleX;
      if (mirror) viewX = 1 - viewX;
      for (let r = 0; r < rects.length; r++) {
        const rect = rects[r];
        if (viewX >= rect.x && viewX <= rect.x + rect.w && viewY >= rect.y && viewY <= rect.y + rect.h) {
          mask[index] = 1;
          break;
        }
      }
    }
  }
  return mask;
}

// Canto mais próximo do dedo/cursor, em coordenadas normalizadas do palco.
export function roiHandleAt(x, y, rects, toleranceX = .03, toleranceY = .05) {
  for (let i = rects.length - 1; i >= 0; i--) {
    const rect = rects[i];
    const left = rect.x, right = rect.x + rect.w, top = rect.y, bottom = rect.y + rect.h;
    const corners = [['nw', left, top], ['ne', right, top], ['sw', left, bottom], ['se', right, bottom]];
    for (const [corner, cx, cy] of corners) {
      if (Math.abs(x - cx) <= toleranceX && Math.abs(y - cy) <= toleranceY) return { rect, corner, index: i };
    }
  }
  return null;
}

// Redimensiona pelo canto escolhido sem deixar a caixa virar linha nem sair do palco.
export function resizeRoiRect(rect, corner, x, y, minSize = .015) {
  let left = rect.x, right = rect.x + rect.w, top = rect.y, bottom = rect.y + rect.h;
  if (corner.includes('w')) left = Math.min(x, right - minSize);
  if (corner.includes('e')) right = Math.max(x, left + minSize);
  if (corner.includes('n')) top = Math.min(y, bottom - minSize);
  if (corner.includes('s')) bottom = Math.max(y, top + minSize);
  left = Math.max(0, left); top = Math.max(0, top);
  right = Math.min(1, Math.max(left + minSize, right));
  bottom = Math.min(1, Math.max(top + minSize, bottom));
  rect.x = left; rect.y = top; rect.w = right - left; rect.h = bottom - top;
  return rect;
}
