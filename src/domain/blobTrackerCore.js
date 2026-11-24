// Low-resolution foreground segmentation and connected-component tracking.
export class BlobTrackerCore {
  constructor({ maxBlobs = 12, minAreaRatio = 0.00025, maxAreaRatio = 0.72 } = {}) {
    this.maxBlobs = maxBlobs;
    this.minAreaRatio = minAreaRatio;
    this.maxAreaRatio = maxAreaRatio;
    this.width = 0;
    this.height = 0;
    this.background = null;
    this.luma = null;
    this.mask = null;
    this.visited = null;
    this.queue = null;
    this.nextId = 1;
    this.tracks = Array.from({ length: maxBlobs }, () => ({
      id: 0, x: 0, y: 0, vx: 0, vy: 0,
      left: 0, top: 0, right: 0, bottom: 0, area: 0,
      age: 0, miss: 0, alive: false,
    }));
    this.trackForBlob = new Int16Array(maxBlobs);
    this.matchedTracks = new Uint8Array(maxBlobs);
    this.matchedBlobs = new Uint8Array(maxBlobs);
    this.zonePixels = new Uint32Array(6);
    this.zoneHits = new Uint32Array(6);
    this.zoneCoverage = new Float64Array(6);
    this.zoneValues = new Array(6).fill(0);
  }

  reset() {
    this.background = null;
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
    this.visited = new Uint8Array(count);
    this.queue = new Int32Array(count);
    for (const track of this.tracks) track.alive = false;
  }

  updatePixels(pixels, width, height, threshold, dt) {
    if (!pixels || pixels.length < width * height * 4 || width < 1 || height < 1) return null;
    const safeDt = Math.min(1, Math.max(0.001, Number.isFinite(dt) ? dt : 0.04));
    const safeThreshold = Math.min(1, Math.max(0, Number.isFinite(threshold) ? threshold : 0.18));
    this.resize(width, height);
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
        energy: Math.min(1, changed / count * 5),
        density: Math.min(1, occupiedZones / 6),
        speed,
        coherence: mean ? Math.max(0, Math.min(1, 1 - Math.sqrt(varianceSum / 6) / (mean + 0.0001))) : 0,
        ambient: lumaSum / count,
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

  assignTracks(blobs, width, height, dt) {
    const trackCount = this.tracks.length;
    const blobCount = blobs.length;
    for (const blob of blobs) {
      blob.area = blob.pixels / (width * height);
      blob.width = blob.right - blob.left;
      blob.height = blob.bottom - blob.top;
    }
    this.matchedTracks.fill(0);
    this.matchedBlobs.fill(0);
    this.trackForBlob.fill(-1);
    const gateSquared = 0.18 * 0.18;

    // Greedy global assignment: select the cheapest remaining blob/track pair.
    for (let assignment = 0; assignment < Math.min(blobCount, trackCount); assignment++) {
      let bestBlob = -1, bestTrack = -1, bestCost = Infinity;
      for (let blobIndex = 0; blobIndex < blobCount; blobIndex++) {
        if (this.matchedBlobs[blobIndex]) continue;
        const blob = blobs[blobIndex];
        for (let trackIndex = 0; trackIndex < trackCount; trackIndex++) {
          if (this.matchedTracks[trackIndex]) continue;
          const track = this.tracks[trackIndex];
          if (!track.alive || track.miss > 3) continue;
          const predictedX = track.x + track.vx * (track.miss + 1);
          const predictedY = track.y + track.vy * (track.miss + 1);
          const dx = blob.x - predictedX;
          const dy = blob.y - predictedY;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared > gateSquared) continue;
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
          const cost = 0.55 * distanceSquared / gateSquared + 0.25 * (1 - iou) + 0.20 * areaDelta;
          if (cost < bestCost) {
            bestCost = cost;
            bestBlob = blobIndex;
            bestTrack = trackIndex;
          }
        }
      }
      if (bestBlob < 0) break;
      this.matchedBlobs[bestBlob] = 1;
      this.matchedTracks[bestTrack] = 1;
      this.trackForBlob[bestBlob] = bestTrack;
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
        track.x = blob.x;
        track.y = blob.y;
        track.vx = 0;
        track.vy = 0;
        track.age = 1;
        track.miss = 0;
        track.alive = true;
        blob.speed = 0;
      } else {
        const track = this.tracks[trackIndex];
        const dx = blob.x - track.x;
        const dy = blob.y - track.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
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
