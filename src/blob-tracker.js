// Low-resolution foreground segmentation and connected-component tracking.
export class BlobTracker {
  constructor({ maxBlobs = 12, minAreaRatio = 0.00025, maxAreaRatio = 0.72 } = {}) {
    this.maxBlobs = maxBlobs;
    this.minAreaRatio = minAreaRatio;
    this.maxAreaRatio = maxAreaRatio;
    this.width = 0;
    this.height = 0;
    this.background = null;
    this.previous = [];
    this.nextId = 1;
    this.zonePixels = new Uint32Array(6);
    this.zoneHits = new Uint32Array(6);
    this.zoneCoverage = new Float64Array(6);
    this.availableTracks = new Uint8Array(maxBlobs);
  }

  reset() {
    this.background = null;
    this.previous = [];
  }

  resize(width, height) {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    const count = width * height;
    this.background = null;
    this.luma = new Float32Array(count);
    this.mask = new Uint8Array(count);
    this.visited = new Uint8Array(count);
    this.queue = new Int32Array(count);
    this.previous = [];
  }

  update(video, context, canvas, trackingWidth, threshold, dt) {
    // Blindagem: ignora quadros sem dimensão válida (vídeo ainda não pronto).
    if (!video.videoWidth || !video.videoHeight || context === null || context === undefined) return null;
    const safeDt = Math.min(1, Math.max(0.001, Number.isFinite(dt) ? dt : 0.04));
    const safeThreshold = Math.min(1, Math.max(0, Number.isFinite(threshold) ? threshold : 0.18));
    const width = Math.max(1, Math.min(Math.round(trackingWidth) || 320, video.videoWidth));
    const height = Math.max(1, Math.round(width * video.videoHeight / video.videoWidth));
    this.resize(width, height);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    context.drawImage(video, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const count = width * height;
    let lumaSum = 0;
    let changed = 0;

    for (let i = 0, p = 0; i < count; i++, p += 4) {
      const value = (pixels[p] * 0.299 + pixels[p + 1] * 0.587 + pixels[p + 2] * 0.114) / 255;
      this.luma[i] = value;
      lumaSum += value;
      const active = this.background && Math.abs(value - this.background[i]) > safeThreshold;
      this.mask[i] = active ? 1 : 0;
      if (active) changed++;
    }

    if (!this.background) {
      this.background = this.luma.slice();
      this.mask.fill(0);
    } else {
      for (let i = 0; i < count; i++) {
        if (!this.mask[i]) this.background[i] += (this.luma[i] - this.background[i]) * 0.006;
      }
    }

    const blobs = this.findComponents(width, height);
    this.assignTracks(blobs, width, height, safeDt);
    this.zonePixels.fill(0);
    this.zoneHits.fill(0);
    for (let y = 0; y < height; y++) {
      const row = Math.min(1, Math.floor(y * 2 / height));
      for (let x = 0; x < width; x++) {
        const zone = row * 3 + Math.min(2, Math.floor(x * 3 / width));
        const index = y * width + x;
        this.zonePixels[zone]++;
        if (this.mask[index]) this.zoneHits[zone]++;
      }
    }

    let occupiedZones = 0, meanSum = 0;
    for (let i = 0; i < 6; i++) {
      const value = this.zonePixels[i] ? this.zoneHits[i] / this.zonePixels[i] : 0;
      this.zoneCoverage[i] = value;
      if (value > 0.01) occupiedZones++;
      meanSum += value;
    }
    const mean = meanSum / 6;
    let varianceSum = 0;
    const zoneValues = new Array(6);
    for (let i = 0; i < 6; i++) {
      const value = this.zoneCoverage[i];
      varianceSum += (value - mean) ** 2;
      zoneValues[i] = Math.min(1, value * 5);
    }
    const variance = varianceSum / 6;
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
        energy: Math.min(1, changed / count * 5),
        density: Math.min(1, occupiedZones / 6),
        speed,
        coherence: mean ? Math.max(0, Math.min(1, 1 - Math.sqrt(variance) / (mean + 0.0001))) : 0,
        ambient: lumaSum / count,
        zones: zoneValues,
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

  assignTracks(blobs, width, height, dt) {
    const previousCount = this.previous.length;
    if (this.availableTracks.length < previousCount) this.availableTracks = new Uint8Array(previousCount);
    this.availableTracks.fill(0);
    this.availableTracks.fill(1, 0, previousCount);
    for (const blob of blobs) {
      let bestIndex = -1;
      let bestDistance = 0.18;
      for (let index = 0; index < previousCount; index++) {
        if (!this.availableTracks[index]) continue;
        const previous = this.previous[index];
        const distance = Math.hypot(blob.x - previous.x, blob.y - previous.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      }

      if (bestIndex >= 0) {
        const previous = this.previous[bestIndex];
        this.availableTracks[bestIndex] = 0;
        blob.id = previous.id;
        blob.speed = Math.min(1, bestDistance / Math.max(dt, 0.02) / 2);
      } else {
        blob.id = this.nextId++;
        blob.speed = 0;
      }
      blob.area = blob.pixels / (width * height);
      blob.width = blob.right - blob.left;
      blob.height = blob.bottom - blob.top;
    }
    for (let i = 0; i < blobs.length; i++) {
      const blob = blobs[i];
      let previous = this.previous[i];
      if (!previous) this.previous[i] = previous = { id: blob.id, x: blob.x, y: blob.y };
      previous.id = blob.id;
      previous.x = blob.x;
      previous.y = blob.y;
    }
    this.previous.length = blobs.length;
  }
}
