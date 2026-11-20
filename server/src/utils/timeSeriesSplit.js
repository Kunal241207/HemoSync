/**
 * Chronological Time-Series Splitting Utility
 * Strictly preserves temporal ordering to prevent data leakage.
 * Shuffling is prohibited for time series validation.
 */

/**
 * Splits an array of chronological daily records into train, validation, and test sets.
 * Default split: 70% train, 15% validation, 15% test.
 *
 * @param {Array} data Time-ordered observations (must already be sorted by date ascending)
 * @param {Object} options
 * @param {number} [options.trainRatio=0.7] Fraction for training
 * @param {number} [options.valRatio=0.15] Fraction for validation
 * @returns {Object} { train, validation, test, splitDates }
 */
export function chronologicalSplit(data = [], options = {}) {
  if (!Array.isArray(data) || data.length === 0) {
    return {
      train: [],
      validation: [],
      test: [],
      splitDates: null
    };
  }

  const { trainRatio = 0.7, valRatio = 0.15 } = options;
  const n = data.length;

  const trainEnd = Math.max(1, Math.floor(n * trainRatio));
  const valEnd = Math.max(trainEnd + 1, Math.floor(n * (trainRatio + valRatio)));

  const train = data.slice(0, trainEnd);
  const validation = data.slice(trainEnd, valEnd);
  const test = data.slice(valEnd);

  const splitDates = {
    trainStart: train[0]?.date || null,
    trainEnd: train[train.length - 1]?.date || null,
    valStart: validation[0]?.date || null,
    valEnd: validation[validation.length - 1]?.date || null,
    testStart: test[0]?.date || null,
    testEnd: test[test.length - 1]?.date || null
  };

  return {
    train,
    validation,
    test,
    splitDates
  };
}

/**
 * Generates rolling-origin backtest windows.
 * Each window expands the training history by stepSize and tests on next 'horizon' days.
 *
 * @param {Array} data Full daily series
 * @param {number} initialTrainSize Minimum observations before first forecast
 * @param {number} horizon Forecast horizon (e.g. 7 or 30 days)
 * @param {number} stepSize Days to advance between folds (default 7)
 * @returns {Array<{ train: Array, test: Array, foldIndex: number }>}
 */
export function generateRollingOriginFolds(data = [], initialTrainSize = 60, horizon = 7, stepSize = 7) {
  const folds = [];
  let trainEnd = initialTrainSize;
  let foldIndex = 0;

  while (trainEnd + horizon <= data.length) {
    const train = data.slice(0, trainEnd);
    const test = data.slice(trainEnd, trainEnd + horizon);

    folds.push({
      foldIndex,
      train,
      test,
      cutoffDate: train[train.length - 1]?.date
    });

    trainEnd += stepSize;
    foldIndex++;
  }

  return folds;
}

