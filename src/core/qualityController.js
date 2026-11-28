export function updateQualityBudgets(performanceState, analysisMs, renderMs, intervalMs, trackingWidth, maxWidth) {
  const analysisAverage = performanceState.analysisAverage
    ? performanceState.analysisAverage * 0.9 + analysisMs * 0.1
    : analysisMs;
  const renderAverage = performanceState.renderAverage
    ? performanceState.renderAverage * 0.9 + renderMs * 0.1
    : renderMs;
  const totalAverage = analysisAverage + renderAverage;
  const overBudget = totalAverage > intervalMs * 0.72;
  let slowFrames = overBudget ? performanceState.slowFrames + 1 : 0;
  let fastFrames = totalAverage < intervalMs * 0.45 ? performanceState.fastFrames + 1 : 0;
  let nextWidth = trackingWidth;
  const minWidth = 120;
  const dropAfter = totalAverage > intervalMs ? 4 : 8;

  if (slowFrames >= dropAfter && trackingWidth > minWidth) {
    nextWidth = Math.max(minWidth, trackingWidth - 40);
    slowFrames = 0;
    fastFrames = 0;
  } else if (fastFrames >= 180 && trackingWidth < maxWidth) {
    nextWidth = Math.min(maxWidth, trackingWidth + 40);
    fastFrames = 0;
  }

  return {
    analysisAverage,
    renderAverage,
    slowFrames,
    fastFrames,
    trackingWidth: nextWidth,
  };
}
