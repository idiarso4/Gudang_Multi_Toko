import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { XMarkIcon } from '@heroicons/react/24/outline'

// Mock marketplace accounts API - replace with actual API call
const marketplaceAccountsApi = {
  getAll: () => Promise.resolve({
    data: {
      accounts: [
        { id: '1', storeName: 'Toko Shopee', marketplace: { name: 'Shopee', code: 'SHOPEE' } },
        { id: '2', storeName: 'Toko Tokopedia', marketplace: { name: 'Tokopedia', code: 'TOKOPEDIA' } },
        { id: '3', storeName: 'Toko Lazada', marketplace: { name: 'Lazada', code: 'LAZADA' } }
      ]
    }
  })
}

interface OrderFiltersProps {
  filters: {
    status: string
    marketplaceAccountId: string
    startDate: string
    endDate: string
    sortBy: string
    sortOrder: string
  }
  onFilterChange: (filters: any) => void
}

const OrderFilters: React.FC<OrderFiltersProps> = ({ filters, onFilterChange }) => {
  const { data: accountsData } = useQuery({
    queryKey: ['marketplace-accounts'],
    queryFn: marketplaceAccountsApi.getAll
  })

  const accounts = accountsData?.data?.accounts || []

  const handleFilterChange = (key: string, value: string) => {
    onFilterChange({ [key]: value })
  }

  const clearFilters = () => {
    onFilterChange({
      status: '',
      marketplaceAccountId: '',
      startDate: '',
      endDate: '',
      sortBy: 'orderDate',
      sortOrder: 'desc'
    })
  }

  const hasActiveFilters = filters.status || filters.marketplaceAccountId || 
    filters.startDate || filters.endDate

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">Filter Pesanan</h3>
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
        {/* Status filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Status Pesanan
          </label>
          <select
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="input text-sm w-full"
          >
            <option value="">Semua Status</option>
            <option value="PENDING">Menunggu</option>
            <option value="CONFIRMED">Dikonfirmasi</option>
            <option value="PROCESSING">Diproses</option>
            <option value="SHIPPED">Dikirim</option>
            <option value="DELIVERED">Selesai</option>
            <option value="CANCELLED">Dibatalkan</option>
            <option value="REFUNDED">Dikembalikan</option>
          </select>
        </div>

        {/* Marketplace filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Marketplace
          </label>
          <select
            value={filters.marketplaceAccountId}
            onChange={(e) => handleFilterChange('marketplaceAccountId', e.target.value)}
            className="input text-sm w-full"
          >
            <option value="">Semua Marketplace</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.marketplace.name} - {account.storeName}
              </option>
            ))}
          </select>
        </div>

        {/* Date range */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tanggal Mulai
          </label>
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => handleFilterChange('startDate', e.target.value)}
            className="input text-sm w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tanggal Akhir
          </label>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => handleFilterChange('endDate', e.target.value)}
            className="input text-sm w-full"
          />
        </div>
      </div>

      {/* Amount range filter */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Rentang Nilai Pesanan
        </label>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <input
              type="number"
              placeholder="Nilai minimum"
              className="input text-sm w-full"
              min="0"
            />
          </div>
          <div>
            <input
              type="number"
              placeholder="Nilai maksimum"
              className="input text-sm w-full"
              min="0"
            />
          </div>
        </div>
      </div>

      {/* Quick filters */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Filter Cepat
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleFilterChange('startDate', new Date().toISOString().split('T')[0])}
            className="btn btn-outline btn-sm"
          >
            Hari Ini
          </button>
          <button
            type="button"
            onClick={() => {
              const weekAgo = new Date()
              weekAgo.setDate(weekAgo.getDate() - 7)
              handleFilterChange('startDate', weekAgo.toISOString().split('T')[0])
            }}
            className="btn btn-outline btn-sm"
          >
            7 Hari Terakhir
          </button>
          <button
            type="button"
            onClick={() => {
              const monthAgo = new Date()
              monthAgo.setMonth(monthAgo.getMonth() - 1)
              handleFilterChange('startDate', monthAgo.toISOString().split('T')[0])
            }}
            className="btn btn-outline btn-sm"
          >
            30 Hari Terakhir
          </button>
          <button
            type="button"
            onClick={() => handleFilterChange('status', 'PENDING')}
            className="btn btn-outline btn-sm"
          >
            Perlu Diproses
          </button>
        </div>
      </div>

      {/* Active filters display */}
      {hasActiveFilters && (
        <div className="pt-4 border-t border-gray-200">
          <div className="flex flex-wrap gap-2">
            {filters.status && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-primary-100 text-primary-800">
                Status: {filters.status}
                <button
                  type="button"
                  onClick={() => handleFilterChange('status', '')}
                  className="ml-2 text-primary-600 hover:text-primary-800"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </span>
            )}
            
            {filters.marketplaceAccountId && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-primary-100 text-primary-800">
                Marketplace: {accounts.find(a => a.id === filters.marketplaceAccountId)?.marketplace.name}
                <button
                  type="button"
                  onClick={() => handleFilterChange('marketplaceAccountId', '')}
                  className="ml-2 text-primary-600 hover:text-primary-800"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </span>
            )}

            {filters.startDate && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-primary-100 text-primary-800">
                Dari: {new Date(filters.startDate).toLocaleDateString('id-ID')}
                <button
                  type="button"
                  onClick={() => handleFilterChange('startDate', '')}
                  className="ml-2 text-primary-600 hover:text-primary-800"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </span>
            )}

            {filters.endDate && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-primary-100 text-primary-800">
                Sampai: {new Date(filters.endDate).toLocaleDateString('id-ID')}
                <button
                  type="button"
                  onClick={() => handleFilterChange('endDate', '')}
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

export default OrderFilters
