export const RECORDING_WATERMARK = '@V1su4rt';

// O degradê depende só da geometria: enquanto o canvas não muda, reutiliza o mesmo objeto.
const shadeGradients = new WeakMap();

function shadeGradient(context, width, height, top, drawHeight) {
  const key = `${width}|${height}|${top}|${drawHeight}`;
  const cached = shadeGradients.get(context);
  if (cached?.key === key) return cached.gradient;
  const gradient = context.createLinearGradient(0, top, 0, top + drawHeight);
  gradient.addColorStop(0, 'rgba(6,8,12,0.69)');
  gradient.addColorStop(0.18, 'rgba(6,8,12,0)');
  gradient.addColorStop(0.82, 'rgba(6,8,12,0)');
  gradient.addColorStop(1, 'rgba(6,8,12,0.63)');
  shadeGradients.set(context, { key, gradient });
  return gradient;
}

export function recordingCanvasSize(width, height, maxEdge = 1280) {
  if (![width, height, maxEdge].every(Number.isFinite) || width <= 0 || height <= 0 || maxEdge <= 0) {
    throw new RangeError('Dimensões de gravação inválidas.');
  }
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function drawRecordingFrame(context, visual, overlay, width, height, includeShade = true, watermark = '') {
  if (!context || !visual?.width || !visual?.height || !width || !height) return null;
  const scale = Math.min(width / visual.width, height / visual.height);
  const drawWidth = visual.width * scale;
  const drawHeight = visual.height * scale;
  const left = (width - drawWidth) / 2;
  const top = (height - drawHeight) / 2;

  context.save();
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#06080c';
  context.fillRect(0, 0, width, height);
  context.drawImage(visual, left, top, drawWidth, drawHeight);
  if (includeShade) {
    context.fillStyle = shadeGradient(context, width, height, top, drawHeight);
    context.fillRect(left, top, drawWidth, drawHeight);
  }
  if (overlay?.width && overlay?.height) context.drawImage(overlay, left, top, drawWidth, drawHeight);
  if (watermark) {
    const pad = Math.max(10, Math.round(Math.min(drawWidth, drawHeight) * 0.018));
    const size = Math.max(10, Math.round(Math.min(drawWidth, drawHeight) * 0.022));
    context.globalAlpha = 0.35;
    context.fillStyle = '#eafff6';
    context.font = `600 ${size}px system-ui,sans-serif`;
    context.textAlign = 'right';
    context.textBaseline = 'bottom';
    context.fillText(watermark, left + drawWidth - pad, top + drawHeight - pad);
  }
  context.restore();
  return { left, top, width: drawWidth, height: drawHeight };
}
