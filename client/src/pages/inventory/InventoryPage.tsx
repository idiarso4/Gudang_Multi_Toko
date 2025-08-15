import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  MagnifyingGlassIcon,
  FunnelIcon,
  PencilIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

import { inventoryApi } from '@/services/api'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Pagination from '@/components/ui/Pagination'
import InventoryUpdateModal from '@/components/inventory/InventoryUpdateModal'
import { cn } from '@/utils/cn'

const InventoryPage: React.FC = () => {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({
    lowStock: '',
    outOfStock: '',
    sortBy: 'lastUpdated',
    sortOrder: 'desc'
  })
  const [showFilters, setShowFilters] = useState(false)
  const [selectedItem, setSelectedItem] = useState<any>(null)
  const [showUpdateModal, setShowUpdateModal] = useState(false)

  const queryClient = useQueryClient()

  const { data: inventoryData, isLoading, error, refetch } = useQuery({
    queryKey: ['inventory', page, search, filters],
    queryFn: () => inventoryApi.getAll({
      page,
      limit: 20,
      search,
      ...filters
    }),
    keepPreviousData: true
  })

  const updateInventoryMutation = useMutation({
    mutationFn: inventoryApi.updateStock,
    onSuccess: () => {
      queryClient.invalidateQueries(['inventory'])
      toast.success('Stok berhasil diperbarui')
      setShowUpdateModal(false)
      setSelectedItem(null)
    },
    onError: (error: any) => {
      toast.error(error.message || 'Gagal memperbarui stok')
    }
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
  }

  const handleFilterChange = (newFilters: any) => {
    setFilters(prev => ({ ...prev, ...newFilters }))
    setPage(1)
  }

  const handleUpdateStock = (item: any) => {
    setSelectedItem(item)
    setShowUpdateModal(true)
  }

  const handleUpdateSubmit = (updates: any) => {
    if (selectedItem) {
      updateInventoryMutation.mutate({
        productId: selectedItem.productId,
        updates: [{
          variantId: selectedItem.variantId,
          stockQuantity: updates.stockQuantity,
          minStockLevel: updates.minStockLevel,
          reason: updates.reason
        }]
      })
    }
  }

  const inventory = inventoryData?.data?.inventory || []
  const pagination = inventoryData?.data?.pagination

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventori</h1>
          <p className="mt-1 text-sm text-gray-600">
            Kelola stok produk dan pantau ketersediaan
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
                placeholder="Cari produk, SKU, atau nama..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-10 w-full"
              />
            </div>
          </form>

          {/* Controls */}
          <div className="flex items-center space-x-3">
            {/* Quick filters */}
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => handleFilterChange({ lowStock: 'true', outOfStock: '' })}
                className={cn(
                  'btn btn-sm',
                  filters.lowStock === 'true' ? 'btn-primary' : 'btn-outline'
                )}
              >
                Stok Rendah
              </button>
              <button
                type="button"
                onClick={() => handleFilterChange({ outOfStock: 'true', lowStock: '' })}
                className={cn(
                  'btn btn-sm',
                  filters.outOfStock === 'true' ? 'btn-primary' : 'btn-outline'
                )}
              >
                Habis
              </button>
            </div>

            {/* Sort */}
            <select
              value={`${filters.sortBy}-${filters.sortOrder}`}
              onChange={(e) => {
                const [sortBy, sortOrder] = e.target.value.split('-')
                handleFilterChange({ sortBy, sortOrder })
              }}
              className="input text-sm"
            >
              <option value="lastUpdated-desc">Terakhir Diperbarui</option>
              <option value="stockQuantity-asc">Stok Terendah</option>
              <option value="stockQuantity-desc">Stok Tertinggi</option>
              <option value="product.name-asc">Nama A-Z</option>
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Status Stok
                </label>
                <select
                  value={filters.lowStock || filters.outOfStock || ''}
                  onChange={(e) => {
                    if (e.target.value === 'low') {
                      handleFilterChange({ lowStock: 'true', outOfStock: '' })
                    } else if (e.target.value === 'out') {
                      handleFilterChange({ outOfStock: 'true', lowStock: '' })
                    } else {
                      handleFilterChange({ lowStock: '', outOfStock: '' })
                    }
                  }}
                  className="input text-sm w-full"
                >
                  <option value="">Semua</option>
                  <option value="low">Stok Rendah</option>
                  <option value="out">Habis</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Inventory content */}
      <div className="bg-white rounded-lg shadow-soft">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <LoadingSpinner size="lg" text="Memuat inventori..." />
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Error memuat data</h3>
            <p className="mt-1 text-sm text-gray-500">
              Terjadi kesalahan saat memuat inventori.
            </p>
            <button
              onClick={() => refetch()}
              className="mt-4 btn btn-primary btn-sm"
            >
              Coba Lagi
            </button>
          </div>
        ) : inventory.length === 0 ? (
          <div className="text-center py-12">
            <div className="mx-auto h-12 w-12 text-gray-400">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <h3 className="mt-2 text-sm font-medium text-gray-900">Belum ada inventori</h3>
            <p className="mt-1 text-sm text-gray-500">
              Inventori akan muncul setelah Anda menambahkan produk.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden">
            {/* Table header */}
            <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
              <div className="grid grid-cols-12 gap-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                <div className="col-span-4">Produk</div>
                <div className="col-span-2">Stok Saat Ini</div>
                <div className="col-span-2">Stok Tersedia</div>
                <div className="col-span-2">Min. Stok</div>
                <div className="col-span-1">Status</div>
                <div className="col-span-1">Aksi</div>
              </div>
            </div>

            {/* Table body */}
            <div className="divide-y divide-gray-200">
              {inventory.map((item) => {
                const isLowStock = item.stockQuantity <= item.minStockLevel
                const isOutOfStock = item.stockQuantity <= 0

                return (
                  <div key={`${item.productId}-${item.variantId || 'main'}`} className="px-6 py-4 hover:bg-gray-50">
                    <div className="grid grid-cols-12 gap-4 items-center">
                      {/* Product info */}
                      <div className="col-span-4">
                        <div className="flex items-center space-x-3">
                          {item.product?.images && item.product.images.length > 0 ? (
                            <img
                              src={item.product.images[0]}
                              alt={item.product.name}
                              className="h-10 w-10 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="h-10 w-10 bg-gray-200 rounded-lg flex items-center justify-center">
                              <span className="text-gray-400 text-xs">No Image</span>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {item.product?.name}
                              {item.variant && (
                                <span className="text-gray-500 ml-1">
                                  - {item.variant.variantName}
                                </span>
                              )}
                            </p>
                            <p className="text-sm text-gray-500">
                              SKU: {item.variant?.sku || item.product?.sku}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Current stock */}
                      <div className="col-span-2">
                        <span className={cn(
                          'text-sm font-medium',
                          isOutOfStock ? 'text-red-600' : isLowStock ? 'text-yellow-600' : 'text-gray-900'
                        )}>
                          {item.stockQuantity}
                        </span>
                      </div>

                      {/* Available stock */}
                      <div className="col-span-2">
                        <span className="text-sm text-gray-900">
                          {item.availableQuantity}
                        </span>
                      </div>

                      {/* Min stock */}
                      <div className="col-span-2">
                        <span className="text-sm text-gray-500">
                          {item.minStockLevel}
                        </span>
                      </div>

                      {/* Status */}
                      <div className="col-span-1">
                        {isOutOfStock ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            Habis
                          </span>
                        ) : isLowStock ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            <ExclamationTriangleIcon className="h-3 w-3 mr-1" />
                            Rendah
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <CheckCircleIcon className="h-3 w-3 mr-1" />
                            Aman
                          </span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="col-span-1">
                        <button
                          onClick={() => handleUpdateStock(item)}
                          className="text-primary-600 hover:text-primary-500"
                          title="Update Stok"
                        >
                          <PencilIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
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

      {/* Update Modal */}
      {showUpdateModal && selectedItem && (
        <InventoryUpdateModal
          item={selectedItem}
          onClose={() => {
            setShowUpdateModal(false)
            setSelectedItem(null)
          }}
          onSubmit={handleUpdateSubmit}
          isLoading={updateInventoryMutation.isLoading}
        />
      )}
    </div>
  )
}

export default InventoryPage
