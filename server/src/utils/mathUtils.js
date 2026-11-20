/**
 * Mathematical & Statistical Utilities for Time-Series Analysis,
 * Forecasting, Error Metrics, and Robust Anomaly Detection.
 * Pure JavaScript, no external dependencies.
 */

/**
 * Seeded pseudo-random number generator (Mulberry32) for reproducible synthetic data.
 * @param {number} seed Integer seed
 * @returns {() => number} Returns float between 0 and 1
 */
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

/**
 * Calculates mean of an array of numbers.
 */
export function mean(values) {
  if (!values || values.length === 0) return 0;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return sum / values.length;
}

/** Sample variance (n - 1 denominator), matching standardDeviation. */
export function variance(values) {
  if (!values || values.length <= 1) return 0;
  const avg = mean(values);
  return values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
}

/** Draw a non-negative integer from a Poisson distribution using the supplied RNG. */
export function samplePoisson(lambda, rng = Math.random) {
  if (!Number.isFinite(lambda) || lambda < 0) throw new RangeError('lambda must be a finite non-negative number');
  if (lambda === 0) return 0;
  const threshold = Math.exp(-lambda);
  let product = 1;
  let count = 0;
  do {
    count += 1;
    product *= rng();
  } while (product > threshold);
  return count - 1;
}

/**
 * Calculates median of an array of numbers. 
 */
export function median(values) {
  if (!values || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Calculates Median Absolute Deviation (MAD).
 * MAD = median(|x_i - median(X)|)
 */
export function medianAbsoluteDeviation(values) {
  if (!values || values.length === 0) return 0;
  const med = median(values);
  const deviations = values.map((v) => Math.abs(v - med));
  return median(deviations);
}

/**
 * Calculates standard deviation.
 */
export function standardDeviation(values) {
  if (!values || values.length <= 1) return 0;
  const avg = mean(values);
  return Math.sqrt(variance(values));
}

/**
 * Mean Absolute Error (MAE)
 */
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

/**
 * Weighted Absolute Percentage Error (WAPE)
 * WAPE = sum(|actual_t - forecast_t|) / sum(actual_t)
 * Note: MAPE fails / divides by zero when actual demand is 0 on intermittent days.
 * WAPE handles zero-demand days robustly by summing actual demand in the denominator.
 */
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
    return sumErr === 0 ? 0 : 1; // 100% error if actual was 0 but forecast predicted demand
  }
  return Math.round((sumErr / sumActual) * 1000) / 1000;
}

/**
 * Computes Exponentially Weighted Moving Average (EWMA)
 * S_t = alpha * Y_t + (1 - alpha) * S_{t-1}
 * @param {number[]} series Time-ordered series
 * @param {number} alpha Smoothing parameter 0 < alpha <= 1 (default 0.3)
 * @returns {number[]} Smoothed series
 */
export function computeEwma(series, alpha = 0.3) {
  if (!series || series.length === 0) return [];
  const smoothed = new Array(series.length);
  smoothed[0] = series[0];
  for (let t = 1; t < series.length; t++) {
    smoothed[t] = alpha * series[t] + (1 - alpha) * smoothed[t - 1];
  }
  return smoothed;
}

/**
 * Computes simple moving average of window size k.
 */
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

/**
 * Seasonal Naive forecast (cycles back 'seasonLength' periods, default 7 days for weekly cycle).
 */
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

