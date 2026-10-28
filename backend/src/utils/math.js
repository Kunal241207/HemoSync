/** Forecasting and statistical utilities. */

/** Seeded Mulberry32 pseudo-random number generator. */
export function createSeededRng(seed = 123456789) {
  let s = Math.floor(seed);
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mean(values) {
  if (!values || values.length === 0) return 0;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return sum / values.length;
}

export function median(values) {
  if (!values || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function medianAbsoluteDeviation(values) {
  if (!values || values.length === 0) return 0;
  const med = median(values);
  const deviations = values.map((v) => Math.abs(v - med));
  return median(deviations);
}

export function standardDeviation(values) {
  if (!values || values.length <= 1) return 0;
  const avg = mean(values);
  const variance = values.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function calculateMae(actuals, predictions) {
  if (!actuals || actuals.length === 0) return 0;
  const n = Math.min(actuals.length, predictions.length);
  if (n === 0) return 0;
  let sumErr = 0;
  for (let i = 0; i < n; i++) {
    sumErr += Math.abs(actuals[i] - predictions[i]);
  }
  return Math.round((sumErr / n) * 100) / 100;
}

/** Weighted absolute percentage error; handles zero-demand periods. */
export function calculateWape(actuals, predictions) {
  if (!actuals || actuals.length === 0) return 0;
  const n = Math.min(actuals.length, predictions.length);
  if (n === 0) return 0;
  let sumErr = 0;
  let sumActual = 0;
  for (let i = 0; i < n; i++) {
    sumErr += Math.abs(actuals[i] - predictions[i]);
    sumActual += actuals[i];
  }
  if (sumActual === 0) {
    return sumErr === 0 ? 0 : 1;
  }
  return Math.round((sumErr / sumActual) * 1000) / 1000;
}

export function computeEwma(series, alpha = 0.3) {
  if (!series || series.length === 0) return [];
  const smoothed = new Array(series.length);
  smoothed[0] = series[0];
  for (let t = 1; t < series.length; t++) {
    smoothed[t] = alpha * series[t] + (1 - alpha) * smoothed[t - 1];
  }
  return smoothed;
}

export function computeRollingMean(series, windowSize = 7) {
  if (!series || series.length === 0) return [];
  const result = [];
  for (let i = 0; i < series.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const window = series.slice(start, i + 1);
    result.push(mean(window));
  }
  return result;
}

export function seasonalNaiveForecast(series, horizon = 7, seasonLength = 7) {
  if (!series || series.length === 0) return new Array(horizon).fill(0);
  const forecasts = [];
  for (let h = 0; h < horizon; h++) {
    const historicalIdx = series.length - seasonLength + (h % seasonLength);
    const val = historicalIdx >= 0 ? series[historicalIdx] : series[series.length - 1];
    forecasts.push(Math.max(0, val));
  }
  return forecasts;
}
