export function updateQualityBudgets(performanceState, analysisMs, renderMs, intervalMs, trackingWidth, maxWidth) {
  const analysisAverage = performanceState.analysisAverage
    ? performanceState.analysisAverage * 0.9 + analysisMs * 0.1
    : analysisMs;
  const renderAverage = performanceState.renderAverage
    ? performanceState.renderAverage * 0.9 + renderMs * 0.1
    : renderMs;
  let slowFrames = analysisAverage > intervalMs * 0.5 ? performanceState.slowFrames + 1 : 0;
  let fastFrames = analysisAverage < intervalMs * 0.294 ? performanceState.fastFrames + 1 : 0;
  const renderSlowFrames = renderAverage > intervalMs * 0.4 ? performanceState.renderSlowFrames + 1 : 0;
  const renderPause = renderSlowFrames >= 8;
  let nextWidth = trackingWidth;

  if (slowFrames >= 12 && trackingWidth > 160) {
    nextWidth = Math.max(160, trackingWidth - 80);
    slowFrames = 0;
    fastFrames = 0;
  } else if (fastFrames >= 180 && trackingWidth < maxWidth) {
    nextWidth = Math.min(maxWidth, trackingWidth + 80);
    fastFrames = 0;
  }

  return {
    analysisAverage,
    renderAverage,
    slowFrames,
    fastFrames,
    renderSlowFrames,
    trackingWidth: nextWidth,
    renderPause,
  };
}
