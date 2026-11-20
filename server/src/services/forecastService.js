import { prisma } from '../config/db.js';
import {
  mean,
  calculateMae,
  calculateWape,
  computeEwma,
  computeRollingMean,
  seasonalNaiveForecast
} from '../utils/mathUtils.js';
import { chronologicalSplit, generateRollingOriginFolds } from '../utils/timeSeriesSplit.js';
import { logger } from '../utils/logger.js';

export const FORECAST_MODEL_VERSION = 'v1.0-clinical-ewma-backtested';
export const MIN_OBSERVATIONS_THRESHOLD = 14;

/**
 * Returns a simple, straightforward 14-day demand forecast by blood type.
 * Compares current stock with projected demand for illustration and risk identification.
 */
export async function getSimpleDemandForecast(institutionId = null) {
  const bloodTypes = [
    { abo: 'A', rh: 'POSITIVE', label: 'A+' },
    { abo: 'A', rh: 'NEGATIVE', label: 'A-' },
    { abo: 'B', rh: 'POSITIVE', label: 'B+' },
    { abo: 'B', rh: 'NEGATIVE', label: 'B-' },
    { abo: 'AB', rh: 'POSITIVE', label: 'AB+' },
    { abo: 'AB', rh: 'NEGATIVE', label: 'AB-' },
    { abo: 'O', rh: 'POSITIVE', label: 'O+' },
    { abo: 'O', rh: 'NEGATIVE', label: 'O-' }
  ];

  const now = new Date();
  const where = {
    inventoryStatus: 'AVAILABLE',
    testingStatus: 'PASSED',
    releaseStatus: 'RELEASED',
    expiryDate: { gt: now }
  };
  if (institutionId) {
    where.institutionId = institutionId;
  }

  const stockUnits = await prisma.bloodUnit.findMany({
    where,
    select: {
      aboGroup: true,
      rhFactor: true,
      componentType: true
    }
  });

  const stockCountMap = {};
  for (const u of stockUnits) {
    const key = `${u.aboGroup}${u.rhFactor === 'POSITIVE' ? '+' : '-'}`;
    stockCountMap[key] = (stockCountMap[key] || 0) + 1;
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentRequests = await prisma.bloodRequest.findMany({
    where: {
      createdAt: { gte: thirtyDaysAgo },
      ...(institutionId ? { hospitalId: institutionId } : {})
    },
    select: {
      requestedABO: true,
      requestedRh: true,
      requestedQuantity: true
    }
  });

  const demandCountMap = {};
  for (const r of recentRequests) {
    const key = `${r.requestedABO}${r.requestedRh === 'POSITIVE' ? '+' : '-'}`;
    demandCountMap[key] = (demandCountMap[key] || 0) + r.requestedQuantity;
  }

  const baselineDailyWeights = {
    'O+': 2.4,
    'A+': 2.1,
    'B+': 1.5,
    'O-': 1.2,
    'A-': 0.8,
    'AB+': 0.6,
    'B-': 0.5,
    'AB-': 0.3
  };

  const forecast = bloodTypes.map((bt) => {
    const key = bt.label;
    const historicalUnits = demandCountMap[key] || 0;
    const avgDaily = historicalUnits > 0
      ? Number((historicalUnits / 30).toFixed(1))
      : baselineDailyWeights[key] || 1.0;

    const projected14Day = Math.max(1, Math.round(avgDaily * 14));
    const currentStock = stockCountMap[key] || 0;
    const surplusDeficit = currentStock - projected14Day;

    let riskLevel = 'healthy';
    if (surplusDeficit < 0) {
      riskLevel = 'critical';
    } else if (surplusDeficit <= 3 || currentStock < projected14Day * 1.2) {
      riskLevel = 'watch';
    }

    return {
      bloodType: key,
      avgDailyDemand: avgDaily,
      projected14DayDemand: projected14Day,
      currentStock,
      surplusDeficit,
      riskLevel
    };
  });

  return {
    period: 'Next 14 days',
    generatedAt: new Date().toISOString(),
    forecast
  };
}

/**
 * Aggregates daily historical requested demand for an institution.
 * Demand is defined strictly as units REQUESTED, not units fulfilled.
 * Missing days are filled with zero-demand records to preserve regular daily periodicity.
 *
 * @param {Object} params
 * @param {string} params.institutionId
 * @param {string} [params.componentType]
 * @param {number} [params.lookbackDays=180]
 * @returns {Promise<Array<{ date: string, unitsRequested: number, requestCount: number, componentBreakdown: Object }>>}
 */
export async function getDailyHistoricalDemand(params) {
  const { institutionId, componentType, lookbackDays = 180 } = params;

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - lookbackDays);
  cutoff.setUTCHours(0, 0, 0, 0);

  const where = {
    hospitalId: institutionId,
    createdAt: { gte: cutoff }
  };

  if (componentType) {
    where.requestedComponent = componentType;
  }

  // Fetch all requests in range
  const requests = await prisma.bloodRequest.findMany({
    where,
    select: {
      id: true,
      requestedComponent: true,
      requestedABO: true,
      requestedRh: true,
      requestedQuantity: true,
      urgency: true,
      status: true,
      createdAt: true
    },
    orderBy: { createdAt: 'asc' }
  });

  // Group by UTC calendar day YYYY-MM-DD
  const dailyMap = new Map();

  // Pre-populate all days in the range to avoid missing day gaps
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const current = new Date(cutoff);

  while (current <= today) {
    const key = current.toISOString().split('T')[0];
    dailyMap.set(key, {
      date: key,
      unitsRequested: 0,
      requestCount: 0,
      emergencyUnits: 0,
      cancelledUnits: 0,
      componentBreakdown: {
        RED_BLOOD_CELLS: 0,
        PLATELETS: 0,
        PLASMA: 0
      }
    });
    current.setUTCDate(current.getUTCDate() + 1);
  }

  // Aggregate requests into days
  for (const req of requests) {
    const dayKey = req.createdAt.toISOString().split('T')[0];
    const dayRecord = dailyMap.get(dayKey);
    if (!dayRecord) continue;

    dayRecord.unitsRequested += req.requestedQuantity;
    dayRecord.requestCount += 1;

    if (req.urgency === 'EMERGENCY') {
      dayRecord.emergencyUnits += req.requestedQuantity;
    }
    if (req.status === 'CANCELLED') {
      dayRecord.cancelledUnits += req.requestedQuantity;
    }

    if (dayRecord.componentBreakdown[req.requestedComponent] !== undefined) {
      dayRecord.componentBreakdown[req.requestedComponent] += req.requestedQuantity;
    }
  }

  const series = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  return series;
}

