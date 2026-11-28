// Low-resolution foreground segmentation and connected-component tracking.
const STATIONARY_BACKGROUND_RATE = 0.02;

export class BlobTrackerCore {
  constructor({ maxBlobs = 12, minAreaRatio = 0.00025, maxAreaRatio = 0.72, calibrateFrames = 1, stationaryAbsorbFrames = 0 } = {}) {
    this.maxBlobs = maxBlobs;
    this.minAreaRatio = minAreaRatio;
    this.maxAreaRatio = maxAreaRatio;
    this.calibrateFrames = Math.max(1, Math.floor(Number(calibrateFrames) || 1));
    this.stationaryAbsorbFrames = Math.max(0, Math.floor(Number(stationaryAbsorbFrames) || 0));
    this.width = 0;
    this.height = 0;
    this.background = null;
    this.luma = null;
    this.mask = null;
    this.calibrationSum = null;
    this.calibrationCount = null;
    this.calibrationFrameCount = 0;
    this.visited = null;
    this.queue = null;
    this.absorbStamp = null;
    this.absorbStampId = 0;
    this.nextId = 1;
    this.idsNew = 0;
    this.tracks = Array.from({ length: maxBlobs }, () => ({
      id: 0, x: 0, y: 0, vx: 0, vy: 0,
      left: 0, top: 0, right: 0, bottom: 0, area: 0,
      age: 0, miss: 0, stationaryFrames: 0, alive: false,
    }));
    this.trackForBlob = new Int16Array(maxBlobs);
    this.matchedTracks = new Uint8Array(maxBlobs);
    this.matchedBlobs = new Uint8Array(maxBlobs);
    this.zonePixels = new Uint32Array(6);
    this.roiZonePixels = new Uint32Array(6);
    this.roiSampleCount = 0;
    this.zoneHits = new Uint32Array(6);
    this.zoneCoverage = new Float64Array(6);
    this.zoneValues = new Array(6).fill(0);
    this.zoneColumns = new Uint8Array(0);
    this.zoneRows = new Uint8Array(0);
    this.tileColumns = new Uint8Array(0);
    this.tileRows = new Uint8Array(0);
    this.gridSum = new Float32Array(16 * 16);
    this.gridSumSq = new Float32Array(16 * 16);
    this.gridCount = new Uint32Array(16 * 16);
    this.gridThresholds = new Float32Array(16 * 16);
    this.gridThresholds.fill(0.18);
    this.frameCount = 0;
    this.lastThreshold = null;
    this.lastRoiMask = null;
    this.lowLight = false;
    this.sceneShiftFrames = 0;
    this.sceneShiftLatched = false;
  }

  setMaxBlobs(n) {
    n = Math.max(4, Math.min(20, Math.floor(Number(n) || 12)));
    if (n === this.maxBlobs) return;
    this.maxBlobs = n;
    this.tracks = Array.from({ length: n }, () => ({
      id: 0, x: 0, y: 0, vx: 0, vy: 0,
      left: 0, top: 0, right: 0, bottom: 0, area: 0,
      age: 0, miss: 0, stationaryFrames: 0, alive: false,
    }));
    this.trackForBlob = new Int16Array(n);
    this.matchedTracks = new Uint8Array(n);
    this.matchedBlobs = new Uint8Array(n);
    this.nextId = 1;
    this.idsNew = 0;
  }

  reset() {
    this.background = null;
    this.lastRoiMask = null;
    this.calibrationFrameCount = 0;
    this.calibrationSum?.fill(0);
    this.calibrationCount?.fill(0);
    this.sceneShiftFrames = 0;
    this.sceneShiftLatched = false;
    for (const track of this.tracks) track.stationaryFrames = 0;
    for (const track of this.tracks) track.alive = false;
  }

