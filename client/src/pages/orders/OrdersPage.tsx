import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { 
  MagnifyingGlassIcon,
  FunnelIcon,
  EyeIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'

import { ordersApi } from '@/services/api'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Pagination from '@/components/ui/Pagination'
import OrderStatusBadge from '@/components/orders/OrderStatusBadge'
import OrderFilters from '@/components/orders/OrderFilters'
import { cn } from '@/utils/cn'

const OrdersPage: React.FC = () => {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({
    status: '',
    marketplaceAccountId: '',
    startDate: '',
    endDate: '',
    sortBy: 'orderDate',
    sortOrder: 'desc'
  })
  const [showFilters, setShowFilters] = useState(false)

  const { data: ordersData, isLoading, error, refetch } = useQuery({
    queryKey: ['orders', page, search, filters],
    queryFn: () => ordersApi.getAll({
      page,
      limit: 20,
      search,
      ...filters
    }),
    keepPreviousData: true
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
  }

  const handleFilterChange = (newFilters: any) => {
    setFilters(prev => ({ ...prev, ...newFilters }))
    setPage(1)
  }

  const orders = ordersData?.data?.orders || []
  const pagination = ordersData?.data?.pagination

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pesanan</h1>
          <p className="mt-1 text-sm text-gray-600">
            Kelola semua pesanan dari berbagai marketplace
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <button
            onClick={() => refetch()}
            className="btn btn-outline btn-md"
          >
            <ArrowPathIcon className="h-5 w-5 mr-2" />
            Refresh
          </button>
        </div>
      </div>

      {/* Search and filters */}
      <div className="bg-white rounded-lg shadow-soft p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0 lg:space-x-4">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 max-w-lg">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Cari nomor pesanan atau ID marketplace..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-10 w-full"
              />
            </div>
          </form>

          {/* Controls */}
          <div className="flex items-center space-x-3">
            {/* Sort */}
            <select
              value={`${filters.sortBy}-${filters.sortOrder}`}
              onChange={(e) => {
                const [sortBy, sortOrder] = e.target.value.split('-')
                handleFilterChange({ sortBy, sortOrder })
              }}
              className="input text-sm"
            >
              <option value="orderDate-desc">Terbaru</option>
              <option value="orderDate-asc">Terlama</option>
              <option value="totalAmount-desc">Nilai Tertinggi</option>
              <option value="totalAmount-asc">Nilai Terendah</option>
            </select>

            {/* Filters toggle */}
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                'btn btn-outline btn-md',
                showFilters && 'bg-gray-50'
              )}
            >
              <FunnelIcon className="h-5 w-5 mr-2" />
              Filter
            </button>
          </div>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <OrderFilters
              filters={filters}
              onFilterChange={handleFilterChange}
            />
          </div>
        )}
      </div>

      {/* Orders content */}
      <div className="bg-white rounded-lg shadow-soft">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <LoadingSpinner size="lg" text="Memuat pesanan..." />
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Error memuat data</h3>
            <p className="mt-1 text-sm text-gray-500">
              Terjadi kesalahan saat memuat pesanan.
            </p>
            <button
              onClick={() => refetch()}
              className="mt-4 btn btn-primary btn-sm"
            >
              Coba Lagi
            </button>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12">
            <div className="mx-auto h-12 w-12 text-gray-400">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="mt-2 text-sm font-medium text-gray-900">Belum ada pesanan</h3>
            <p className="mt-1 text-sm text-gray-500">
              Pesanan akan muncul di sini setelah sinkronisasi dengan marketplace.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden">
            {/* Table header */}
            <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
              <div className="grid grid-cols-12 gap-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                <div className="col-span-3">Pesanan</div>
                <div className="col-span-2">Marketplace</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-2">Total</div>
                <div className="col-span-2">Tanggal</div>
                <div className="col-span-1">Aksi</div>
              </div>
            </div>

            {/* Table body */}
            <div className="divide-y divide-gray-200">
              {orders.map((order) => (
                <div key={order.id} className="px-6 py-4 hover:bg-gray-50">
                  <div className="grid grid-cols-12 gap-4 items-center">
                    {/* Order info */}
                    <div className="col-span-3">
                      <div className="flex flex-col">
                        <p className="text-sm font-medium text-gray-900">
                          {order.orderNumber}
                        </p>
                        <p className="text-sm text-gray-500">
                          ID: {order.marketplaceOrderId}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {order._count?.orderItems || 0} item
                        </p>
                      </div>
                    </div>

                    {/* Marketplace */}
                    <div className="col-span-2">
                      <div className="flex items-center">
                        <span className="text-sm font-medium text-gray-900">
                          {order.marketplaceAccount?.marketplace?.name}
                        </span>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="col-span-2">
                      <OrderStatusBadge status={order.status} />
                    </div>

                    {/* Total */}
                    <div className="col-span-2">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-900">
                          Rp {order.totalAmount?.toLocaleString('id-ID')}
                        </span>
                        {order.shippingCost > 0 && (
                          <span className="text-xs text-gray-500">
                            + Rp {order.shippingCost?.toLocaleString('id-ID')} ongkir
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Date */}
                    <div className="col-span-2">
                      <div className="flex flex-col">
                        <span className="text-sm text-gray-900">
                          {new Date(order.orderDate).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(order.orderDate).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="col-span-1">
                      <Link
                        to={`/orders/${order.id}`}
                        className="text-primary-600 hover:text-primary-500"
                      >
                        <EyeIcon className="h-5 w-5" />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200">
                <Pagination
                  currentPage={pagination.page}
                  totalPages={pagination.totalPages}
                  onPageChange={setPage}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default OrdersPage
