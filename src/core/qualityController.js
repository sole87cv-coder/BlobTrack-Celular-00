export function adjustTrackingQuality(performanceState, costMs, budgetMs, trackingWidth, targetFps, maxWidth, maxFps) {
  const average = performanceState.average
    ? performanceState.average * 0.9 + costMs * 0.1
    : costMs;
  let slowFrames = average > budgetMs ? performanceState.slowFrames + 1 : 0;
  let fastFrames = average < budgetMs * 0.42 ? performanceState.fastFrames + 1 : 0;
  let nextWidth = trackingWidth;
  let nextFps = targetFps;

  if (slowFrames >= 12) {
    nextWidth = Math.max(160, trackingWidth - 80);
    if (nextWidth === trackingWidth) nextFps = Math.max(12, targetFps - 2);
    slowFrames = 0;
    fastFrames = 0;
  } else if (fastFrames >= 180) {
    nextWidth = Math.min(maxWidth, trackingWidth + 80);
    if (nextWidth === trackingWidth) nextFps = Math.min(maxFps, targetFps + 2);
    fastFrames = 0;
  }

  return { average, slowFrames, fastFrames, trackingWidth: nextWidth, targetFps: nextFps };
}
