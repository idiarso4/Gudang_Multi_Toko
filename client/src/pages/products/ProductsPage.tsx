import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { 
  PlusIcon, 
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowsUpDownIcon,
  EyeIcon,
  PencilIcon,
  TrashIcon
} from '@heroicons/react/24/outline'

import { productsApi } from '@/services/api'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Pagination from '@/components/ui/Pagination'
import ProductCard from '@/components/products/ProductCard'
import ProductFilters from '@/components/products/ProductFilters'
import { cn } from '@/utils/cn'

const ProductsPage: React.FC = () => {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({
    categoryId: '',
    isActive: '',
    sortBy: 'createdAt',
    sortOrder: 'desc'
  })
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showFilters, setShowFilters] = useState(false)

  const { data: productsData, isLoading, error } = useQuery({
    queryKey: ['products', page, search, filters],
    queryFn: () => productsApi.getAll({
      page,
      limit: 12,
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

  const products = productsData?.data?.products || []
  const pagination = productsData?.data?.pagination

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Produk</h1>
          <p className="mt-1 text-sm text-gray-600">
            Kelola semua produk Anda di sini
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <Link
            to="/products/create"
            className="btn btn-primary btn-md"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            Tambah Produk
          </Link>
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
            {/* View mode toggle */}
            <div className="flex rounded-md shadow-sm">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={cn(
                  'px-3 py-2 text-sm font-medium rounded-l-md border',
                  viewMode === 'grid'
                    ? 'bg-primary-50 border-primary-200 text-primary-700'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                )}
              >
                Grid
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={cn(
                  'px-3 py-2 text-sm font-medium rounded-r-md border-t border-r border-b',
                  viewMode === 'list'
                    ? 'bg-primary-50 border-primary-200 text-primary-700'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                )}
              >
                List
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
              <option value="createdAt-desc">Terbaru</option>
              <option value="createdAt-asc">Terlama</option>
              <option value="name-asc">Nama A-Z</option>
              <option value="name-desc">Nama Z-A</option>
              <option value="price-asc">Harga Terendah</option>
              <option value="price-desc">Harga Tertinggi</option>
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
            <ProductFilters
              filters={filters}
              onFilterChange={handleFilterChange}
            />
          </div>
        )}
      </div>

      {/* Products content */}
      <div className="bg-white rounded-lg shadow-soft">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <LoadingSpinner size="lg" text="Memuat produk..." />
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Terjadi kesalahan saat memuat produk</p>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-12">
            <div className="mx-auto h-12 w-12 text-gray-400">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <h3 className="mt-2 text-sm font-medium text-gray-900">Belum ada produk</h3>
            <p className="mt-1 text-sm text-gray-500">
              Mulai dengan menambahkan produk pertama Anda.
            </p>
            <div className="mt-6">
              <Link
                to="/products/create"
                className="btn btn-primary btn-md"
              >
                <PlusIcon className="h-5 w-5 mr-2" />
                Tambah Produk
              </Link>
            </div>
          </div>
        ) : (
          <div className="p-6">
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {products.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="flex-shrink-0">
                        {product.images && product.images.length > 0 ? (
                          <img
                            src={product.images[0]}
                            alt={product.name}
                            className="h-12 w-12 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="h-12 w-12 bg-gray-200 rounded-lg flex items-center justify-center">
                            <span className="text-gray-400 text-xs">No Image</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {product.name}
                        </p>
                        <p className="text-sm text-gray-500">
                          SKU: {product.sku}
                        </p>
                        <div className="flex items-center space-x-4 mt-1">
                          <span className="text-sm font-medium text-gray-900">
                            Rp {product.price?.toLocaleString('id-ID')}
                          </span>
                          <span className="text-sm text-gray-500">
                            Stok: {product.inventory?.stockQuantity || 0}
                          </span>
                          <span className={cn(
                            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                            product.isActive
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          )}>
                            {product.isActive ? 'Aktif' : 'Nonaktif'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Link
                        to={`/products/${product.id}`}
                        className="p-2 text-gray-400 hover:text-gray-600"
                      >
                        <EyeIcon className="h-5 w-5" />
                      </Link>
                      <Link
                        to={`/products/${product.id}/edit`}
                        className="p-2 text-gray-400 hover:text-gray-600"
                      >
                        <PencilIcon className="h-5 w-5" />
                      </Link>
                      <button
                        type="button"
                        className="p-2 text-gray-400 hover:text-red-600"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="mt-8">
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

export default ProductsPage
