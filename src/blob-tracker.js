import { BlobTrackerCore } from './domain/blobTrackerCore.js';

// Browser adapter: capture a low-resolution frame, then pass pixels to the pure tracker.
export class BlobTracker extends BlobTrackerCore {
  update(video, context, canvas, trackingWidth, threshold, dt, roiMask = null) {
    if (!video?.videoWidth || !video?.videoHeight || !context) return null;
    const width = Math.max(1, Math.min(Math.round(trackingWidth) || 320, video.videoWidth));
    const height = Math.max(1, Math.round(width * video.videoHeight / video.videoWidth));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.drawImage(video, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    return this.updatePixels(pixels, width, height, threshold, dt, roiMask);
  }
}
