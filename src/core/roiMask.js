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