  resize(width, height) {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    const count = width * height;
    this.background = null;
    this.luma = new Float32Array(count);
    this.mask = new Uint8Array(count);
    this.calibrationSum = this.calibrateFrames > 1 ? new Float32Array(count) : null;
    this.calibrationCount = this.calibrateFrames > 1 ? new Uint8Array(count) : null;
    this.calibrationFrameCount = 0;
    this.visited = new Uint8Array(count);
    this.queue = new Int32Array(count);
    this.absorbStamp = new Uint16Array(count);
    this.absorbStampId = 0;
    this.zoneColumns = new Uint8Array(width);
    this.zoneRows = new Uint8Array(height);
    this.tileColumns = new Uint8Array(width);
    this.tileRows = new Uint8Array(height);
    this.zonePixels.fill(0);
    this.roiZonePixels.fill(0);
    this.roiSampleCount = 0;
    for (let x = 0; x < width; x++) {
      this.zoneColumns[x] = Math.min(2, Math.floor(x * 3 / width));
      this.tileColumns[x] = Math.min(15, Math.floor(x * 16 / width));
    }
    for (let y = 0; y < height; y++) {
      this.zoneRows[y] = Math.min(1, Math.floor(y * 2 / height));
      this.tileRows[y] = Math.min(15, Math.floor(y * 16 / height));
    }
    for (let y = 0; y < height; y++) {
      const row = this.zoneRows[y] * 3;
      for (let x = 0; x < width; x++) this.zonePixels[row + this.zoneColumns[x]]++;
    }
    for (const track of this.tracks) track.alive = false;
  }

