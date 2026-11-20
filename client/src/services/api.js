/**
 * HemoSync Shared API Client
 * Built on native Fetch API with cookie credentials and centralized error handling
 */

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
const API_BASE_URL = configuredBaseUrl.replace(/\/+$/, '');

let authToken = localStorage.getItem('hemosync_token') || null;
let refreshInFlight = null;

export function setAuthToken(token) {
  authToken = token;
  if (token) {
    localStorage.setItem('hemosync_token', token);
  } else {
    localStorage.removeItem('hemosync_token');
  }
}

export function getAuthToken() {
  return authToken;
}

function withQuery(endpoint, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, value);
    }
  });

  const queryString = query.toString();
  return queryString ? `${endpoint}?${queryString}` : endpoint;
}

async function refreshSession() {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' }
        });
        const payload = await response.json().catch(() => null);
        const token = payload?.data?.token;
        if (!response.ok || !token) {
          setAuthToken(null);
          window.dispatchEvent(new Event('hemosync:session-expired'));
          return false;
        }
        setAuthToken(token);
        return true;
      } catch {
        setAuthToken(null);
        window.dispatchEvent(new Event('hemosync:session-expired'));
        return false;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function request(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

  const headers = {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...(options.headers || {})
  };

  const config = {
    ...options,
    headers,
    credentials: 'include' // Strictly required for HttpOnly cookie sessions
  };

  if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
  }

  try {
    let response = await fetch(url, config);
    const isAuthEntryPoint = /^\/auth\/(login|register|refresh)(?:\?|$)/.test(endpoint);
    if (response.status === 401 && !isAuthEntryPoint && await refreshSession()) {
      response = await fetch(url, {
        ...config,
        headers: {
          ...headers,
          Authorization: `Bearer ${authToken}`
        }
      });
    }
    let data = null;

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      const errorMessage = data?.message || `Request failed with status ${response.status}`;
      throw new ApiError(errorMessage, response.status, data);
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      error.message || 'Network error or backend service unreachable',
      0,
      null
    );
  }
}

