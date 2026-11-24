import { clamp } from '../core/utils.js';

export function createRender({
  state,
  canvas,
  overlayCanvas,
  gl,
  glProgram,
  texture,
  uniforms,
  fallbackContext,
  overlayContext,
  video,
  maskCanvas,
  maskContext,
  maskImage,
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
  resize,
  log,
  showToast,
  onMeter,
  sendAudioOptions,
  fmt,
}) {
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
    out[0] = state.camera === 'user' ? 1 - x : x;
    out[1] = state.flip ? 1 - y : y;
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

  function drawWaves(c, blobs, viewWidth, viewHeight, offsetX, now) {
    const count = prepareBlobViewPoints(blobs, viewWidth, viewHeight);
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

  function drawMesh(c, blobs, viewWidth, viewHeight, offsetX) {
    const count = Math.min(prepareBlobViewPoints(blobs, viewWidth, viewHeight), 8);
    const spacing = Math.max(34, Math.min(52, Math.min(viewWidth, viewHeight) / 11));
    c.globalAlpha = .22 + state.envelopes.density * .2;
    c.strokeStyle = '#ed72ff';
    c.lineWidth = .7 + state.envelopes.speed * .8;
    for (let y = 0; y <= viewHeight; y += spacing) {
      c.beginPath();
      for (let x = 0; x <= viewWidth; x += spacing) {
        deformGridPoint(x, y, blobs, count, viewWidth, viewHeight, gridPoint);
        if (x === 0) c.moveTo(offsetX + gridPoint[0], gridPoint[1]);
        else c.lineTo(offsetX + gridPoint[0], gridPoint[1]);
      }
      c.stroke();
    }
    for (let x = 0; x <= viewWidth; x += spacing) {
      c.beginPath();
      for (let y = 0; y <= viewHeight; y += spacing) {
        deformGridPoint(x, y, blobs, count, viewWidth, viewHeight, gridPoint);
        if (y === 0) c.moveTo(offsetX + gridPoint[0], gridPoint[1]);
        else c.lineTo(offsetX + gridPoint[0], gridPoint[1]);
      }
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  function drawBlobNetwork(c, blobs, viewWidth, viewHeight, offsetX = 0) {
    const count = prepareBlobViewPoints(blobs, viewWidth, viewHeight);
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
    for (let i = 0; i < count; i++) {
      c.beginPath();
      c.arc(offsetX + blobViewPoints[i * 2] * viewWidth, blobViewPoints[i * 2 + 1] * viewHeight, 3.2, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  function drawRawVideoWindows(c, blobs, viewWidth, viewHeight, offsetX, source) {
    if (!source?.videoWidth || !blobs.length) return;
    c.save();
    // These windows cover the filtered stage. Keep the selected visual style
    // visible inside them instead of exposing unfiltered camera pixels.
    c.filter = state.effect === 'invert' ? 'invert(1)'
      : state.effect === 'threshold' ? 'grayscale(1) contrast(8)'
        : 'grayscale(1) contrast(2)';
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
    if (state.gearVr) {
      calculateContainRect(source.videoWidth, source.videoHeight, viewWidth, viewHeight, cropRect);
      c.translate(offsetX + (state.camera === 'user' ? viewWidth : 0), state.flip ? viewHeight : 0);
      c.scale(state.camera === 'user' ? -1 : 1, state.flip ? -1 : 1);
      c.drawImage(source, 0, 0, source.videoWidth, source.videoHeight, cropRect[0], cropRect[1], cropRect[2], cropRect[3]);
      c.restore();
      return;
    }
    calculateCoverCrop(source.videoWidth, source.videoHeight, viewWidth, viewHeight, cropRect);
    c.translate(offsetX + (state.camera === 'user' ? viewWidth : 0), state.flip ? viewHeight : 0);
    c.scale(state.camera === 'user' ? -1 : 1, state.flip ? -1 : 1);
    c.drawImage(source, cropRect[0], cropRect[1], cropRect[2], cropRect[3], 0, 0, viewWidth, viewHeight);
    c.restore();
  }

  // ---------- renderização principal ----------

  function renderFrame(applied, source = video) {
    if (!source.videoWidth) return;
    state.timing.camera = state.timing.camera ?? null;
    const t0 = performance.now();
    resize();
    if (!gl || !glProgram) {
      if (fallbackContext) {
        fallbackContext.save();
        fallbackContext.filter =
          state.effect === 'invert' ? 'invert(1)'
            : state.effect === 'threshold' ? 'grayscale(1) contrast(8)'
              : 'grayscale(1) contrast(2)';
        const eyes = state.gearVr ? 2 : 1;
        const eyeWidth = canvas.width / eyes;
        for (let eye = 0; eye < eyes; eye++) {
          const x = Math.floor(eye * eyeWidth);
          const width = Math.ceil((eye + 1) * eyeWidth) - x;
          fallbackContext.save();
          fallbackContext.beginPath();
          fallbackContext.rect(x, 0, width, canvas.height);
          fallbackContext.clip();
          fallbackContext.translate(
            x + (state.camera === 'user' ? width : 0),
            state.flip ? canvas.height : 0
          );
          fallbackContext.scale(state.camera === 'user' ? -1 : 1, state.flip ? -1 : 1);
          if (state.gearVr) {
            drawContainedSource(fallbackContext, source, width, canvas.height);
          } else {
            calculateCoverCrop(source.videoWidth, source.videoHeight, width, canvas.height, cropRect);
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
      state.timing.camera = performance.now() - t0;
      state.timing.cycle = performance.now() - t0;
      return;
    }
    gl.useProgram(glProgram);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } catch {
      return;
    }
    state.timing.camera = performance.now() - t0;
    gl.uniform1i(uniforms.uTexture, 0);
    gl.uniform1i(uniforms.uEffect, ({ invert: 0, threshold: 1, dither: 2 })[state.effect]);
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

  // ---------- overlay e gravação ----------

  function drawMaskOverlay(result, source = video) {
    const started = performance.now();
    const c = overlayContext;
    if (!c) return;
    const rect = overlayCanvas.getBoundingClientRect();
    c.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    if (!rect.width || !rect.height) return;
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
      }
      const image = maskImage;
      for (let i = 0; i < result.mask.length; i++) {
        const q = i * 4;
        const value = result.mask[i] ? 255 : 0;
        image.data[q] = value;
        image.data[q + 1] = value;
        image.data[q + 2] = value;
        image.data[q + 3] = 255;
      }
      maskContext.putImageData(image, 0, 0);
    }
    let windowCost = 0;
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
      if (state.videoWindows) {
        const windowStarted = performance.now();
        drawRawVideoWindows(c, result.blobs, viewWidth, viewHeight, offsetX, source);
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
        c.translate(
          offsetX + (state.camera === 'user' ? viewWidth : 0),
          state.flip ? viewHeight : 0
        );
        c.scale(state.camera === 'user' ? -1 : 1, state.flip ? -1 : 1);
        if (state.gearVr) {
          c.drawImage(maskCanvas, 0, 0, maskCanvas.width, maskCanvas.height, cropRect[0], cropRect[1], cropRect[2], cropRect[3]);
        } else {
          c.drawImage(maskCanvas, cropRect[0], cropRect[1], cropRect[2], cropRect[3], 0, 0, viewWidth, viewHeight);
        }
        c.restore();
      }
      if (!state.performance.effectsPaused) {
        if (state.trailEffect) drawTrails(c, viewWidth, viewHeight, offsetX);
        if (state.waveEffect) drawWaves(c, result.blobs, viewWidth, viewHeight, offsetX, performance.now());
        if (state.meshEffect) drawMesh(c, result.blobs, viewWidth, viewHeight, offsetX);
      }
      if (state.networkEffect && !state.performance.effectsPaused) {
        drawBlobNetwork(c, result.blobs, viewWidth, viewHeight, offsetX);
      }
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
      if (state.drawingRect && state.keyboardPoint) {
        const point=state.keyboardPoint,x=offsetX+point.x*viewWidth,y=point.y*viewHeight;
        c.globalAlpha=1;c.strokeStyle='#74eaff';c.lineWidth=2;c.beginPath();c.arc(x,y,9,0,Math.PI*2);c.stroke();
        c.beginPath();c.moveTo(x-14,y);c.lineTo(x+14,y);c.moveTo(x,y-14);c.lineTo(x,y+14);c.stroke();
      }
      c.restore();
    }
    c.restore();
    state.timing.windows = windowCost;
    state.timing.composition = performance.now() - started;
  }

  function drawRecordingComposite(force = false) {
    if (!recordingContext || (!force && recordingSnapshot.state !== 'recording') || !recordingCanvas.width || !recordingCanvas.height) return;
    const includeShade = !state.gearVr && !document.body.classList.contains('focus-mode');
    drawRecordingFrame(recordingContext, canvas, overlayCanvas, recordingCanvas.width, recordingCanvas.height, includeShade);
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
    drawRawVideoWindows,
    renderFrame,
    drawMaskOverlay,
    drawRecordingComposite,
    render: renderFrame,
  };
}
