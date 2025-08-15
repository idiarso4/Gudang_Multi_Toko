import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { XMarkIcon } from '@heroicons/react/24/outline'

// Mock categories API - replace with actual API call
const categoriesApi = {
  getAll: () => Promise.resolve({
    data: {
      categories: [
        { id: '1', name: 'Elektronik' },
        { id: '2', name: 'Fashion' },
        { id: '3', name: 'Rumah & Taman' },
        { id: '4', name: 'Olahraga' },
        { id: '5', name: 'Kecantikan' }
      ]
    }
  })
}

interface ProductFiltersProps {
  filters: {
    categoryId: string
    isActive: string
    sortBy: string
    sortOrder: string
  }
  onFilterChange: (filters: any) => void
}

const ProductFilters: React.FC<ProductFiltersProps> = ({ filters, onFilterChange }) => {
  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: categoriesApi.getAll
  })

  const categories = categoriesData?.data?.categories || []

  const handleFilterChange = (key: string, value: string) => {
    onFilterChange({ [key]: value })
  }

  const clearFilters = () => {
    onFilterChange({
      categoryId: '',
      isActive: '',
      sortBy: 'createdAt',
      sortOrder: 'desc'
    })
  }

  const hasActiveFilters = filters.categoryId || filters.isActive

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">Filter Produk</h3>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-sm text-primary-600 hover:text-primary-500 flex items-center"
          >
            <XMarkIcon className="h-4 w-4 mr-1" />
            Hapus Filter
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Category filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Kategori
          </label>
          <select
            value={filters.categoryId}
            onChange={(e) => handleFilterChange('categoryId', e.target.value)}
            className="input text-sm w-full"
          >
            <option value="">Semua Kategori</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        {/* Status filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Status
          </label>
          <select
            value={filters.isActive}
            onChange={(e) => handleFilterChange('isActive', e.target.value)}
            className="input text-sm w-full"
          >
            <option value="">Semua Status</option>
            <option value="true">Aktif</option>
            <option value="false">Nonaktif</option>
          </select>
        </div>

        {/* Stock status filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Status Stok
          </label>
          <select
            value=""
            onChange={(e) => {
              // Handle stock status filter
              console.log('Stock filter:', e.target.value)
            }}
            className="input text-sm w-full"
          >
            <option value="">Semua Stok</option>
            <option value="in-stock">Tersedia</option>
            <option value="low-stock">Stok Rendah</option>
            <option value="out-of-stock">Habis</option>
          </select>
        </div>

        {/* Marketplace sync filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Status Sync
          </label>
          <select
            value=""
            onChange={(e) => {
              // Handle sync status filter
              console.log('Sync filter:', e.target.value)
            }}
            className="input text-sm w-full"
          >
            <option value="">Semua</option>
            <option value="synced">Tersinkron</option>
            <option value="pending">Menunggu</option>
            <option value="failed">Gagal</option>
          </select>
        </div>
      </div>

      {/* Price range filter */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Rentang Harga
        </label>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <input
              type="number"
              placeholder="Harga minimum"
              className="input text-sm w-full"
              min="0"
            />
          </div>
          <div>
            <input
              type="number"
              placeholder="Harga maksimum"
              className="input text-sm w-full"
              min="0"
            />
          </div>
        </div>
      </div>

      {/* Active filters display */}
      {hasActiveFilters && (
        <div className="pt-4 border-t border-gray-200">
          <div className="flex flex-wrap gap-2">
            {filters.categoryId && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-primary-100 text-primary-800">
                Kategori: {categories.find(c => c.id === filters.categoryId)?.name}
                <button
                  type="button"
                  onClick={() => handleFilterChange('categoryId', '')}
                  className="ml-2 text-primary-600 hover:text-primary-800"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </span>
            )}
            
            {filters.isActive && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-primary-100 text-primary-800">
                Status: {filters.isActive === 'true' ? 'Aktif' : 'Nonaktif'}
                <button
                  type="button"
                  onClick={() => handleFilterChange('isActive', '')}
                  className="ml-2 text-primary-600 hover:text-primary-800"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default ProductFilters