/**
 * Runs chronological backtesting across baseline, rolling mean, seasonal naive, and EWMA models.
 * Selects the optimal model minimizing validation WAPE.
 *
 * @param {Array<{ date: string, unitsRequested: number }>} dailySeries
 * @param {number} horizon Days to forecast (7 or 30)
 * @returns {Object} Backtest evaluation results and best model
 */
export function backtestModels(dailySeries, horizon = 7) {
  const unitsSeries = dailySeries.map((d) => d.unitsRequested);

  if (unitsSeries.length < MIN_OBSERVATIONS_THRESHOLD) {
    return {
      isSufficientData: false,
      reason: `Historical observation length (${unitsSeries.length} days) is below minimum threshold (${MIN_OBSERVATIONS_THRESHOLD} days).`,
      bestModel: 'NAIVE_LAST',
      evaluations: []
    };
  }

  // Generate rolling origin folds: minimum 30 days initial training
  const initialTrain = Math.min(60, Math.floor(unitsSeries.length * 0.6));
  const folds = generateRollingOriginFolds(unitsSeries, initialTrain, horizon, 7);

  if (folds.length === 0) {
    // Fallback: simple chronological split
    const split = chronologicalSplit(unitsSeries, { trainRatio: 0.8, valRatio: 0.2 });
    folds.push({
      foldIndex: 0,
      train: split.train,
      test: split.validation
    });
  }

  // Candidate models
  const candidateModels = [
    { name: 'NAIVE_LAST', predict: (train, h) => new Array(h).fill(train[train.length - 1] || 0) },
    {
      name: 'ROLLING_MEAN_7D',
      predict: (train, h) => {
        const window = train.slice(-7);
        const avg = mean(window);
        return new Array(h).fill(Math.round(avg * 10) / 10);
      }
    },
    {
      name: 'SEASONAL_NAIVE_7D',
      predict: (train, h) => seasonalNaiveForecast(train, h, 7)
    },
    {
      name: 'EWMA_03',
      predict: (train, h) => {
        const smoothed = computeEwma(train, 0.3);
        const lastSmoothed = smoothed[smoothed.length - 1] || 0;
        return new Array(h).fill(Math.round(lastSmoothed * 10) / 10);
      }
    }
  ];

  const evaluations = [];

  for (const model of candidateModels) {
    const allActuals = [];
    const allPreds = [];

    for (const fold of folds) {
      const pred = model.predict(fold.train, fold.test.length);
      for (let i = 0; i < fold.test.length; i++) {
        allActuals.push(fold.test[i]);
        allPreds.push(pred[i]);
      }
    }

    const mae = calculateMae(allActuals, allPreds);
    const wape = calculateWape(allActuals, allPreds);

    evaluations.push({
      modelName: model.name,
      mae,
      wape,
      sampleCount: allActuals.length,
      horizonDays: horizon
    });
  }

  // Best model is the one with lowest WAPE (handles zero-demand days robustly)
  evaluations.sort((a, b) => a.wape - b.wape);
  const bestModel = evaluations[0]?.modelName || 'EWMA_03';

  return {
    isSufficientData: true,
    bestModel,
    evaluations
  };
}