  updatePixels(pixels, width, height, threshold, dt, roiMask = null) {
    if (!pixels || pixels.length < width * height * 4 || width < 1 || height < 1) return null;
    if (roiMask && roiMask.length < width * height) return null;
    const safeDt = Math.min(1, Math.max(0.001, Number.isFinite(dt) ? dt : 0.04));
    const safeThreshold = Math.min(1, Math.max(0, Number.isFinite(threshold) ? threshold : 0.18));
    this.resize(width, height);
    const count = width * height;
    if (this.lastThreshold !== safeThreshold) {
      this.lastThreshold = safeThreshold;
      this.gridThresholds.fill(safeThreshold);
    }
    if (this.lastRoiMask !== roiMask) {
      this.lastRoiMask = roiMask;
      this.gridThresholds.fill(safeThreshold);
      this.roiZonePixels.fill(0);
      this.roiSampleCount = 0;
      if (roiMask) {
        for (let y = 0; y < height; y++) {
          const zoneRow = this.zoneRows[y] * 3;
          const rowStart = y * width;
          for (let x = 0; x < width; x++) {
            if (roiMask[rowStart + x]) {
              this.roiZonePixels[zoneRow + this.zoneColumns[x]]++;
              this.roiSampleCount++;
            }
          }
        }
      }
    }
    if (roiMask && this.roiSampleCount === 0 && this.lastRoiMask === roiMask) {
      // Segurança: resize/cache limpo com mesma referência de ROI.
      this.roiZonePixels.fill(0);
      for (let y = 0; y < height; y++) {
        const zoneRow = this.zoneRows[y] * 3;
        const rowStart = y * width;
        for (let x = 0; x < width; x++) {
          if (roiMask[rowStart + x]) {
            this.roiZonePixels[zoneRow + this.zoneColumns[x]]++;
            this.roiSampleCount++;
          }
        }
      }
    }
    const sampleCount = roiMask ? this.roiSampleCount : count;
    let lumaSum = 0;
    let changed = 0;
    let sceneDifferenceSum = 0;
    let sceneSampleCount = 0;
    const calibrating = !!this.calibrationSum && this.calibrationFrameCount < this.calibrateFrames;
    this.zoneHits.fill(0);

    if (!this.background) {
      for (let i = 0, p = 0; i < count; i++, p += 4) {
        const value = (pixels[p] * 0.299 + pixels[p + 1] * 0.587 + pixels[p + 2] * 0.114) / 255;
        this.luma[i] = value;
        lumaSum += value;
        if (this.calibrationSum) {
          this.calibrationSum[i] = value;
          this.calibrationCount[i] = roiMask && !roiMask[i] ? 0 : 1;
        }
      }
      this.background = this.luma.slice();
      this.mask.fill(0);
      if (roiMask) {
        for (let y = 0; y < height; y++) {
          const zoneRow = this.zoneRows[y] * 3;
          const rowStart = y * width;
          for (let x = 0; x < width; x++) {
            if (roiMask[rowStart + x]) this.roiZonePixels[zoneRow + this.zoneColumns[x]]++;
          }
        }
      }
    } else {
      const sampleColumn = this.frameCount & 3;
      for (let row = 0; row < 16; row++) {
        for (let column = sampleColumn; column < 16; column += 4) {
          const tile = row * 16 + column;
          this.gridSum[tile] = 0;
          this.gridSumSq[tile] = 0;
          this.gridCount[tile] = 0;
        }
      }
      let i = 0, p = 0;
      if (!roiMask) {
        if (!calibrating) {
          for (let y = 0; y < height; y++) {
            const zoneRow = this.zoneRows[y] * 3;
            const tileRow = this.tileRows[y] * 16;
            for (let x = 0; x < width; x++, i++, p += 4) {
              const value = (pixels[p] * 0.299 + pixels[p + 1] * 0.587 + pixels[p + 2] * 0.114) / 255;
              this.luma[i] = value;
              lumaSum += value;
              const difference = Math.abs(value - this.background[i]);
              const tileColumn = this.tileColumns[x];
              const tile = tileRow + tileColumn;
              const active = difference > this.gridThresholds[tile];
              this.mask[i] = active ? 1 : 0;
              if (active) {
                changed++;
                this.zoneHits[zoneRow + this.zoneColumns[x]]++;
              } else this.background[i] += (value - this.background[i]) * 0.006;
              if ((tileColumn & 3) === sampleColumn) {
                sceneDifferenceSum += difference;
                sceneSampleCount++;
                if (difference <= safeThreshold) {
                  this.gridSum[tile] += difference;
                  this.gridSumSq[tile] += difference * difference;
                  this.gridCount[tile]++;
                }
              }
            }
          }
        } else {
          for (let y = 0; y < height; y++) {
            const zoneRow = this.zoneRows[y] * 3;
            const tileRow = this.tileRows[y] * 16;
            for (let x = 0; x < width; x++, i++, p += 4) {
              const value = (pixels[p] * 0.299 + pixels[p + 1] * 0.587 + pixels[p + 2] * 0.114) / 255;
              this.luma[i] = value;
              lumaSum += value;
              const difference = Math.abs(value - this.background[i]);
              const tileColumn = this.tileColumns[x];
              const tile = tileRow + tileColumn;
              const active = difference > this.gridThresholds[tile];
              this.mask[i] = active ? 1 : 0;
              if (active) {
                changed++;
                this.zoneHits[zoneRow + this.zoneColumns[x]]++;
              }
              if (difference <= safeThreshold || this.calibrationCount[i] === 0) {
                this.calibrationSum[i] += value;
                this.calibrationCount[i] = Math.min(255, this.calibrationCount[i] + 1);
                this.background[i] = this.calibrationSum[i] / this.calibrationCount[i];
              }
              if ((tileColumn & 3) === sampleColumn) {
                sceneDifferenceSum += difference;
                sceneSampleCount++;
                if (difference <= safeThreshold) {
                  this.gridSum[tile] += difference;
                  this.gridSumSq[tile] += difference * difference;
                  this.gridCount[tile]++;
                }
              }
            }
          }
        }
      } else {
        for (let y = 0; y < height; y++) {
          const zoneRow = this.zoneRows[y] * 3;
          const tileRow = this.tileRows[y] * 16;
          for (let x = 0; x < width; x++, i++, p += 4) {
            const value = (pixels[p] * 0.299 + pixels[p + 1] * 0.587 + pixels[p + 2] * 0.114) / 255;
            this.luma[i] = value;
            lumaSum += value;
            if (!roiMask[i]) { this.mask[i] = 0; continue; }
            const difference = Math.abs(value - this.background[i]);
            const tileColumn = this.tileColumns[x];
            const tile = tileRow + tileColumn;
            const active = difference > this.gridThresholds[tile];
            this.mask[i] = active ? 1 : 0;
            if (active) {
              changed++;
              this.zoneHits[zoneRow + this.zoneColumns[x]]++;
            }
            if (calibrating) {
              if (difference <= safeThreshold || this.calibrationCount[i] === 0) {
                this.calibrationSum[i] += value;
                this.calibrationCount[i] = Math.min(255, this.calibrationCount[i] + 1);
                this.background[i] = this.calibrationSum[i] / this.calibrationCount[i];
              }
            } else if (!active) this.background[i] += (value - this.background[i]) * 0.006;
            if ((tileColumn & 3) === sampleColumn) {
              sceneDifferenceSum += difference;
              sceneSampleCount++;
              if (difference <= safeThreshold) {
                this.gridSum[tile] += difference;
                this.gridSumSq[tile] += difference * difference;
                this.gridCount[tile]++;
              }
            }
          }
        }
      }
      for (let row = 0; row < 16; row++) {
        for (let column = sampleColumn; column < 16; column += 4) {
          const tile = row * 16 + column;
          const samples = this.gridCount[tile];
          if (!samples) { this.gridThresholds[tile] = safeThreshold; continue; }
          const mean = this.gridSum[tile] / samples;
          const variance = Math.max(0, this.gridSumSq[tile] / samples - mean * mean);
          this.gridThresholds[tile] = Math.min(1, Math.max(safeThreshold, mean + 2.5 * Math.sqrt(variance)));
        }
      }
    }
    const ambient = lumaSum / count;
    if (this.calibrationFrameCount < this.calibrateFrames) this.calibrationFrameCount++;
    const sceneShiftCandidate = this.background && sceneDifferenceSum / Math.max(1, sceneSampleCount) > 0.28;
    let sceneShift = false;
    if (sceneShiftCandidate) {
      this.sceneShiftFrames++;
      if (this.sceneShiftFrames >= 40 && !this.sceneShiftLatched) {
        sceneShift = true;
        this.sceneShiftLatched = true;
      }
    } else {
      this.sceneShiftFrames = 0;
      this.sceneShiftLatched = false;
    }
    if (ambient < 0.12) this.lowLight = true;
    else if (ambient > 0.20) this.lowLight = false;
    this.frameCount++;

    const blobs = this.findComponents(width, height);
    this.assignTracks(blobs, width, height, safeDt);
    changed = this.absorbStationaryBlobs(blobs, width, height, roiMask, changed);

    let occupiedZones = 0, meanSum = 0;
    for (let i = 0; i < 6; i++) {
      const zonePixels = roiMask ? this.roiZonePixels[i] : this.zonePixels[i];
      const value = zonePixels ? this.zoneHits[i] / zonePixels : 0;
      this.zoneCoverage[i] = value;
      if (value > 0.01) occupiedZones++;
      meanSum += value;
    }
    const mean = meanSum / 6;
    let varianceSum = 0;
    for (let i = 0; i < 6; i++) {
      const value = this.zoneCoverage[i];
      varianceSum += (value - mean) ** 2;
      this.zoneValues[i] = Math.min(1, value * 5);
    }
    let centroidWeight = 0, centroidX = 0, centroidY = 0, speedSum = 0;
    for (const blob of blobs) {
      centroidWeight += blob.pixels;
      centroidX += blob.x * blob.pixels;
      centroidY += blob.y * blob.pixels;
      speedSum += blob.speed;
    }
    const centroid = centroidWeight ? { x: centroidX / centroidWeight, y: centroidY / centroidWeight } : null;
    const speed = blobs.length ? speedSum / blobs.length : 0;

    return {
      width,
      height,
      mask: this.mask,
      blobs,
      centroid,
      raw: {
        energy: Math.min(1, changed / Math.max(1, sampleCount) * 5),
        density: Math.min(1, occupiedZones / 6),
        speed,
        coherence: mean ? Math.max(0, Math.min(1, 1 - Math.sqrt(varianceSum / 6) / (mean + 0.0001))) : 0,
        ambient,
        lowLight: this.lowLight,
        sceneShift,
        idsNew: this.idsNew,
        zones: this.zoneValues,
        blobCount: blobs.length,
      },
    };
  }

