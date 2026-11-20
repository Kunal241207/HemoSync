import React, { useState, useEffect } from 'react';
import apiClient from '../services/api';
import LoadingState from '../components/common/LoadingState';
import ErrorMessage from '../components/common/ErrorMessage';
import { AlertTriangle, Info, RefreshCw } from 'lucide-react';

export function DemandForecastPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [forecastData, setForecastData] = useState(null);

  const fetchForecast = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getSimpleForecast();
      setForecastData(res?.data || null);
    } catch (err) {
      setError(err.message || 'Failed to load demand forecast');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForecast();
  }, []);

  if (loading) {
    return <LoadingState message="Calculating 14-day demand forecast..." />;
  }

  if (error) {
    return <ErrorMessage message={error} onRetry={fetchForecast} />;
  }

  const items = forecastData?.forecast || [];
  const totalProjected = items.reduce((sum, item) => sum + (item.projected14DayDemand || 0), 0);
  const totalStock = items.reduce((sum, item) => sum + (item.currentStock || 0), 0);
  const netBalance = totalStock - totalProjected;

  const shortages = items.filter((f) => f.riskLevel === 'critical');
  const watches = items.filter((f) => f.riskLevel === 'watch');

  return (
    <div>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Inventory Planning</p>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.04em' }}>
            Demand Forecast
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
            14-day forward projection based on clinical usage patterns and current verified stock.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={fetchForecast}>
          <RefreshCw size={13} className={loading ? 'spin-icon' : ''} />
          <span>Refresh Projections</span>
        </button>
      </div>

      <div className="metric-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="metric-card">
          <span className="metric-label">14-Day Demand Need</span>
          <strong>{totalProjected}</strong>
          <span className="neutral">Projected units required</span>
        </div>

        <div className="metric-card">
          <span className="metric-label">Current Stock</span>
          <strong>{totalStock}</strong>
          <span className="positive">Available units in banks</span>
        </div>

        <div className={`metric-card ${netBalance < 0 ? 'alert' : ''}`}>
          <span className="metric-label">Net Projected Balance</span>
          <strong style={{ color: netBalance < 0 ? '#b91c1c' : '#2d6a4f' }}>
            {netBalance > 0 ? `+${netBalance}` : netBalance}
          </strong>
          <span className={netBalance < 0 ? 'warning' : 'positive'}>
            {netBalance < 0 ? 'Projected regional deficit' : 'Adequate supply buffer'}
          </span>
        </div>

        <div className="metric-card">
          <span className="metric-label">At-Risk Blood Types</span>
          <strong style={{ color: shortages.length > 0 ? '#b91c1c' : 'inherit' }}>
            {shortages.length}
          </strong>
          <span className={shortages.length > 0 ? 'warning' : 'positive'}>
            {shortages.length > 0 ? `${shortages.map(s => s.bloodType).join(', ')} low` : 'All types balanced'}
          </span>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="card-header" style={{ padding: '16px 20px', margin: 0 }}>
          <h2 className="card-title">14-Day Blood Type Projection Matrix</h2>
          <span className="forecast-badge">Sample Data Model</span>
        </div>

        <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Blood Type</th>
                <th>Daily Consumption</th>
                <th>14-Day Projected Need</th>
                <th>Current Stock</th>
                <th>Surplus / Deficit</th>
                <th>Risk Assessment</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const diff = row.surplusDeficit;
                const statusClass = row.riskLevel === 'critical'
                  ? 'forecast-critical'
                  : row.riskLevel === 'watch'
                  ? 'forecast-watch'
                  : 'forecast-healthy';

                const statusLabel = row.riskLevel === 'critical'
                  ? 'Critical Shortage'
                  : row.riskLevel === 'watch'
                  ? 'Tight Supply'
                  : 'Healthy Buffer';

                return (
                  <tr key={row.bloodType}>
                    <td>
                      <span className="blood-type tiny" style={{ fontSize: '13px', padding: '3px 8px' }}>
                        {row.bloodType}
                      </span>
                    </td>
                    <td><strong>{row.avgDailyDemand}</strong> units / day</td>
                    <td>{row.projected14DayDemand} units</td>
                    <td><strong>{row.currentStock}</strong> units</td>
                    <td style={{ fontWeight: 700, color: diff < 0 ? '#b91c1c' : '#2d6a4f' }}>
                      {diff > 0 ? `+${diff}` : diff}
                    </td>
                    <td>
                      <span className={`forecast-status ${statusClass}`}>
                        {statusLabel}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {shortages.length > 0 && (
        <div className="forecast-note" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', marginTop: '1.25rem' }}>
          <AlertTriangle size={16} />
          <span>
            <strong>Projected Shortage Alert:</strong> Stock for <strong>{shortages.map((s) => s.bloodType).join(', ')}</strong> is projected to fall below demand within the next 14 days. Coordinate inter-bank transfers or schedule targeted collection.
          </span>
        </div>
      )}

      {watches.length > 0 && shortages.length === 0 && (
        <div className="forecast-note" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', marginTop: '1.25rem' }}>
          <Info size={16} />
          <span>
            <strong>Watch Notice:</strong> Blood types <strong>{watches.map((w) => w.bloodType).join(', ')}</strong> have slim inventory margins. Monitor upcoming allocations closely.
          </span>
        </div>
      )}
    </div>
  );
}

export default DemandForecastPage;
