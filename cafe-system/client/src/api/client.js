import axios from 'axios';

const rawApiUrl = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
const baseURL = rawApiUrl ? `${rawApiUrl}/api` : '/api';

export const apiClient = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('cafe_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Don't redirect on login attempt failure
      if (!error.config.url.includes('/auth/login')) {
        localStorage.removeItem('cafe_token');
        localStorage.removeItem('cafe_user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Auth Endpoints
export const authApi = {
  login: (credentials) => apiClient.post('/auth/login', credentials),
  getMe: () => apiClient.get('/auth/me'),
};

// Tables Endpoints
export const tablesApi = {
  getAll: (all = false) => apiClient.get(`/tables${all ? '?all=true' : ''}`),
  create: (data) => apiClient.post('/tables', data),
  update: (id, data) => apiClient.patch(`/tables/${id}`, data),
  delete: (id, permanent = false) => apiClient.delete(`/tables/${id}${permanent ? '?permanent=true' : ''}`),
};

// Ingredients Endpoints
export const ingredientsApi = {
  getAll: (all = false) => apiClient.get(`/ingredients${all ? '?all=true' : ''}`),
  create: (data) => apiClient.post('/ingredients', data),
  update: (id, data) => apiClient.patch(`/ingredients/${id}`, data),
  delete: (id, permanent = false) => apiClient.delete(`/ingredients/${id}${permanent ? '?permanent=true' : ''}`),
};

// Menu Endpoints
export const menuApi = {
  getAll: (params) => apiClient.get('/menu', { params }),
  create: (data) => apiClient.post('/menu', data),
  update: (id, data) => apiClient.patch(`/menu/${id}`, data),
  delete: (id, permanent = false) => apiClient.delete(`/menu/${id}${permanent ? '?permanent=true' : ''}`),
};

// Users Endpoints
export const usersApi = {
  getAll: () => apiClient.get('/users'),
  create: (data) => apiClient.post('/users', data),
  update: (id, data) => apiClient.patch(`/users/${id}`, data),
  delete: (id, permanent = false) => apiClient.delete(`/users/${id}${permanent ? '?permanent=true' : ''}`),
};

// Orders Endpoints
export const ordersApi = {
  create: (data) => apiClient.post('/orders', data),
  addItems: (orderId, data) => apiClient.post(`/orders/${orderId}/items`, data),
  updateItemStatus: (orderId, itemId, status) =>
    apiClient.patch(`/orders/${orderId}/items/${itemId}/status`, { status }),
  cancelItem: (orderId, itemId, reason) =>
    apiClient.patch(`/orders/${orderId}/items/${itemId}/cancel`, { reason }),
  close: (orderId, data = {}) => apiClient.patch(`/orders/${orderId}/close`, data),
  cancel: (orderId, data = {}) => apiClient.patch(`/orders/${orderId}/cancel`, data),
  getActive: () => apiClient.get('/orders/active'),
  getMine: (status) => apiClient.get(`/orders/mine${status ? `?status=${status}` : ''}`),
  getById: (id) => apiClient.get(`/orders/${id}`),
  getHistory: (params) => apiClient.get('/orders', { params }),
};

// Inventory Endpoints (Phase 5)
export const inventoryApi = {
  recordDelivery: (data) => apiClient.post('/inventory/deliveries', data),
  recordWaste: (data) => apiClient.post('/inventory/waste', data),
  recordCount: (data) => apiClient.post('/inventory/counts', data),
  recordCorrection: (data) => apiClient.post('/inventory/corrections', data),
  getMovements: (params) => apiClient.get('/inventory/movements', { params }),
};

// Operating Expenses Endpoints (Section 14.G)
export const expensesApi = {
  create: (data) => apiClient.post('/expenses', data),
  getAll: (params) => apiClient.get('/expenses', { params }),
  getSummary: (params) => apiClient.get('/expenses/summary', { params }),
  delete: (id) => apiClient.delete(`/expenses/${id}`),
};

// Reports Endpoints (Section 14 & Phase 6)
export const reportsApi = {
  getDashboard: (params) => apiClient.get('/reports/dashboard', { params }),
  getOrders: (params) => apiClient.get('/reports/orders', { params }),
  getRevenue: (params) => apiClient.get('/reports/revenue', { params }),
  getIngredientCosts: (params) => apiClient.get('/reports/ingredient-costs', { params }),
  getWastageCosts: (params) => apiClient.get('/reports/wastage-costs', { params }),
  getProfitLoss: (params) => apiClient.get('/reports/profit-loss', { params }),
  getSales: (params) => apiClient.get('/reports/sales', { params }),
  getTopSelling: (params) => apiClient.get('/reports/top-selling', { params }),
  getIngredientUsage: (params) => apiClient.get('/reports/ingredient-usage', { params }),
  getLowStock: () => apiClient.get('/reports/low-stock'),
  getPreparationWastage: (params) => apiClient.get('/reports/preparation-wastage', { params }),
};

// Email Notification System Endpoints (Section 15)
export const notificationsApi = {
  getSettings: () => apiClient.get('/notifications/settings'),
  updateSettings: (data) => apiClient.put('/notifications/settings', data),
  sendTestEmail: (data) => apiClient.post('/notifications/test-email', data),
  getHistory: (params) => apiClient.get('/notifications/history', { params }),
  getEmailStatus: () => apiClient.get('/notifications/email-status'),
  triggerReport: (data) => apiClient.post('/notifications/trigger-report', data),
};