  findComponents(width, height) {
    const mask = this.mask;
    const visited = this.visited;
    const queue = this.queue;
    const total = width * height;
    const minimum = Math.max(6, Math.round(total * this.minAreaRatio));
    const maximum = Math.round(total * this.maxAreaRatio);
    const found = [];
    visited.fill(0);

    for (let start = 0; start < total; start++) {
      if (!mask[start] || visited[start]) continue;
      let head = 0, tail = 0, sumX = 0, sumY = 0;
      let minX = width, minY = height, maxX = 0, maxY = 0;
      visited[start] = 1;
      queue[tail++] = start;

      while (head < tail) {
        const index = queue[head++];
        const x = index % width;
        const y = (index / width) | 0;
        sumX += x;
        sumY += y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            const next = ny * width + nx;
            if (mask[next] && !visited[next]) {
              visited[next] = 1;
              queue[tail++] = next;
            }
          }
        }
      }

      if (tail < minimum || tail > maximum) continue;
      found.push({
        pixels: tail,
        x: sumX / tail / width,
        y: sumY / tail / height,
        left: minX / width,
        top: minY / height,
        right: (maxX + 1) / width,
        bottom: (maxY + 1) / height,
      });
    }

    return found.sort((a, b) => b.pixels - a.pixels).slice(0, this.maxBlobs);
  }

  absorbStationaryBlobs(blobs, width, height, roiMask, changed) {
    if (!this.stationaryAbsorbFrames) return changed;
    for (let blobIndex = blobs.length - 1; blobIndex >= 0; blobIndex--) {
      const trackIndex = this.trackForBlob[blobIndex];
      if (trackIndex < 0) continue;
      const track = this.tracks[trackIndex];
      if (track.age <= 1 || track.miss !== 0 || track.stationaryFrames < this.stationaryAbsorbFrames) continue;
      const blob = blobs[blobIndex];
      const left = Math.max(0, Math.floor(blob.left * width));
      const top = Math.max(0, Math.floor(blob.top * height));
      const right = Math.min(width, Math.ceil(blob.right * width));
      const bottom = Math.min(height, Math.ceil(blob.bottom * height));

      // Semente: pixel de máscara mais próximo do centroide dentro do bbox.
      let seed = -1;
      const cx = Math.min(right - 1, Math.max(left, Math.round(blob.x * width)));
      const cy = Math.min(bottom - 1, Math.max(top, Math.round(blob.y * height)));
      for (let radius = 0, maxRadius = Math.max(right - left, bottom - top); radius <= maxRadius && seed < 0; radius++) {
        const y0 = Math.max(top, cy - radius), y1 = Math.min(bottom - 1, cy + radius);
        const x0 = Math.max(left, cx - radius), x1 = Math.min(right - 1, cx + radius);
        for (let y = y0; y <= y1 && seed < 0; y++) {
          for (let x = x0; x <= x1; x++) {
            if (radius > 0 && y > y0 && y < y1 && x > x0 && x < x1) continue;
            const index = y * width + x;
            if (this.mask[index] && !(roiMask && !roiMask[index])) { seed = index; break; }
          }
        }
      }
      if (seed < 0) { blobs.splice(blobIndex, 1); continue; }

      this.absorbStampId = (this.absorbStampId + 1) & 0xffff;
      if (this.absorbStampId === 0) { this.absorbStamp.fill(0); this.absorbStampId = 1; }
      const stamp = this.absorbStampId;
      const stampBuf = this.absorbStamp;
      const queue = this.queue;
      let head = 0, tail = 0;
      stampBuf[seed] = stamp;
      queue[tail++] = seed;
      while (head < tail) {
        const index = queue[head++];
        const x = index % width;
        const y = (index / width) | 0;
        this.background[index] += (this.luma[index] - this.background[index]) * STATIONARY_BACKGROUND_RATE;
        this.mask[index] = 0;
        const zone = this.zoneRows[y] * 3 + this.zoneColumns[x];
        if (this.zoneHits[zone]) this.zoneHits[zone]--;
        changed--;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < top || ny >= bottom) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            if (nx < left || nx >= right) continue;
            const next = ny * width + nx;
            if (stampBuf[next] === stamp || !this.mask[next] || (roiMask && !roiMask[next])) continue;
            stampBuf[next] = stamp;
            queue[tail++] = next;
          }
        }
      }
      blobs.splice(blobIndex, 1);
    }
    return Math.max(0, changed);
  }

  // P6: atribuição ótima para n pequeno (Hungarian), preservando gate/custo S3.
  _hungarian(cost, nRows, nCols) {
    // cost é matriz achatada nRows*nCols; retorna array colAssign[nCols] = row ou -1.
    const size = Math.max(nRows, nCols);
    const INF = 1e12;
    const a = new Float64Array(size * size);
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      a[r * size + c] = (r < nRows && c < nCols) ? cost[r * nCols + c] : INF;
    }
    const u = new Float64Array(size + 1), v = new Float64Array(size + 1);
    const p = new Int16Array(size + 1), way = new Int16Array(size + 1);
    for (let i = 1; i <= size; i++) {
      p[0] = i;
      let j0 = 0;
      const minv = new Float64Array(size + 1);
      const used = new Uint8Array(size + 1);
      for (let j = 0; j <= size; j++) minv[j] = INF;
      do {
        used[j0] = 1;
        const i0 = p[j0];
        let delta = INF, j1 = 0;
        for (let j = 1; j <= size; j++) {
          if (used[j]) continue;
          const cur = a[(i0 - 1) * size + (j - 1)] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
        if (delta >= INF / 2) { p[0] = 0; break; }
        for (let j = 0; j <= size; j++) {
          if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
          else minv[j] -= delta;
        }
        j0 = j1;
      } while (p[j0] !== 0);
      do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
    }
    const colAssign = new Int16Array(nCols);
    colAssign.fill(-1);
    for (let j = 1; j <= size; j++) {
      const row = p[j] - 1;
      const col = j - 1;
      if (row < nRows && col < nCols && cost[row * nCols + col] < INF) colAssign[col] = row;
    }
    return colAssign;
  }

  assignTracks(blobs, width, height, dt) {
    const trackCount = this.tracks.length;
    const blobCount = blobs.length;
    this.idsNew = 0;
    for (const blob of blobs) {
      blob.area = blob.pixels / (width * height);
      blob.width = blob.right - blob.left;
      blob.height = blob.bottom - blob.top;
    }
    this.matchedTracks.fill(0);
    this.matchedBlobs.fill(0);
    this.trackForBlob.fill(-1);
    const gateSquared = 0.18 * 0.18;

    // P6: atribuição ótima (Hungarian) entre trilhas elegíveis e blobs, preservando gate/custo S3.
    if (blobCount > 0) {
      const INF = 1e12;
      const viable = [];
      const viableCost = [];
      for (let trackIndex = 0; trackIndex < trackCount; trackIndex++) {
        const track = this.tracks[trackIndex];
        if (!track.alive || track.miss > 3) continue;
        const predictedX = track.x + track.vx * (track.miss + 1);
        const predictedY = track.y + track.vy * (track.miss + 1);
        let row = null;
        for (let blobIndex = 0; blobIndex < blobCount; blobIndex++) {
          const blob = blobs[blobIndex];
          const dx = blob.x - predictedX;
          const dy = blob.y - predictedY;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared > gateSquared) continue;
          if (!row) { row = new Float64Array(blobCount); row.fill(INF); }
          const predictedLeft = track.left + predictedX - track.x;
          const predictedTop = track.top + predictedY - track.y;
          const predictedRight = track.right + predictedX - track.x;
          const predictedBottom = track.bottom + predictedY - track.y;
          const left = Math.max(blob.left, predictedLeft);
          const top = Math.max(blob.top, predictedTop);
          const right = Math.min(blob.right, predictedRight);
          const bottom = Math.min(blob.bottom, predictedBottom);
          const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
          const trackBoxArea = (track.right - track.left) * (track.bottom - track.top);
          const union = blob.width * blob.height + trackBoxArea - intersection;
          const iou = union > 0 ? intersection / union : 0;
          const areaDelta = Math.abs(blob.area - track.area) / Math.max(blob.area, track.area, 1e-6);
          row[blobIndex] = 0.55 * distanceSquared / gateSquared + 0.25 * (1 - iou) + 0.20 * areaDelta;
        }
        if (row) { viable.push(trackIndex); viableCost.push(row); }
      }
      const nViable = viable.length;
      if (nViable > 0) {
        if (nViable === 1 && blobCount === 1) {
          // Fast path comum: 1x1.
          const c = viableCost[0][0];
          if (c < INF) { this.matchedBlobs[0] = 1; this.matchedTracks[viable[0]] = 1; this.trackForBlob[0] = viable[0]; }
        } else if (nViable <= 12 && blobCount <= 12) {
          const cost = new Float64Array(nViable * blobCount);
          for (let r = 0; r < nViable; r++) cost.set(viableCost[r], r * blobCount);
          const colAssign = this._hungarian(cost, nViable, blobCount);
          for (let blobIndex = 0; blobIndex < blobCount; blobIndex++) {
            const ri = colAssign[blobIndex];
            if (ri < 0) continue;
            if (cost[ri * blobCount + blobIndex] >= INF) continue;
            const trackIndex = viable[ri];
            this.matchedBlobs[blobIndex] = 1;
            this.matchedTracks[trackIndex] = 1;
            this.trackForBlob[blobIndex] = trackIndex;
          }
        } else {
          // Fallback seguro: greedy global (sem alocações grandes).
          for (let assignment = 0; assignment < Math.min(blobCount, nViable); assignment++) {
            let bestBlob = -1, bestRow = -1, bestCost = Infinity;
            for (let blobIndex = 0; blobIndex < blobCount; blobIndex++) {
              if (this.matchedBlobs[blobIndex]) continue;
              for (let r = 0; r < nViable; r++) {
                if (this.matchedTracks[viable[r]]) continue;
                const c = viableCost[r][blobIndex];
                if (c < bestCost) { bestCost = c; bestBlob = blobIndex; bestRow = r; }
              }
            }
            if (bestBlob < 0 || bestCost >= INF) break;
            this.matchedBlobs[bestBlob] = 1;
            this.matchedTracks[viable[bestRow]] = 1;
            this.trackForBlob[bestBlob] = viable[bestRow];
          }
        }
      }
    }

    for (let i = 0; i < trackCount; i++) {
      const track = this.tracks[i];
      if (!track.alive || this.matchedTracks[i]) continue;
      track.miss++;
      if (track.miss > 3) track.alive = false;
    }

    for (let i = 0; i < blobCount; i++) {
      const blob = blobs[i];
      let trackIndex = this.trackForBlob[i];
      if (trackIndex < 0) {
        for (let j = 0; j < trackCount; j++) {
          if (!this.tracks[j].alive) { trackIndex = j; break; }
        }
        if (trackIndex < 0) continue;
        const track = this.tracks[trackIndex];
        track.id = this.nextId++;
        this.idsNew++;
        track.x = blob.x;
        track.y = blob.y;
        track.vx = 0;
        track.vy = 0;
        track.age = 1;
        track.miss = 0;
        track.stationaryFrames = 1;
        track.alive = true;
        blob.speed = 0;
      } else {
        const track = this.tracks[trackIndex];
        const dx = blob.x - track.x;
        const dy = blob.y - track.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        // P8: deslocamento normalizado em pixels (S9: 1 px/quadro reinicia contagem).
        const movePx = Math.hypot(dx * width, dy * height);
        if (movePx < 0.75) track.stationaryFrames++;
        else if (movePx >= 1) track.stationaryFrames = 0;
        else track.stationaryFrames = Math.max(0, track.stationaryFrames - 1);
        blob.speed = Math.min(1, distance / Math.max(dt, 0.02) / 2);
        track.vx = track.vx * 0.5 + dx * 0.5;
        track.vy = track.vy * 0.5 + dy * 0.5;
        track.x = blob.x;
        track.y = blob.y;
        track.age++;
        track.miss = 0;
      }
      const track = this.tracks[trackIndex];
      track.left = blob.left;
      track.top = blob.top;
      track.right = blob.right;
      track.bottom = blob.bottom;
      track.area = blob.area;
      blob.id = track.id;
      blob.age = track.age;
    }
  }
}