/**
 * Generates forward demand forecast for a given institution and component.
 *
 * @param {Object} params
 * @param {string} params.institutionId
 * @param {string} params.componentType
 * @param {number} [params.horizonDays=7] 7 or 30 days
 * @returns {Promise<Object>} Forecast output with empirical intervals
 */
export async function generateComponentForecast(params) {
  const { institutionId, componentType, horizonDays = 7 } = params;

  const dailyHistory = await getDailyHistoricalDemand({
    institutionId,
    componentType,
    lookbackDays: 180
  });

  const unitsSeries = dailyHistory.map((d) => d.unitsRequested);

  // Backtest and select model
  const backtest = backtestModels(dailyHistory, horizonDays);

  let predictions = [];
  let modelUsed = backtest.bestModel;

  if (!backtest.isSufficientData) {
    // Insufficient historical data: fall back to simple mean or 0
    const fallbackVal = unitsSeries.length > 0 ? Math.round(mean(unitsSeries)) : 0;
    predictions = new Array(horizonDays).fill(fallbackVal);
    modelUsed = 'INSUFFICIENT_DATA_FALLBACK';
  } else if (modelUsed === 'SEASONAL_NAIVE_7D') {
    predictions = seasonalNaiveForecast(unitsSeries, horizonDays, 7);
  } else if (modelUsed === 'ROLLING_MEAN_7D') {
    const avg = mean(unitsSeries.slice(-7));
    predictions = new Array(horizonDays).fill(Math.max(0, Math.round(avg * 10) / 10));
  } else {
    // Default: EWMA
    const smoothed = computeEwma(unitsSeries, 0.3);
    const lastSmoothed = smoothed[smoothed.length - 1] || 0;
    predictions = new Array(horizonDays).fill(Math.max(0, Math.round(lastSmoothed * 10) / 10));
  }

  // Calculate empirical residuals on historical window for prediction uncertainty intervals
  const recentHistory = unitsSeries.slice(-30);
  const residuals = [];
  const recentMean = mean(recentHistory);
  for (const actual of recentHistory) {
    residuals.push(Math.abs(actual - recentMean));
  }
  const empiricalResidualSpread = residuals.length > 0 ? mean(residuals) : 2.0;

  // Construct daily forecast sequence
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const forecastPoints = [];
  let totalPredictedDemand = 0;

  for (let h = 1; h <= horizonDays; h++) {
    const fDate = new Date(today);
    fDate.setUTCDate(fDate.getUTCDate() + h);

    const pointPrediction = Math.max(0, predictions[h - 1] ?? predictions[0] ?? 0);
    // Empirical interval spread expands slightly with longer horizons: spread * sqrt(h)
    const horizonSpread = empiricalResidualSpread * Math.sqrt(1 + (h - 1) * 0.05);

    const lowerBound = Math.max(0, Math.round((pointPrediction - 1.28 * horizonSpread) * 10) / 10);
    const upperBound = Math.round((pointPrediction + 1.28 * horizonSpread) * 10) / 10;

    totalPredictedDemand += pointPrediction;

    forecastPoints.push({
      date: fDate.toISOString().split('T')[0],
      dayOffset: h,
      predictedDemand: Math.round(pointPrediction * 10) / 10,
      lowerBound,
      upperBound
    });
  }

  return {
    institutionId,
    componentType,
    horizonDays,
    modelVersion: FORECAST_MODEL_VERSION,
    modelSelected: modelUsed,
    isSufficientData: backtest.isSufficientData,
    historicalDaysCount: dailyHistory.length,
    totalPredictedDemand: Math.round(totalPredictedDemand * 10) / 10,
    forecastPoints,
    backtestEvaluations: backtest.evaluations,
    intervalDisclaimer:
      'Empirical intervals represent observed residual dispersion on historical validation windows, not clinical confidence guarantees. Treat forecasts strictly as operational planning support.',
    generatedAt: new Date().toISOString()
  };
}

