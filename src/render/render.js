import { clamp } from '../core/utils.js';

// Pointillism: amostra pequena, difusão de erro e pontos pretos de tamanho variável.
const STIPPLE_MAX_WIDTH = 200, STIPPLE_MAX_HEIGHT = 120;
const STIPPLE_SPACING = 3;
const STIPPLE_LEVELS = 6;
const STIPPLE_TAU = Math.PI * 2;

export function createRender({
  state,
  canvas,
  overlayCanvas,
  stageViewport = null,
  gl,
  glState = null,
  fallbackContext,
  overlayContext,
  video,
  maskCanvas,
  maskContext,
  maskImage,
  maskView,
  cropRect,
  gridPoint,
  mapPointA,
  mapPointB,
  blobViewPoints,
  TRAIL_SLOTS,
  TRAIL_POINTS,
  trailIds,
  trailPoints,
  trailCursor,
  trailLength,
  trailAge,
  trailSpeed,
  trailSeen,
  recordingContext,
  recordingCanvas,
  recordingSnapshot,
  recordingCanvasSize,
  drawRecordingFrame,
  recordingWatermark = '',
  resize,
  forceFallback,
  log,
  showToast,
  onMeter,
  sendAudioOptions,
  fmt,
}) {
  const distancePairCapacity = TRAIL_SLOTS * (TRAIL_SLOTS - 1) / 2;
  const distancePairA = new Uint8Array(distancePairCapacity);
  const distancePairB = new Uint8Array(distancePairCapacity);
  const distancePairSquared = new Float64Array(distancePairCapacity);
  const distancePairUsed = new Uint8Array(distancePairCapacity);
  const distanceDegree = new Uint8Array(TRAIL_SLOTS);
  const stippleCropRect = new Float32Array(4);
  let stippleCanvas = null, stippleContext = null, stippleWarned = false;
  let stippleGrid = { width: 0, height: 0, luma: null, error: null, jitterX: null, jitterY: null, dotX: null, dotY: null, dotR: null, count: 0 };
  let meshSteps = { width: 0, height: 0, spacing: 0, x: null, y: null };
  let overlayDirty = false;

  // ---------- geometria pura ----------

  function calculateCoverCrop(sourceWidth, sourceHeight, viewWidth, viewHeight, out) {
    const sourceAspect = sourceWidth / sourceHeight;
    const viewAspect = viewWidth / viewHeight;
    if (sourceAspect > viewAspect) {
      out[2] = sourceHeight * viewAspect;
      out[0] = (sourceWidth - out[2]) / 2;
      out[1] = 0;
      out[3] = sourceHeight;
    } else {
      out[3] = sourceWidth / viewAspect;
      out[0] = 0;
      out[1] = (sourceHeight - out[3]) / 2;
      out[2] = sourceWidth;
    }
  }

  function calculateContainRect(sourceWidth, sourceHeight, viewWidth, viewHeight, out) {
    const scale = Math.min(viewWidth / sourceWidth, viewHeight / sourceHeight);
    out[2] = sourceWidth * scale;
    out[3] = sourceHeight * scale;
    out[0] = (viewWidth - out[2]) / 2;
    out[1] = (viewHeight - out[3]) / 2;
  }

  function drawContainedSource(c, source, viewWidth, viewHeight, offsetX = 0) {
    calculateContainRect(
      source.videoWidth || source.width,
      source.videoHeight || source.height,
      viewWidth,
      viewHeight,
      cropRect
    );
    c.drawImage(
      source,
      0,
      0,
      source.videoWidth || source.width,
      source.videoHeight || source.height,
      offsetX + cropRect[0],
      cropRect[1],
      cropRect[2],
      cropRect[3]
    );
  }

  // ---------- mapeamento de ponto de vídeo ----------

  function mapVideoPoint(x, y, viewWidth, viewHeight, out) {
    const sourceAspect = video.videoWidth / video.videoHeight;
    const viewAspect = viewWidth / viewHeight;
    if (state.gearVr) {
      calculateContainRect(video.videoWidth, video.videoHeight, viewWidth, viewHeight, cropRect);
      x = (cropRect[0] + x * cropRect[2]) / viewWidth;
      y = (cropRect[1] + y * cropRect[3]) / viewHeight;
    } else if (sourceAspect > viewAspect) {
      const visible = viewAspect / sourceAspect;
      x = (x - (1 - visible) / 2) / visible;
    } else {
      const visible = sourceAspect / viewAspect;
      y = (y - (1 - visible) / 2) / visible;
    }
    out[0] = (state.camera === 'user') !== state.flip ? 1 - x : x;
    out[1] = y;
    return out;
  }

  // ---------- rastros ----------

  function prepareBlobViewPoints(blobs, viewWidth, viewHeight) {
    const count = Math.min(blobs.length, TRAIL_SLOTS);
    for (let i = 0; i < count; i++) {
      mapVideoPoint(blobs[i].x, blobs[i].y, viewWidth, viewHeight, mapPointA);
      blobViewPoints[i * 2] = mapPointA[0];
      blobViewPoints[i * 2 + 1] = mapPointA[1];
    }
    return count;
  }

  function recordBlobTrails(blobs) {
    trailSeen.fill(0);
    for (let i = 0; i < Math.min(blobs.length, TRAIL_SLOTS); i++) {
      const blob = blobs[i];
      const id = Number.isFinite(blob.id) ? blob.id : i;
      let slot = -1;
      for (let j = 0; j < TRAIL_SLOTS; j++) {
        if (trailIds[j] === id) { slot = j; break; }
      }
      if (slot < 0) {
        for (let j = 0; j < TRAIL_SLOTS; j++) {
          if (trailIds[j] < 0) { slot = j; break; }
        }
        if (slot < 0) {
          for (let j = 0; j < TRAIL_SLOTS; j++) {
            if (!trailSeen[j] && (slot < 0 || trailAge[j] > trailAge[slot])) slot = j;
          }
        }
        if (slot < 0) continue;
        trailIds[slot] = id;
        trailCursor[slot] = 0;
        trailLength[slot] = 0;
      }
      trailSeen[slot] = 1;
      trailAge[slot] = 0;
      trailSpeed[slot] = clamp(blob.speed, 0, 1);
      const cursor = trailCursor[slot];
      const base = (slot * TRAIL_POINTS + cursor) * 2;
      trailPoints[base] = blob.x;
      trailPoints[base + 1] = blob.y;
      trailCursor[slot] = (cursor + 1) % TRAIL_POINTS;
      trailLength[slot] = Math.min(TRAIL_POINTS, trailLength[slot] + 1);
    }
    for (let i = 0; i < TRAIL_SLOTS; i++) {
      if (!trailSeen[i] && trailIds[i] >= 0) {
        trailAge[i] = Math.min(255, trailAge[i] + 1);
        if (trailAge[i] > 30) {
          trailIds[i] = -1;
          trailLength[i] = 0;
        }
      }
    }
  }

  function drawTrails(c, viewWidth, viewHeight, offsetX) {
    for (let slot = 0; slot < TRAIL_SLOTS; slot++) {
      const length = trailLength[slot];
      const age = trailAge[slot];
      if (length < 2 || age > 30) continue;
      const start = (trailCursor[slot] - length + TRAIL_POINTS) % TRAIL_POINTS;
      c.beginPath();
      for (let i = 0; i < length; i++) {
        const point = (slot * TRAIL_POINTS + (start + i) % TRAIL_POINTS) * 2;
        mapVideoPoint(trailPoints[point], trailPoints[point + 1], viewWidth, viewHeight, mapPointA);
        const x = offsetX + mapPointA[0] * viewWidth;
        const y = mapPointA[1] * viewHeight;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.globalAlpha = Math.max(0, 1 - age / 31) * (.35 + .55 * trailSpeed[slot]);
      c.strokeStyle = trailSpeed[slot] > .55 ? '#b8f36a' : '#74eaff';
      c.lineWidth = 1.2 + trailSpeed[slot] * 2.4;
      c.lineCap = 'round';
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  function drawWaves(c, blobs, viewWidth, viewHeight, offsetX, now, preparedCount) {
    const count = preparedCount ?? prepareBlobViewPoints(blobs, viewWidth, viewHeight);
    const size = Math.min(viewWidth, viewHeight);
    for (let i = 0; i < count; i++) {
      const blob = blobs[i];
      const speed = clamp(blob.speed, 0, 1);
      const x = offsetX + blobViewPoints[i * 2] * viewWidth;
      const y = blobViewPoints[i * 2 + 1] * viewHeight;
      const phaseBase = now * (.00015 + speed * .00018) + (blob.id || i) * .173;
      for (let ring = 0; ring < 3; ring++) {
        const phase = (phaseBase + ring / 3) % 1;
        const radius = size * (.025 + phase * (.1 + .2 * state.envelopes.density));
        c.globalAlpha = (.1 + speed * .24) * (1 - phase);
        c.strokeStyle = '#74eaff';
        c.lineWidth = 1 + state.envelopes.energy * 1.4;
        c.beginPath();
        c.arc(x, y, radius, 0, Math.PI * 2);
        c.stroke();
      }
    }
    c.globalAlpha = 1;
  }

  function deformGridPoint(x, y, blobs, count, viewWidth, viewHeight, out) {
    let pushX = 0;
    let pushY = 0;
    const size = Math.min(viewWidth, viewHeight);
    for (let i = 0; i < count; i++) {
      const dx = x - blobViewPoints[i * 2] * viewWidth;
      const dy = y - blobViewPoints[i * 2 + 1] * viewHeight;
      const speed = clamp(blobs[i].speed, 0, 1);
      const radius = size * (.12 + .16 * state.envelopes.density + .06 * speed);
      const d2 = dx * dx + dy * dy;
      const r2 = radius * radius;
      if (d2 >= r2) continue;
      const influence = 1 - d2 / r2;
      const force = influence * influence * (.05 + .16 * speed + .06 * state.envelopes.energy);
      pushX += (dx - dy * .22) * force;
      pushY += (dy + dx * .22) * force;
    }
    out[0] = x + pushX;
    out[1] = y + pushY;
  }

  function drawMesh(c, blobs, viewWidth, viewHeight, offsetX, preparedCount) {
    const count = Math.min(preparedCount ?? prepareBlobViewPoints(blobs, viewWidth, viewHeight), 8);
    const spacing = Math.max(34, Math.min(52, Math.min(viewWidth, viewHeight) / 11));
    c.globalAlpha = .22 + state.envelopes.density * .2;
    c.strokeStyle = '#ed72ff';
    c.lineWidth = .7 + state.envelopes.speed * .8;
    if (meshSteps.width !== viewWidth || meshSteps.height !== viewHeight || meshSteps.spacing !== spacing) {
      const ySteps = [];
      for (let y = 0; y <= viewHeight; y += spacing) ySteps.push(y);
      if (ySteps[ySteps.length - 1] < viewHeight) ySteps.push(viewHeight);
      const xSteps = [];
      for (let x = 0; x <= viewWidth; x += spacing) xSteps.push(x);
      if (xSteps[xSteps.length - 1] < viewWidth) xSteps.push(viewWidth);
      meshSteps = { width: viewWidth, height: viewHeight, spacing, x: xSteps, y: ySteps };
    }
    const xSteps = meshSteps.x, ySteps = meshSteps.y;
    // Mesmo estilo em todas as linhas: um único path evita dezenas de strokes por olho.
    c.beginPath();
    for (const y of ySteps) {
      for (let i = 0; i < xSteps.length; i++) {
        deformGridPoint(xSteps[i], y, blobs, count, viewWidth, viewHeight, gridPoint);
        const px = offsetX + gridPoint[0];
        if (i === 0) c.moveTo(px, gridPoint[1]);
        else c.lineTo(px, gridPoint[1]);
      }
    }
    for (const x of xSteps) {
      for (let i = 0; i < ySteps.length; i++) {
        deformGridPoint(x, ySteps[i], blobs, count, viewWidth, viewHeight, gridPoint);
        const px = offsetX + gridPoint[0];
        if (i === 0) c.moveTo(px, gridPoint[1]);
        else c.lineTo(px, gridPoint[1]);
      }
    }
    c.stroke();
    c.globalAlpha = 1;
  }

  function drawBlobNetwork(c, blobs, viewWidth, viewHeight, offsetX = 0, preparedCount) {
    const count = preparedCount ?? prepareBlobViewPoints(blobs, viewWidth, viewHeight);
    if (!count) return;
    const maxDistance = Math.min(viewWidth, viewHeight) * 0.28;
    const maxDistanceSquared = maxDistance * maxDistance;
    c.save();
    c.lineWidth = 1.25;
    c.strokeStyle = '#74eaff';
    for (let i = 0; i < count; i++) {
      const x1 = blobViewPoints[i * 2] * viewWidth;
      const y1 = blobViewPoints[i * 2 + 1] * viewHeight;
      for (let j = i + 1; j < count; j++) {
        const dx = (blobViewPoints[j * 2] - blobViewPoints[i * 2]) * viewWidth;
        const dy = (blobViewPoints[j * 2 + 1] - blobViewPoints[i * 2 + 1]) * viewHeight;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared > maxDistanceSquared) continue;
        c.globalAlpha = 0.2 + 0.65 * (1 - distanceSquared / maxDistanceSquared);
        c.beginPath();
        c.moveTo(offsetX + x1, y1);
        c.lineTo(offsetX + blobViewPoints[j * 2] * viewWidth, blobViewPoints[j * 2 + 1] * viewHeight);
        c.stroke();
      }
    }
    c.globalAlpha = 1;
    c.fillStyle = '#f0a8ff';
    c.beginPath();
    for (let i = 0; i < count; i++) {
      const x = offsetX + blobViewPoints[i * 2] * viewWidth;
      const y = blobViewPoints[i * 2 + 1] * viewHeight;
      c.moveTo(x + 3.2, y);
      c.arc(x, y, 3.2, 0, Math.PI * 2);
    }
    c.fill();
    c.restore();
  }

  function drawDistanceTelemetry(c, blobs, viewWidth, viewHeight, offsetX = 0, preparedCount) {
    if (!state.distanceTelemetry || state.performance?.effectsPaused) return 0;
    const count = preparedCount ?? prepareBlobViewPoints(blobs, viewWidth, viewHeight);
    if (count < 2) return 0;
    const minDistance = Math.min(viewWidth, viewHeight) * clamp(state.maxConnectionDistance, 0.08, 0.5);
    const minDistanceSquared = minDistance * minDistance;
    distanceDegree.fill(0);
    distancePairUsed.fill(0);
    let pairCount = 0;
    for (let i = 0; i < count; i++) {
      const x1 = blobViewPoints[i * 2] * viewWidth;
      const y1 = blobViewPoints[i * 2 + 1] * viewHeight;
      for (let j = i + 1; j < count; j++) {
        const dx = blobViewPoints[j * 2] * viewWidth - x1;
        const dy = blobViewPoints[j * 2 + 1] * viewHeight - y1;
        const d2 = dx * dx + dy * dy;
        if (d2 > minDistanceSquared) continue;
        distancePairA[pairCount] = i;
        distancePairB[pairCount] = j;
        distancePairSquared[pairCount] = d2;
        pairCount++;
      }
    }
    if (!pairCount) return 0;

    c.save();
    c.strokeStyle = '#b8f36a';
    c.fillStyle = 'rgba(0,0,0,.55)';
    c.lineWidth = 1;
    c.font = '10px monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    let drawn = 0;
    for (let edge = 0; edge < pairCount; edge++) {
      let nearest = -1;
      let nearestSquared = Infinity;
      for (let candidate = 0; candidate < pairCount; candidate++) {
        if (distancePairUsed[candidate]) continue;
        const a = distancePairA[candidate];
        const b = distancePairB[candidate];
        if (distanceDegree[a] >= 3 || distanceDegree[b] >= 3) continue;
        if (distancePairSquared[candidate] < nearestSquared) {
          nearest = candidate;
          nearestSquared = distancePairSquared[candidate];
        }
      }
      if (nearest < 0) break;
      distancePairUsed[nearest] = 1;
      const i = distancePairA[nearest];
      const j = distancePairB[nearest];
      distanceDegree[i]++;
      distanceDegree[j]++;
      const x1 = blobViewPoints[i * 2] * viewWidth;
      const y1 = blobViewPoints[i * 2 + 1] * viewHeight;
      const x2 = blobViewPoints[j * 2] * viewWidth;
      const y2 = blobViewPoints[j * 2 + 1] * viewHeight;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const distance = Math.sqrt(nearestSquared);
      c.beginPath();
      c.moveTo(offsetX + x1, y1);
      c.lineTo(offsetX + x2, y2);
      c.stroke();
      const label = `${Math.round(distance)}px`;
      const labelX = offsetX + (x1 + x2) * .5 - dy / distance * 8;
      const labelY = (y1 + y2) * .5 + dx / distance * 8;
      const labelWidth = c.measureText(label).width + 8;
      c.fillRect(labelX - labelWidth * .5, labelY - 7, labelWidth, 14);
      c.fillStyle = '#f4fff0';
      c.fillText(label, labelX, labelY);
      c.fillStyle = 'rgba(0,0,0,.55)';
      drawn++;
    }
    c.restore();
    return drawn;
  }

  function drawRawVideoWindows(c, blobs, viewWidth, viewHeight, offsetX, source, applied = {}) {
    if (!source?.videoWidth || !blobs.length) return;
    c.save();
    const effectFilter =
      state.effect === 'invert' ? 'invert(1)'
        : state.effect === 'threshold' ? 'grayscale(1) contrast(8)'
          : 'grayscale(1) contrast(2)';
    const invertPart = state.invertBlend ? ' invert(1)' : '';
    const filter = (!state.originalVideoWindows || state.invertBlend || state.videoBlend > 0)
      ? (effectFilter + invertPart)
      : 'none';
    c.beginPath();
    for (const blob of blobs) {
      mapVideoPoint(blob.left, blob.top, viewWidth, viewHeight, mapPointA);
      mapVideoPoint(blob.right, blob.bottom, viewWidth, viewHeight, mapPointB);
      const left = Math.min(mapPointA[0], mapPointB[0]);
      const top = Math.min(mapPointA[1], mapPointB[1]);
      const right = Math.max(mapPointA[0], mapPointB[0]);
      const bottom = Math.max(mapPointA[1], mapPointB[1]);
      c.rect(offsetX + left * viewWidth, top * viewHeight, (right - left) * viewWidth, (bottom - top) * viewHeight);
    }
    c.clip();
    const mirrorX = (state.camera === 'user') !== state.flip;
    const drawSource = () => {
      if (state.gearVr) {
        calculateContainRect(source.videoWidth, source.videoHeight, viewWidth, viewHeight, cropRect);
        c.save();
        c.translate(offsetX + (mirrorX ? viewWidth : 0), 0);
        c.scale(mirrorX ? -1 : 1, 1);
        c.drawImage(source, 0, 0, source.videoWidth, source.videoHeight, cropRect[0], cropRect[1], cropRect[2], cropRect[3]);
        c.restore();
      } else {
        calculateCoverCrop(source.videoWidth, source.videoHeight, viewWidth, viewHeight, cropRect);
        c.save();
        c.translate(offsetX + (mirrorX ? viewWidth : 0), 0);
        c.scale(mirrorX ? -1 : 1, 1);
        c.drawImage(source, cropRect[0], cropRect[1], cropRect[2], cropRect[3], 0, 0, viewWidth, viewHeight);
        c.restore();
      }
    };
    c.save();
    // Com videoBlend === 0 e filtro ativo, a segunda passada já desenha o quadro final.
    if (!(filter !== 'none' && state.videoBlend === 0)) drawSource();
    c.restore();
    if (state.videoBlend > 0 && filter !== 'none') {
      c.save();
      c.globalAlpha = state.videoBlend;
      c.filter = filter;
      drawSource();
      c.restore();
      c.globalAlpha = 1;
      c.filter = 'none';
    } else if (filter !== 'none' && state.videoBlend === 0) {
      c.save();
      c.filter = filter;
      drawSource();
      c.restore();
      c.filter = 'none';
    }
    c.restore();
  }

  // ---------- renderização principal ----------

  function renderFrame(applied, source = video) {
    if (!source.videoWidth) return;
    state.timing.camera = state.timing.camera ?? null;
    const t0 = performance.now();
    const glProgram = glState?.program;
    const glTexture = glState?.texture;
    const uniforms = glState?.uniforms;
    const useFallback = !gl || !glProgram || ((typeof forceFallback === 'function' && forceFallback()) && fallbackContext);
    if (useFallback) {
      if (fallbackContext) {
        if (state.effect === 'dither') {
          // Papel branco: os pontos pretos são desenhados no overlay por drawStipple.
          fallbackContext.save();
          fallbackContext.filter = 'none';
          fallbackContext.fillStyle = '#fff';
          fallbackContext.fillRect(0, 0, canvas.width, canvas.height);
          fallbackContext.restore();
        } else {
          const frameWidth = source.videoWidth || source.width;
          const frameHeight = source.videoHeight || source.height;
          fallbackContext.save();
          fallbackContext.filter = 'none'; // invert/threshold vivem nas janelas.
          const eyes = state.gearVr ? 2 : 1;
          const eyeWidth = canvas.width / eyes;
          for (let eye = 0; eye < eyes; eye++) {
            const x = Math.floor(eye * eyeWidth);
            const width = Math.ceil((eye + 1) * eyeWidth) - x;
            fallbackContext.save();
            fallbackContext.beginPath();
            fallbackContext.rect(x, 0, width, canvas.height);
            fallbackContext.clip();
            const mirrorX = (state.camera === 'user') !== state.flip;
            fallbackContext.translate(x + (mirrorX ? width : 0), 0);
            fallbackContext.scale(mirrorX ? -1 : 1, 1);
            if (state.gearVr) {
              drawContainedSource(fallbackContext, source, width, canvas.height);
            } else {
              calculateCoverCrop(frameWidth, frameHeight, width, canvas.height, cropRect);
              fallbackContext.drawImage(
                source,
                cropRect[0],
                cropRect[1],
                cropRect[2],
                cropRect[3],
                0,
                0,
                width,
                canvas.height
              );
            }
            fallbackContext.restore();
          }
          fallbackContext.restore();
        }
      }
      state.timing.camera = performance.now() - t0;
      state.timing.cycle = performance.now() - t0;
      return;
    }
    gl.useProgram(glProgram);
    gl.bindTexture(gl.TEXTURE_2D, glTexture);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } catch {
      return;
    }
    state.timing.camera = performance.now() - t0;
    gl.uniform1i(uniforms.uTexture, 0);
    gl.uniform1i(uniforms.uEffect, state.effect === 'dither' ? 2 : 3);

    gl.uniform1f(uniforms.uThreshold, .5 + applied.threshold);
    gl.uniform1f(uniforms.uBias, state.bias);
    gl.uniform1f(uniforms.uExposure, applied.exposure);
    gl.uniform1f(uniforms.uGrowth, applied.grow);
    gl.uniform1f(uniforms.uSpeed, applied.speed);
    gl.uniform1f(uniforms.uTime, performance.now() / 1000);
    gl.uniform1f(uniforms.uImageAspect, source.videoWidth / source.videoHeight);
    gl.uniform1f(
      uniforms.uViewportAspect,
      (state.gearVr ? canvas.width / 2 : canvas.width) / canvas.height
    );
    gl.uniform1i(uniforms.uMirror, state.camera === 'user' ? 1 : 0);
    gl.uniform1i(uniforms.uFlip, state.flip ? 1 : 0);
    gl.uniform1i(uniforms.uFit, state.gearVr ? 1 : 0);
    if (state.gearVr) {
      gl.viewport(0, 0, Math.floor(canvas.width / 2), canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.viewport(Math.floor(canvas.width / 2), 0, canvas.width - Math.floor(canvas.width / 2), canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.viewport(0, 0, canvas.width, canvas.height);
    } else {
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    state.timing.cycle = performance.now() - t0;
  }

  // ---------- pointillism (difusão de erro em CPU) ----------

  function ensureStippleGrid(cols, rows) {
    if (stippleGrid.width === cols && stippleGrid.height === rows) return stippleGrid;
    const n = cols * rows;
    const fract = value => value - Math.floor(value);
    const grid = {
      width: cols, height: rows, count: 0,
      luma: new Float32Array(n), error: new Float32Array(n),
      jitterX: new Float32Array(n), jitterY: new Float32Array(n),
      dotX: new Float32Array(n), dotY: new Float32Array(n), dotR: new Float32Array(n),
    };
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        grid.jitterX[i] = (fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453) - .5) * .44;
        grid.jitterY[i] = (fract(Math.sin(x * 269.5 + y * 183.3) * 43758.5453) - .5) * .44;
      }
    }
    stippleGrid = grid;
    return grid;
  }

  function drawStipple(c, source, viewWidth, viewHeight, offsetX, mirrorX) {
    const srcWidth = source?.videoWidth || source?.width || 0;
    const srcHeight = source?.videoHeight || source?.height || 0;
    if (!srcWidth || !srcHeight || typeof document === 'undefined') return;
    try {
      const scale = Math.min(1, STIPPLE_MAX_WIDTH / srcWidth, STIPPLE_MAX_HEIGHT / srcHeight);
      const width = Math.max(STIPPLE_SPACING, Math.round(srcWidth * scale));
      const height = Math.max(STIPPLE_SPACING, Math.round(srcHeight * scale));
      if (!stippleCanvas) {
        stippleCanvas = document.createElement('canvas');
        stippleContext = stippleCanvas.getContext('2d', { willReadFrequently: true });
        if (!stippleContext) return;
      }
      if (stippleCanvas.width !== width || stippleCanvas.height !== height) {
        stippleCanvas.width = width;
        stippleCanvas.height = height;
      }
      stippleContext.drawImage(source, 0, 0, srcWidth, srcHeight, 0, 0, width, height);
      const data = stippleContext.getImageData(0, 0, width, height).data;
      const cols = Math.max(16, Math.floor(width / STIPPLE_SPACING));
      const rows = Math.max(12, Math.floor(height / STIPPLE_SPACING));
      const grid = ensureStippleGrid(cols, rows);
      const cellW = width / cols, cellH = height / rows;
      const maxR = Math.min(cellW, cellH) * .48;
      let mean = 0;
      for (let y = 0; y < rows; y++) {
        const sy = Math.min(height - 1, Math.floor((y + .5) * cellH));
        for (let x = 0; x < cols; x++) {
          const sx = Math.min(width - 1, Math.floor((x + .5) * cellW));
          const i = (sy * width + sx) * 4;
          grid.luma[y * cols + x] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) / 65536;
          mean += grid.luma[y * cols + x];
        }
      }
      mean /= cols * rows;
      const cut = clamp(.14 + (state.threshold || 0) * .2 + (state.bias || 0) * .08, .08, .4);
      grid.error.fill(0);
      let count = 0;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          const stretched = clamp(.5 + (grid.luma[i] - mean) * 2.6, 0, 1);
          const value = 1 - stretched + grid.error[i];
          const tone = Math.pow(clamp((value - cut) / (1 - cut), 0, 1), .75);
          const quantized = Math.round(tone * STIPPLE_LEVELS) / STIPPLE_LEVELS;
          const diffusion = (value - quantized) * .85;
          if (x + 1 < cols) grid.error[i + 1] += diffusion * 7 / 16;
          if (y + 1 < rows) {
            const below = i + cols;
            if (x > 0) grid.error[below - 1] += diffusion * 3 / 16;
            grid.error[below] += diffusion * 5 / 16;
            if (x + 1 < cols) grid.error[below + 1] += diffusion / 16;
          }
          if (quantized <= 0) continue;
          grid.dotX[count] = (x + .5) * cellW + grid.jitterX[i] * cellW;
          grid.dotY[count] = (y + .5) * cellH + grid.jitterY[i] * cellH;
          grid.dotR[count] = maxR * quantized;
          count++;
        }
      }
      grid.count = count;
      if (!count) return;
      if (state.gearVr) {
        calculateContainRect(width, height, viewWidth, viewHeight, stippleCropRect);
      } else {
        calculateCoverCrop(width, height, viewWidth, viewHeight, stippleCropRect);
      }
      const cr = stippleCropRect;
      const scaleX = state.gearVr ? cr[2] / width : viewWidth / cr[2];
      const scaleY = state.gearVr ? cr[3] / height : viewHeight / cr[3];
      const baseX = state.gearVr ? cr[0] : -cr[0] * scaleX;
      const baseY = state.gearVr ? cr[1] : -cr[1] * scaleY;
      c.save();
      c.translate(offsetX + (mirrorX ? viewWidth : 0), 0);
      c.scale(mirrorX ? -1 : 1, 1);
      c.fillStyle = '#000';
      c.beginPath();
      for (let i = 0; i < count; i++) {
        const x = baseX + grid.dotX[i] * scaleX;
        const y = baseY + grid.dotY[i] * scaleY;
        const r = Math.max(.35, grid.dotR[i] * Math.min(scaleX, scaleY));
        c.moveTo(x + r, y);
        c.arc(x, y, r, 0, STIPPLE_TAU);
      }
      c.fill();
      c.restore();
    } catch (e) {
      if (!stippleWarned && typeof log === 'function') log(`Pointillism indisponível: ${e.message}`);
      stippleWarned = true;
    }
  }

  // ---------- overlay e gravação ----------

  function drawMaskOverlay(result, source = video, applied = {}) {
    const started = performance.now();
    const c = overlayContext;
    if (!c) return;
    // Nada a pintar: só limpa se o quadro anterior deixou algo no overlay.
    const reactive = !state.performance.effectsPaused
      && (state.waveEffect || state.meshEffect || state.networkEffect || state.distanceTelemetry);
    const dotted = state.effect === 'dither';
    const needsDrawing = dotted || state.trailEffect || state.showMask || state.videoWindows || state.overlay || reactive;
    if (!needsDrawing) {
      if (overlayDirty) {
        c.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        overlayDirty = false;
      }
      state.timing.windows = 0;
      state.timing.overlay = 0;
      state.timing.composition = performance.now() - started;
      return;
    }
    overlayDirty = true;
    const rect = stageViewport || overlayCanvas.getBoundingClientRect();
    c.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    if (!rect.width || !rect.height) {
      overlayDirty = false;
      return;
    }
    c.save();
    c.scale(overlayCanvas.width / rect.width, overlayCanvas.height / rect.height);
    const eyeCount = state.gearVr ? 2 : 1;
    const viewWidth = rect.width / eyeCount;
    const viewHeight = rect.height;
    if (state.trailEffect) recordBlobTrails(result.blobs);
    if (state.showMask) {
      if (maskCanvas.width !== result.width || maskCanvas.height !== result.height) {
        maskCanvas.width = result.width;
        maskCanvas.height = result.height;
        maskImage = maskContext.createImageData(result.width, result.height);
        maskView = new Uint32Array(maskImage.data.buffer);
      }
      const image = maskImage;
      const mask = result.mask;
      const packed = maskView || (maskView = new Uint32Array(image.data.buffer));
      const ON = 0xFFFFFFFF, OFF = 0xFF000000;
      for (let i = 0, n = mask.length; i < n; i++) packed[i] = mask[i] ? ON : OFF;
      maskContext.putImageData(image, 0, 0);
    }
    let windowCost = 0, overlayCost = 0;
    for (let eye = 0; eye < eyeCount; eye++) {
      const offsetX = eye * viewWidth;
      c.save();
      c.beginPath();
      c.rect(offsetX, 0, viewWidth, viewHeight);
      c.clip();
      if (state.gearVr && source.videoWidth && source.videoHeight) {
        calculateContainRect(source.videoWidth, source.videoHeight, viewWidth, viewHeight, cropRect);
        c.beginPath();
        c.rect(offsetX + cropRect[0], cropRect[1], cropRect[2], cropRect[3]);
        c.clip();
      }
      const mirrorX = (state.camera === 'user') !== state.flip;
      if (dotted) drawStipple(c, source, viewWidth, viewHeight, offsetX, mirrorX);
      if (state.videoWindows) {
        const windowStarted = performance.now();
        drawRawVideoWindows(c, result.blobs, viewWidth, viewHeight, offsetX, source, applied);
        windowCost += performance.now() - windowStarted;
      }
      if (state.showMask) {
        if (state.gearVr) {
          calculateContainRect(maskCanvas.width, maskCanvas.height, viewWidth, viewHeight, cropRect);
        } else {
          calculateCoverCrop(maskCanvas.width, maskCanvas.height, viewWidth, viewHeight, cropRect);
        }
        c.save();
        c.globalAlpha = .7;
        c.translate(offsetX + (mirrorX ? viewWidth : 0), 0);
        c.scale(mirrorX ? -1 : 1, 1);
        if (state.gearVr) {
          c.drawImage(maskCanvas, 0, 0, maskCanvas.width, maskCanvas.height, cropRect[0], cropRect[1], cropRect[2], cropRect[3]);
        } else {
          c.drawImage(maskCanvas, cropRect[0], cropRect[1], cropRect[2], cropRect[3], 0, 0, viewWidth, viewHeight);
        }
        c.restore();
      }
      const wantsViewPoints = !state.performance.effectsPaused
        && (state.waveEffect || state.meshEffect || state.networkEffect || state.distanceTelemetry);
      const blobViewCount = wantsViewPoints ? prepareBlobViewPoints(result.blobs, viewWidth, viewHeight) : 0;
      const overlayStarted = performance.now();
      if (!state.performance.effectsPaused) {
        if (state.trailEffect) drawTrails(c, viewWidth, viewHeight, offsetX);
        if (state.waveEffect) drawWaves(c, result.blobs, viewWidth, viewHeight, offsetX, performance.now(), blobViewCount);
        if (state.meshEffect) drawMesh(c, result.blobs, viewWidth, viewHeight, offsetX, blobViewCount);
      }
      if (state.networkEffect && !state.performance.effectsPaused) {
        drawBlobNetwork(c, result.blobs, viewWidth, viewHeight, offsetX, blobViewCount);
      }
      if (state.distanceTelemetry && !state.performance.effectsPaused) {
        drawDistanceTelemetry(c, result.blobs, viewWidth, viewHeight, offsetX, blobViewCount);
      }
      overlayCost += performance.now() - overlayStarted;
      if (state.overlay && state.lastSignal) {
        const cellW = viewWidth / 3;
        const cellH = viewHeight / 2;
        c.globalAlpha = .72;
        c.lineWidth = 1;
        c.strokeStyle = '#6ee7bc';
        c.fillStyle = '#6ee7bc';
        c.font = '10px monospace';
        for (let i = 0; i < 6; i++) {
          const x = offsetX + (i % 3) * cellW;
          const y = Math.floor(i / 3) * cellH;
          c.strokeRect(x + 4, y + 4, cellW - 8, cellH - 8);
          c.fillText(`${String(i + 1).padStart(2, '0')} ${Math.round(state.lastSignal.zones[i] * 100)}%`, x + 10, y + 18);
        }
        c.globalAlpha = .95;
        c.lineWidth = 2;
        c.strokeStyle = '#b9a1ff';
        c.fillStyle = '#f0eaff';
        c.font = 'bold 11px monospace';
        for (const blob of result.blobs) {
          mapVideoPoint(blob.left, blob.top, viewWidth, viewHeight, mapPointA);
          mapVideoPoint(blob.right, blob.bottom, viewWidth, viewHeight, mapPointB);
          const left = Math.min(mapPointA[0], mapPointB[0]);
          const top = Math.min(mapPointA[1], mapPointB[1]);
          const right = Math.max(mapPointA[0], mapPointB[0]);
          const bottom = Math.max(mapPointA[1], mapPointB[1]);
          c.strokeRect(offsetX + left * viewWidth, top * viewHeight, (right - left) * viewWidth, (bottom - top) * viewHeight);
          c.fillText(`B${blob.id}`, offsetX + left * viewWidth + 4, Math.max(12, top * viewHeight - 4));
        }
      }
      if (state.overlay) {
        c.globalAlpha = .95;
        c.strokeStyle = '#b9a1ff';
        c.lineWidth = 2;
        for (const r of state.manualRects) {
          c.strokeRect(offsetX + r.x * viewWidth, r.y * viewHeight, r.w * viewWidth, r.h * viewHeight);
        }
        if (state.dragRect) {
          const r = state.dragRect;
          c.strokeRect(offsetX + r.x * viewWidth, r.y * viewHeight, r.w * viewWidth, r.h * viewHeight);
        }
      }
      c.restore();
    }
    c.restore();
    state.timing.windows = windowCost;
    state.timing.overlay = overlayCost;
    state.timing.composition = performance.now() - started;
  }

  function drawRecordingComposite(force = false) {
    if (!recordingContext || (!force && recordingSnapshot.state !== 'recording') || !recordingCanvas.width || !recordingCanvas.height) return;
    const includeShade = !state.maxEffects && !state.gearVr && (!document.body.classList.contains('focus-mode') || document.body.classList.contains('recording-active'));
    drawRecordingFrame(recordingContext, canvas, overlayCanvas, recordingCanvas.width, recordingCanvas.height, includeShade, recordingWatermark);
  }

  return {
    calculateCoverCrop,
    calculateContainRect,
    drawContainedSource,
    mapVideoPoint,
    prepareBlobViewPoints,
    recordBlobTrails,
    drawTrails,
    drawWaves,
    deformGridPoint,
    drawMesh,
    drawBlobNetwork,
    drawDistanceTelemetry,
    drawRawVideoWindows,
    drawStipple,
    renderFrame,
    drawMaskOverlay,
    drawRecordingComposite,
    render: renderFrame,
  };
}
