import axios, { AxiosInstance, AxiosResponse } from 'axios'
import toast from 'react-hot-toast'

import { LoginCredentials, RegisterData, AuthResponse, RefreshTokenResponse } from '@/types/auth'

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // Handle 401 errors (unauthorized)
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        // Try to refresh token
        const refreshResponse = await api.post('/auth/refresh')
        const { token } = refreshResponse.data
        
        localStorage.setItem('auth_token', token)
        originalRequest.headers.Authorization = `Bearer ${token}`
        
        return api(originalRequest)
      } catch (refreshError) {
        // Refresh failed, redirect to login
        localStorage.removeItem('auth_token')
        localStorage.removeItem('auth_user')
        window.location.href = '/login'
        return Promise.reject(refreshError)
      }
    }

    // Handle other errors
    if (error.response?.status >= 500) {
      toast.error('Terjadi kesalahan server. Silakan coba lagi.')
    } else if (error.response?.status === 403) {
      toast.error('Anda tidak memiliki akses untuk melakukan tindakan ini.')
    } else if (error.response?.status === 404) {
      toast.error('Data yang diminta tidak ditemukan.')
    } else if (error.code === 'ECONNABORTED') {
      toast.error('Koneksi timeout. Silakan coba lagi.')
    } else if (!error.response) {
      toast.error('Tidak dapat terhubung ke server. Periksa koneksi internet Anda.')
    }

    return Promise.reject(error)
  }
)

// Auth API
export const authApi = {
  login: (credentials: LoginCredentials): Promise<AxiosResponse<AuthResponse>> =>
    api.post('/auth/login', credentials),
  
  register: (data: RegisterData): Promise<AxiosResponse<{ message: string }>> =>
    api.post('/auth/register', data),
  
  logout: (): Promise<AxiosResponse<{ message: string }>> =>
    api.post('/auth/logout'),
  
  getProfile: (): Promise<AxiosResponse<{ user: any }>> =>
    api.get('/auth/me'),
  
  refreshToken: (): Promise<AxiosResponse<RefreshTokenResponse>> =>
    api.post('/auth/refresh'),
}

// Products API
export const productsApi = {
  getAll: (params?: any): Promise<AxiosResponse<any>> =>
    api.get('/products', { params }),
  
  getById: (id: string): Promise<AxiosResponse<any>> =>
    api.get(`/products/${id}`),
  
  create: (data: any): Promise<AxiosResponse<any>> =>
    api.post('/products', data),
  
  update: (id: string, data: any): Promise<AxiosResponse<any>> =>
    api.put(`/products/${id}`, data),
  
  delete: (id: string): Promise<AxiosResponse<any>> =>
    api.delete(`/products/${id}`),
  
  bulkSync: (data: any): Promise<AxiosResponse<any>> =>
    api.post('/products/bulk-sync', data),
}

// Orders API
export const ordersApi = {
  getAll: (params?: any): Promise<AxiosResponse<any>> =>
    api.get('/orders', { params }),

  getById: (id: string): Promise<AxiosResponse<any>> =>
    api.get(`/orders/${id}`),

  updateStatus: (id: string, status: string, reason?: string, updateMarketplace?: boolean): Promise<AxiosResponse<any>> =>
    api.patch(`/orders/${id}/status`, { status, reason, updateMarketplace }),

  assignOrder: (id: string, userId: string, reason?: string): Promise<AxiosResponse<any>> =>
    api.patch(`/orders/${id}/assign`, { assignedUserId: userId, reason }),

  addTag: (id: string, tag: string): Promise<AxiosResponse<any>> =>
    api.post(`/orders/${id}/tags`, { tag }),

  removeTag: (id: string, tagId: string): Promise<AxiosResponse<any>> =>
    api.delete(`/orders/${id}/tags/${tagId}`),

  sync: (marketplaceAccountId: string, options?: any): Promise<AxiosResponse<any>> =>
    api.post(`/order-management/sync`, { marketplaceAccountId, ...options }),

  getStats: (timeRange?: string): Promise<AxiosResponse<any>> =>
    api.get('/order-management/stats', { params: { timeRange } }),
}

// Inventory API
export const inventoryApi = {
  getAll: (params?: any): Promise<AxiosResponse<any>> =>
    api.get('/inventory', { params }),
  
  updateStock: (productId: string, data: any): Promise<AxiosResponse<any>> =>
    api.patch(`/inventory/${productId}`, data),
  
  getLowStock: (): Promise<AxiosResponse<any>> =>
    api.get('/inventory/low-stock'),
  
  getMovements: (productId: string): Promise<AxiosResponse<any>> =>
    api.get(`/inventory/${productId}/movements`),
}

// Marketplaces API
export const marketplacesApi = {
  getAll: (): Promise<AxiosResponse<any>> =>
    api.get('/marketplaces'),
  
  getUserAccounts: (): Promise<AxiosResponse<any>> =>
    api.get('/marketplaces/accounts'),
  
  connectAccount: (data: any): Promise<AxiosResponse<any>> =>
    api.post('/marketplaces/connect', data),
  
  disconnectAccount: (id: string): Promise<AxiosResponse<any>> =>
    api.delete(`/marketplaces/accounts/${id}`),
  
  testConnection: (id: string): Promise<AxiosResponse<any>> =>
    api.post(`/marketplaces/accounts/${id}/test`),
}

// Analytics API
export const analyticsApi = {
  getDashboard: (params?: any): Promise<AxiosResponse<any>> =>
    api.get('/analytics/dashboard', { params }),
  
  getSalesReport: (params?: any): Promise<AxiosResponse<any>> =>
    api.get('/analytics/sales', { params }),
  
  getInventoryReport: (params?: any): Promise<AxiosResponse<any>> =>
    api.get('/analytics/inventory', { params }),
  
  getMarketplacePerformance: (params?: any): Promise<AxiosResponse<any>> =>
    api.get('/analytics/marketplace-performance', { params }),
}

// Stock Sync API
export const stockSyncApi = {
  getRules: (params?: any): Promise<AxiosResponse<any>> =>
    api.get('/stock-sync/rules', { params }),

  createRule: (rule: any): Promise<AxiosResponse<any>> =>
    api.post('/stock-sync/rules', rule),

  updateRule: (id: string, rule: any): Promise<AxiosResponse<any>> =>
    api.put(`/stock-sync/rules/${id}`, rule),

  deleteRule: (id: string): Promise<AxiosResponse<any>> =>
    api.delete(`/stock-sync/rules/${id}`),

  triggerSync: (productIds: string[], reason?: string): Promise<AxiosResponse<any>> =>
    api.post('/stock-sync/trigger', { productIds, reason }),

  getLogs: (params?: any): Promise<AxiosResponse<any>> =>
    api.get('/stock-sync/logs', { params }),

  getStats: (timeRange: string = '24h'): Promise<AxiosResponse<any>> =>
    api.get('/stock-sync/stats', { params: { timeRange } })
}

// Sync API
export const syncApi = {
  syncProducts: (data: any): Promise<AxiosResponse<any>> =>
    api.post('/sync/products', data),

  syncOrders: (data: any): Promise<AxiosResponse<any>> =>
    api.post('/sync/orders', data),

  syncInventory: (data: any): Promise<AxiosResponse<any>> =>
    api.post('/sync/inventory', data),

  getStatus: (jobId: string): Promise<AxiosResponse<any>> =>
    api.get(`/sync/status/${jobId}`),

  getLogs: (params?: any): Promise<AxiosResponse<any>> =>
    api.get('/sync/logs', { params }),
}

export default api
