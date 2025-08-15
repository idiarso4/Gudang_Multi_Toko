import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

// Layout components
import AuthLayout from '@/components/layouts/AuthLayout'
import DashboardLayout from '@/components/layouts/DashboardLayout'

// Auth pages
import LoginPage from '@/pages/auth/LoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'

// Dashboard pages
import DashboardPage from '@/pages/dashboard/DashboardPage'
import ProductsPage from '@/pages/products/ProductsPage'
import ProductDetailPage from '@/pages/products/ProductDetailPage'
import CreateProductPage from '@/pages/products/CreateProductPage'
import OrdersPage from '@/pages/orders/OrdersPage'
import OrderDetailPage from '@/pages/orders/OrderDetailPage'
import InventoryPage from '@/pages/inventory/InventoryPage'
import MarketplacesPage from '@/pages/marketplaces/MarketplacesPage'
import AnalyticsPage from '@/pages/analytics/AnalyticsPage'
import SettingsPage from '@/pages/settings/SettingsPage'

// Loading component
import LoadingSpinner from '@/components/ui/LoadingSpinner'

function App() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={
        isAuthenticated ? <Navigate to="/dashboard" replace /> : 
        <AuthLayout><LoginPage /></AuthLayout>
      } />
      
      <Route path="/register" element={
        isAuthenticated ? <Navigate to="/dashboard" replace /> : 
        <AuthLayout><RegisterPage /></AuthLayout>
      } />

      {/* Protected routes */}
      <Route path="/dashboard" element={
        isAuthenticated ? 
        <DashboardLayout><DashboardPage /></DashboardLayout> : 
        <Navigate to="/login" replace />
      } />

      <Route path="/products" element={
        isAuthenticated ? 
        <DashboardLayout><ProductsPage /></DashboardLayout> : 
        <Navigate to="/login" replace />
      } />

      <Route path="/products/create" element={
        isAuthenticated ? 
        <DashboardLayout><CreateProductPage /></DashboardLayout> : 
        <Navigate to="/login" replace />
      } />

      <Route path="/products/:id" element={
        isAuthenticated ? 
        <DashboardLayout><ProductDetailPage /></DashboardLayout> : 
        <Navigate to="/login" replace />
      } />

      <Route path="/orders" element={
        isAuthenticated ? 
        <DashboardLayout><OrdersPage /></DashboardLayout> : 
        <Navigate to="/login" replace />
      } />

      <Route path="/orders/:id" element={
        isAuthenticated ? 
        <DashboardLayout><OrderDetailPage /></DashboardLayout> : 
        <Navigate to="/login" replace />
      } />

      <Route path="/inventory" element={
        isAuthenticated ? 
        <DashboardLayout><InventoryPage /></DashboardLayout> : 
        <Navigate to="/login" replace />
      } />

      <Route path="/marketplaces" element={
        isAuthenticated ? 
        <DashboardLayout><MarketplacesPage /></DashboardLayout> : 
        <Navigate to="/login" replace />
      } />

      <Route path="/analytics" element={
        isAuthenticated ? 
        <DashboardLayout><AnalyticsPage /></DashboardLayout> : 
        <Navigate to="/login" replace />
      } />

      <Route path="/settings" element={
        isAuthenticated ? 
        <DashboardLayout><SettingsPage /></DashboardLayout> : 
        <Navigate to="/login" replace />
      } />

      {/* Default redirects */}
      <Route path="/" element={
        <Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />
      } />

      {/* 404 page */}
      <Route path="*" element={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">404</h1>
            <p className="text-gray-600 mb-8">Halaman yang Anda cari tidak ditemukan.</p>
            <a 
              href={isAuthenticated ? "/dashboard" : "/login"}
              className="btn btn-primary"
            >
              {isAuthenticated ? "Kembali ke Dashboard" : "Kembali ke Login"}
            </a>
          </div>
        </div>
      } />
    </Routes>
  )
}

export default App