/**
 * Generates and persists forecasts for all blood components at an institution.
 *
 * @param {string} institutionId
 * @param {number} horizonDays
 * @returns {Promise<Array>} List of generated forecasts
 */
export async function generateAndPersistAllForecasts(institutionId, horizonDays = 7) {
  const components = ['RED_BLOOD_CELLS', 'PLATELETS', 'PLASMA'];
  const results = [];

  for (const componentType of components) {
    const forecast = await generateComponentForecast({
      institutionId,
      componentType,
      horizonDays
    });

    // Persist to PostgreSQL demand_forecasts table
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    for (const point of forecast.forecastPoints) {
      const forecastDateTime = new Date(`${point.date}T00:00:00.000Z`);

      // Upsert daily forecast point
      const existing = await prisma.demandForecast.findFirst({
        where: {
          institutionId,
          componentType,
          forecastDate: forecastDateTime,
          horizonDays
        }
      });

      if (existing) {
        await prisma.demandForecast.update({
          where: { id: existing.id },
          data: {
            predictedDemand: point.predictedDemand,
            lowerBound: point.lowerBound,
            upperBound: point.upperBound,
            modelVersion: forecast.modelVersion,
            metrics: {
              modelSelected: forecast.modelSelected,
              backtest: forecast.backtestEvaluations
            },
            generatedAt: new Date()
          }
        });
      } else {
        await prisma.demandForecast.create({
          data: {
            institutionId,
            componentType,
            forecastDate: forecastDateTime,
            horizonDays,
            predictedDemand: point.predictedDemand,
            lowerBound: point.lowerBound,
            upperBound: point.upperBound,
            modelVersion: forecast.modelVersion,
            metrics: {
              modelSelected: forecast.modelSelected,
              backtest: forecast.backtestEvaluations
            },
            generatedAt: new Date()
          }
        });
      }
    }

    // Persist model evaluations to model_evaluations table
    if (forecast.backtestEvaluations && forecast.backtestEvaluations.length > 0) {
      for (const ev of forecast.backtestEvaluations) {
        await prisma.modelEvaluation.create({
          data: {
            institutionId,
            componentType,
            horizonDays,
            modelName: ev.modelName,
            mae: ev.mae,
            wape: ev.wape,
            sampleCount: ev.sampleCount,
            isBestModel: ev.modelName === forecast.modelSelected,
            trainingStart: new Date(today.getTime() - 180 * 86400000),
            trainingEnd: today,
            evaluatedAt: new Date()
          }
        });
      }
    }

    results.push(forecast);
  }

  return results;
}

/**
 * Retrieves persisted forecasts for an institution.
 */
export async function getPersistedForecasts(actorUser, query = {}) {
  const { componentType, horizonDays = 7, institutionId } = query;

  let targetInstitutionId = null;
  if (actorUser.role !== 'PLATFORM_ADMIN') {
    if (!actorUser.institutionId) {
      const error = new Error('User is not associated with an institution');
      error.statusCode = 403;
      throw error;
    }
    targetInstitutionId = actorUser.institutionId;
  } else if (institutionId) {
    targetInstitutionId = institutionId;
  }

  const where = {};
  if (targetInstitutionId) where.institutionId = targetInstitutionId;
  if (componentType) where.componentType = componentType;
  if (horizonDays) where.horizonDays = parseInt(horizonDays, 10);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  where.forecastDate = { gte: today };

  const forecasts = await prisma.demandForecast.findMany({
    where,
    orderBy: [{ componentType: 'asc' }, { forecastDate: 'asc' }],
    include: {
      institution: { select: { id: true, name: true, type: true } }
    }
  });

  return forecasts;
}