export const apiClient = {
  setToken: setAuthToken,
  getToken: getAuthToken,
  get: (endpoint, options) => request(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options) => request(endpoint, { ...options, method: 'POST', body }),
  put: (endpoint, body, options) => request(endpoint, { ...options, method: 'PUT', body }),
  patch: (endpoint, body, options) => request(endpoint, { ...options, method: 'PATCH', body }),
  delete: (endpoint, options) => request(endpoint, { ...options, method: 'DELETE' }),

  // Health
  getHealth: () => request('/health'),

  // Authentication & Admin
  register: (userData) => request('/auth/register', { method: 'POST', body: userData }),
  login: (credentials) => request('/auth/login', { method: 'POST', body: credentials }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  getMe: () => request('/auth/me', { method: 'GET' }),
  getAdminUsers: () => request('/admin/users', { method: 'GET' }),
  createAdminUser: (userData) => request('/admin/users', { method: 'POST', body: userData }),

  // Module 4: Institutions
  getInstitutions: (params = {}) => request(withQuery('/institutions', params), { method: 'GET' }),
  getInstitutionById: (id) => request(`/institutions/${id}`, { method: 'GET' }),
  createInstitution: (data) => request('/institutions', { method: 'POST', body: data }),
  updateInstitution: (id, data) => request(`/institutions/${id}`, { method: 'PATCH', body: data }),
  updateInstitutionStatus: (id, statusData) => request(`/institutions/${id}/status`, { method: 'PATCH', body: statusData }),

  // Module 5: Blood Inventory
  getInventory: (params = {}) => request(withQuery('/inventory', params), { method: 'GET' }),
  getInventorySummary: (institutionId) => request(withQuery('/inventory/summary', { institutionId }), { method: 'GET' }),
  getUnitById: (id) => request(`/inventory/${id}`, { method: 'GET' }),
  registerUnit: (data) => request('/inventory', { method: 'POST', body: data }),
  updateUnitStatus: (id, statusData) => request(`/inventory/${id}/status`, { method: 'PATCH', body: statusData }),
  updateUnitDetails: (id, data) => request(`/inventory/${id}`, { method: 'PATCH', body: data }),

  // Module 6: Hospital Blood Requests
  getRequests: (params = {}) => request(withQuery('/requests', params), { method: 'GET' }),
  getRequestSummary: (hospitalId) => request(withQuery('/requests/summary', { hospitalId }), { method: 'GET' }),
  getRequestById: (id) => request(`/requests/${id}`, { method: 'GET' }),
  createRequest: (data) => request('/requests', { method: 'POST', body: data }),
  cancelRequest: (id, cancelData) => request(`/requests/${id}/cancel`, { method: 'PATCH', body: cancelData }),
  updateRequestStatus: (id, statusData) => request(`/requests/${id}/status`, { method: 'PATCH', body: statusData }),

  // Module 7: Deterministic Inventory Matching & Allocation Engine
  getRequestMatches: (id, params = {}) => request(withQuery(`/requests/${id}/matches`, params), { method: 'GET' }),
  allocateUnits: (id, allocationData) => request(`/requests/${id}/allocations`, { method: 'POST', body: allocationData }),

  // Module 8: Nearby Search & Transfer Coordination
  getNearbyMatches: (requestId, params = {}) => request(withQuery(`/requests/${requestId}/nearby-matches`, params), { method: 'GET' }),
  getTransfers: (params = {}) => request(withQuery('/transfers', params), { method: 'GET' }),
  getTransferById: (id) => request(`/transfers/${id}`, { method: 'GET' }),
  createTransfer: (data) => request('/transfers', { method: 'POST', body: data }),
  approveTransfer: (id, data = {}) => request(`/transfers/${id}/approve`, { method: 'PATCH', body: data }),
  rejectTransfer: (id, data = {}) => request(`/transfers/${id}/reject`, { method: 'PATCH', body: data }),
  dispatchTransfer: (id, data = {}) => request(`/transfers/${id}/dispatch`, { method: 'PATCH', body: data }),
  receiveTransfer: (id, data = {}) => request(`/transfers/${id}/receive`, { method: 'PATCH', body: data }),

  // Module 9: Expiry Monitoring & Redistribution
  getExpiryAlerts: (params = {}) => request(withQuery('/expiry/alerts', params), { method: 'GET' }),
  resolveExpiryAlert: (id, data = {}) => request(`/expiry/alerts/${id}/resolve`, { method: 'PATCH', body: data }),
  getExpirySummary: (institutionId) => request(withQuery('/expiry/summary', { institutionId }), { method: 'GET' }),
  getRedistributionSuggestions: (params = {}) => request(withQuery('/expiry/redistribution-suggestions', params), { method: 'GET' }),
  runExpiryJob: (data = {}) => request('/expiry/run-job', { method: 'POST', body: data }),

  // Demand Forecasting
  getSimpleForecast: (institutionId) => request(withQuery('/forecasts/summary', { institutionId }), { method: 'GET' }),
  getHistoricalDemand: (params = {}) => request(withQuery('/forecasts/history', params), { method: 'GET' }),
  generateForecasts: (data = {}) => request('/forecasts/generate', { method: 'POST', body: data }),
  getForecasts: (params = {}) => request(withQuery('/forecasts', params), { method: 'GET' }),
  getShortages: (params = {}) => request(withQuery('/intelligence/shortages', params), { method: 'GET' }),
  getSurplusAnalytics: (params = {}) => request(withQuery('/intelligence/surplus', params), { method: 'GET' }),
  getRankedRedistribution: (params = {}) => request(withQuery('/intelligence/redistribution-suggestions', params), { method: 'GET' }),
  getAnomalies: (params = {}) => request(withQuery('/intelligence/anomalies', params), { method: 'GET' }),
  detectAnomalies: (data = {}) => request('/intelligence/anomalies/detect', { method: 'POST', body: data }),
  reviewAnomaly: (id, data = {}) => request(`/intelligence/anomalies/${id}/review`, { method: 'PATCH', body: data }),
  getModelEvaluations: (params = {}) => request(withQuery('/intelligence/model-evaluations', params), { method: 'GET' }),

  // Module 12: Notifications & Audit Trails
  getNotifications: (params = {}) => request(withQuery('/notifications', params), { method: 'GET' }),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () => request('/notifications/read-all', { method: 'PATCH' }),
  getAuditLogs: (params = {}) => request(withQuery('/audit-logs', params), { method: 'GET' })
};

export { ApiError };
export default apiClient;
