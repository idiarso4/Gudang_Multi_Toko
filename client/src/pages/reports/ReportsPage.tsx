import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { 
  ChartBarIcon,
  DocumentChartBarIcon,
  CurrencyDollarIcon,
  ShoppingBagIcon,
  BuildingStorefrontIcon,
  ArchiveBoxIcon,
  CalendarIcon,
  ArrowDownTrayIcon
} from '@heroicons/react/24/outline'

import { reportsApi } from '@/services/api'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ReportCard from '@/components/reports/ReportCard'
import SalesChart from '@/components/reports/SalesChart'
import RevenueChart from '@/components/reports/RevenueChart'
import MarketplaceChart from '@/components/reports/MarketplaceChart'
import ProductPerformanceTable from '@/components/reports/ProductPerformanceTable'
import DateRangePicker from '@/components/ui/DateRangePicker'
import { cn } from '@/utils/cn'

const ReportsPage: React.FC = () => {
  const [timeRange, setTimeRange] = useState('month')
  const [selectedReport, setSelectedReport] = useState('overview')
  const [dateRange, setDateRange] = useState({
    startDate: null,
    endDate: null
  })

  // Fetch dashboard analytics
  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: ['dashboard-analytics', timeRange],
    queryFn: () => reportsApi.getDashboard(timeRange)
  })

  // Fetch sales report
  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ['sales-report', dateRange, timeRange],
    queryFn: () => reportsApi.getSalesReport({
      timeRange,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      groupBy: 'day'
    }),
    enabled: selectedReport === 'sales'
  })

  // Fetch product performance
  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['product-performance', timeRange],
    queryFn: () => reportsApi.getProductPerformance({
      timeRange,
      limit: 20,
      sortBy: 'revenue'
    }),
    enabled: selectedReport === 'products'
  })

  // Fetch marketplace performance
  const { data: marketplacesData, isLoading: marketplacesLoading } = useQuery({
    queryKey: ['marketplace-performance', timeRange],
    queryFn: () => reportsApi.getMarketplacePerformance({ timeRange }),
    enabled: selectedReport === 'marketplaces'
  })

  // Fetch inventory report
  const { data: inventoryData, isLoading: inventoryLoading } = useQuery({
    queryKey: ['inventory-report'],
    queryFn: () => reportsApi.getInventoryReport({
      includeMovements: false,
      lowStockOnly: false
    }),
    enabled: selectedReport === 'inventory'
  })

  // Fetch financial report
  const { data: financialData, isLoading: financialLoading } = useQuery({
    queryKey: ['financial-report', timeRange],
    queryFn: () => reportsApi.getFinancialReport({ timeRange }),
    enabled: selectedReport === 'financial'
  })

  const analytics = analyticsData?.data?.analytics
  const salesReport = salesData?.data?.report
  const productPerformance = productsData?.data?.products
  const marketplacePerformance = marketplacesData?.data?.marketplaces
  const inventoryReport = inventoryData?.data
  const financialReport = financialData?.data?.financial

  const timeRangeOptions = [
    { value: 'today', label: 'Hari Ini' },
    { value: 'week', label: '7 Hari' },
    { value: 'month', label: '30 Hari' },
    { value: 'quarter', label: '3 Bulan' },
    { value: 'year', label: '1 Tahun' }
  ]

  const reportTabs = [
    { id: 'overview', label: 'Overview', icon: ChartBarIcon },
    { id: 'sales', label: 'Penjualan', icon: CurrencyDollarIcon },
    { id: 'products', label: 'Produk', icon: ShoppingBagIcon },
    { id: 'marketplaces', label: 'Marketplace', icon: BuildingStorefrontIcon },
    { id: 'inventory', label: 'Inventori', icon: ArchiveBoxIcon },
    { id: 'financial', label: 'Keuangan', icon: DocumentChartBarIcon }
  ]

  const handleExportReport = (format: 'csv' | 'pdf') => {
    // Implementation for export functionality
    console.log(`Exporting ${selectedReport} report as ${format}`)
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Laporan & Analytics</h1>
          <p className="mt-1 text-sm text-gray-600">
            Analisis performa bisnis dan laporan komprehensif
          </p>
        </div>
        
        <div className="mt-4 sm:mt-0 flex items-center space-x-3">
          {/* Time range selector */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="input text-sm"
          >
            {timeRangeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {/* Date range picker */}
          <DateRangePicker
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
            onChange={setDateRange}
          />

          {/* Export buttons */}
          <div className="flex space-x-2">
            <button
              onClick={() => handleExportReport('csv')}
              className="btn btn-outline btn-sm"
            >
              <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
              CSV
            </button>
            <button
              onClick={() => handleExportReport('pdf')}
              className="btn btn-outline btn-sm"
            >
              <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
              PDF
            </button>
          </div>
        </div>
      </div>

      {/* Report tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {reportTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedReport(tab.id)}
              className={cn(
                'flex items-center py-2 px-1 border-b-2 font-medium text-sm',
                selectedReport === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              )}
            >
              <tab.icon className="h-5 w-5 mr-2" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Report content */}
      <div className="space-y-6">
        {selectedReport === 'overview' && (
          <>
            {analyticsLoading ? (
              <div className="flex items-center justify-center h-64">
                <LoadingSpinner size="lg" text="Memuat analytics..." />
              </div>
            ) : analytics ? (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  <ReportCard
                    title="Total Revenue"
                    value={`Rp ${analytics.summary.totalRevenue.current?.toLocaleString('id-ID') || 0}`}
                    change={analytics.summary.totalRevenue.growth}
                    icon={CurrencyDollarIcon}
                    color="green"
                  />
                  <ReportCard
                    title="Total Pesanan"
                    value={analytics.summary.totalOrders.current || 0}
                    change={analytics.summary.totalOrders.growth}
                    icon={ShoppingBagIcon}
                    color="blue"
                  />
                  <ReportCard
                    title="Total Produk"
                    value={analytics.summary.totalProducts || 0}
                    icon={ArchiveBoxIcon}
                    color="purple"
                  />
                  <ReportCard
                    title="Stok Rendah"
                    value={analytics.summary.lowStockCount || 0}
                    icon={ExclamationTriangleIcon}
                    color="red"
                  />
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white rounded-lg shadow-soft p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">
                      Revenue Harian
                    </h3>
                    <RevenueChart data={analytics.charts.revenueByDay} />
                  </div>
                  
                  <div className="bg-white rounded-lg shadow-soft p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">
                      Performance Marketplace
                    </h3>
                    <MarketplaceChart data={analytics.charts.revenueByMarketplace} />
                  </div>
                </div>

                {/* Top products and recent orders */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white rounded-lg shadow-soft p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">
                      Produk Terlaris
                    </h3>
                    <div className="space-y-3">
                      {analytics.topProducts?.slice(0, 5).map((product, index) => (
                        <div key={product.productId} className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <span className="text-sm font-medium text-gray-500">
                              #{index + 1}
                            </span>
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {product.product?.name}
                              </p>
                              <p className="text-xs text-gray-500">
                                {product._sum.quantity} terjual
                              </p>
                            </div>
                          </div>
                          <span className="text-sm font-medium text-gray-900">
                            Rp {product._sum.totalPrice?.toLocaleString('id-ID')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white rounded-lg shadow-soft p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">
                      Pesanan Terbaru
                    </h3>
                    <div className="space-y-3">
                      {analytics.recentOrders?.slice(0, 5).map((order) => (
                        <div key={order.id} className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {order.orderNumber}
                            </p>
                            <p className="text-xs text-gray-500">
                              {order.marketplaceAccount?.marketplace?.name}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-gray-900">
                              Rp {order.totalAmount?.toLocaleString('id-ID')}
                            </p>
                            <p className="text-xs text-gray-500">
                              {new Date(order.orderDate).toLocaleDateString('id-ID')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-500">Tidak ada data analytics</p>
              </div>
            )}
          </>
        )}

        {selectedReport === 'sales' && (
          <div className="space-y-6">
            {salesLoading ? (
              <div className="flex items-center justify-center h-64">
                <LoadingSpinner size="lg" text="Memuat laporan penjualan..." />
              </div>
            ) : salesReport ? (
              <>
                {/* Sales summary */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <ReportCard
                    title="Total Revenue"
                    value={`Rp ${salesReport.summary.totalRevenue?.toLocaleString('id-ID') || 0}`}
                    icon={CurrencyDollarIcon}
                    color="green"
                  />
                  <ReportCard
                    title="Total Pesanan"
                    value={salesReport.summary.totalOrders || 0}
                    icon={ShoppingBagIcon}
                    color="blue"
                  />
                  <ReportCard
                    title="Rata-rata Nilai Pesanan"
                    value={`Rp ${salesReport.summary.averageOrderValue?.toLocaleString('id-ID') || 0}`}
                    icon={ChartBarIcon}
                    color="purple"
                  />
                </div>

                {/* Sales chart */}
                <div className="bg-white rounded-lg shadow-soft p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    Trend Penjualan
                  </h3>
                  <SalesChart data={salesReport.salesData} />
                </div>

                {/* Status breakdown and marketplace comparison */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white rounded-lg shadow-soft p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">
                      Breakdown Status Pesanan
                    </h3>
                    <div className="space-y-3">
                      {salesReport.statusBreakdown?.map((status) => (
                        <div key={status.status} className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">{status.status}</span>
                          <div className="text-right">
                            <span className="text-sm font-medium text-gray-900">
                              {status.count} pesanan
                            </span>
                            <p className="text-xs text-gray-500">
                              Rp {status.revenue?.toLocaleString('id-ID')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white rounded-lg shadow-soft p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">
                      Perbandingan Marketplace
                    </h3>
                    <div className="space-y-3">
                      {salesReport.marketplaceComparison?.map((marketplace) => (
                        <div key={marketplace.marketplaceId} className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">
                            {marketplace.marketplaceName}
                          </span>
                          <div className="text-right">
                            <span className="text-sm font-medium text-gray-900">
                              {marketplace.orders} pesanan
                            </span>
                            <p className="text-xs text-gray-500">
                              Rp {marketplace.revenue?.toLocaleString('id-ID')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-500">Tidak ada data penjualan</p>
              </div>
            )}
          </div>
        )}

        {selectedReport === 'products' && (
          <div className="space-y-6">
            {productsLoading ? (
              <div className="flex items-center justify-center h-64">
                <LoadingSpinner size="lg" text="Memuat performa produk..." />
              </div>
            ) : productPerformance ? (
              <ProductPerformanceTable products={productPerformance} />
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-500">Tidak ada data produk</p>
              </div>
            )}
          </div>
        )}

        {/* Add other report sections similarly */}
      </div>
    </div>
  )
}

export default ReportsPage
