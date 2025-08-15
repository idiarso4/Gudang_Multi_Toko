import React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ShoppingBagIcon,
  ClipboardDocumentListIcon,
  CubeIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'

import { analyticsApi } from '@/services/api'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import StatsCard from '@/components/dashboard/StatsCard'
import RecentOrders from '@/components/dashboard/RecentOrders'
import LowStockAlert from '@/components/dashboard/LowStockAlert'
import SalesChart from '@/components/dashboard/SalesChart'
import MarketplacePerformance from '@/components/dashboard/MarketplacePerformance'

const DashboardPage: React.FC = () => {
  const { data: analytics, isLoading, error } = useQuery({
    queryKey: ['dashboard-analytics'],
    queryFn: () => analyticsApi.getDashboard({ period: 'month' }),
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" text="Memuat data dashboard..." />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">Error memuat data</h3>
        <p className="mt-1 text-sm text-gray-500">
          Terjadi kesalahan saat memuat data dashboard.
        </p>
      </div>
    )
  }

  const dashboardData = analytics?.data?.analytics

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">
          Ringkasan aktivitas toko Anda bulan ini
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Pesanan"
          value={dashboardData?.summary?.totalOrders?.current || 0}
          previousValue={dashboardData?.summary?.totalOrders?.previous || 0}
          growth={dashboardData?.summary?.totalOrders?.growth || 0}
          icon={ClipboardDocumentListIcon}
          color="blue"
        />
        
        <StatsCard
          title="Total Pendapatan"
          value={dashboardData?.summary?.totalRevenue?.current || 0}
          previousValue={dashboardData?.summary?.totalRevenue?.previous || 0}
          growth={dashboardData?.summary?.totalRevenue?.growth || 0}
          icon={ShoppingBagIcon}
          color="green"
          format="currency"
        />
        
        <StatsCard
          title="Total Produk"
          value={dashboardData?.summary?.totalProducts || 0}
          icon={CubeIcon}
          color="purple"
        />
        
        <StatsCard
          title="Stok Rendah"
          value={dashboardData?.summary?.lowStockCount || 0}
          icon={ExclamationTriangleIcon}
          color="red"
          alert={dashboardData?.summary?.lowStockCount > 0}
        />
      </div>

      {/* Charts and data */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales chart */}
        <div className="bg-white rounded-lg shadow-soft p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Penjualan 30 Hari Terakhir
          </h3>
          <SalesChart />
        </div>

        {/* Marketplace performance */}
        <div className="bg-white rounded-lg shadow-soft p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Performa Marketplace
          </h3>
          <MarketplacePerformance data={dashboardData?.revenueByMarketplace || []} />
        </div>
      </div>

      {/* Recent orders and alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent orders */}
        <div className="lg:col-span-2">
          <RecentOrders />
        </div>

        {/* Low stock alert */}
        <div>
          <LowStockAlert />
        </div>
      </div>

      {/* Top products */}
      {dashboardData?.topProducts && dashboardData.topProducts.length > 0 && (
        <div className="bg-white rounded-lg shadow-soft p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Produk Terlaris
          </h3>
          <div className="space-y-4">
            {dashboardData.topProducts.slice(0, 5).map((item, index) => (
              <div key={item.productId} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-primary-100 text-primary-800 text-sm font-medium">
                      {index + 1}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {item.product?.name}
                    </p>
                    <p className="text-sm text-gray-500">
                      SKU: {item.product?.sku}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">
                    {item._sum?.quantity || 0} terjual
                  </p>
                  <p className="text-sm text-gray-500">
                    Rp {(item._sum?.totalPrice || 0).toLocaleString('id-ID')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default DashboardPage
