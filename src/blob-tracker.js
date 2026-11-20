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
      const active = this.background && Math.abs(value - this.background[i]) > threshold;
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
    const zonePixels = Array(6).fill(0);
    const zones = Array(6).fill(0);
    for (let y = 0; y < height; y++) {
      const row = Math.min(1, Math.floor(y * 2 / height));
      for (let x = 0; x < width; x++) {
        const zone = row * 3 + Math.min(2, Math.floor(x * 3 / width));
        const index = y * width + x;
        zonePixels[zone]++;
        if (this.mask[index]) zones[zone]++;
      }
    }

    const zoneValues = zones.map((value, i) => zonePixels[i] ? value / zonePixels[i] : 0);
    const occupiedZones = zoneValues.filter(value => value > 0.01).length;
    const mean = zoneValues.reduce((sum, value) => sum + value, 0) / 6;
    const variance = zoneValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) / 6;
    const centroidWeight = blobs.reduce((sum, blob) => sum + blob.pixels, 0);
    const centroid = centroidWeight ? blobs.reduce((point, blob) => {
      point.x += blob.x * blob.pixels;
      point.y += blob.y * blob.pixels;
      return point;
    }, { x: 0, y: 0 }) : null;
    const speed = blobs.length ? blobs.reduce((sum, blob) => sum + blob.speed, 0) / blobs.length : 0;

    return {
      width,
      height,
      mask: this.mask,
      blobs,
      centroid: centroidWeight ? { x: centroid.x / centroidWeight, y: centroid.y / centroidWeight } : null,
      raw: {
        energy: Math.min(1, changed / count * 5),
        density: Math.min(1, occupiedZones / 6),
        speed,
        coherence: mean ? Math.max(0, Math.min(1, 1 - Math.sqrt(variance) / (mean + 0.0001))) : 0,
        ambient: lumaSum / count,
        zones: zoneValues.map(value => Math.min(1, value * 5)),
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
    const available = new Set(this.previous.map((_, index) => index));
    for (const blob of blobs) {
      let bestIndex = -1;
      let bestDistance = 0.18;
      for (const index of available) {
        const previous = this.previous[index];
        const distance = Math.hypot(blob.x - previous.x, blob.y - previous.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      }

      if (bestIndex >= 0) {
        const previous = this.previous[bestIndex];
        available.delete(bestIndex);
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
    this.previous = blobs.map(blob => ({ id: blob.id, x: blob.x, y: blob.y }));
  }
}
