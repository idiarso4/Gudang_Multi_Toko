import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ExclamationTriangleIcon, CubeIcon } from '@heroicons/react/24/outline'

import { inventoryApi } from '@/services/api'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

const LowStockAlert: React.FC = () => {
  const { data: lowStockData, isLoading } = useQuery({
    queryKey: ['low-stock-items'],
    queryFn: () => inventoryApi.getLowStock(),
    refetchInterval: 2 * 60 * 1000, // Refetch every 2 minutes
  })

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-soft p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Peringatan Stok Rendah
        </h3>
        <div className="flex items-center justify-center h-32">
          <LoadingSpinner size="md" text="Memuat data stok..." />
        </div>
      </div>
    )
  }

  const lowStockItems = lowStockData?.data?.lowStockItems || []

  return (
    <div className="bg-white rounded-lg shadow-soft p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">
          Peringatan Stok Rendah
        </h3>
        <Link
          to="/inventory?lowStock=true"
          className="text-sm text-primary-600 hover:text-primary-500 font-medium"
        >
          Lihat semua
        </Link>
      </div>

      {lowStockItems.length === 0 ? (
        <div className="text-center py-8">
          <CubeIcon className="mx-auto h-12 w-12 text-green-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            Stok Aman
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Semua produk memiliki stok yang cukup
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {lowStockItems.slice(0, 5).map((item) => (
            <div
              key={`${item.productId}-${item.variantId || 'main'}`}
              className="flex items-center p-3 bg-red-50 border border-red-200 rounded-lg"
            >
              <div className="flex-shrink-0">
                <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
              </div>
              
              <div className="ml-3 flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {item.product?.name}
                    {item.variant && (
                      <span className="text-gray-500 ml-1">
                        - {item.variant.variantName}
                      </span>
                    )}
                  </p>
                  <span className="text-sm font-medium text-red-600">
                    {item.stockQuantity} tersisa
                  </span>
                </div>
                
                <div className="mt-1 flex items-center text-xs text-gray-500">
                  <span>SKU: {item.variant?.sku || item.product?.sku}</span>
                  <span className="mx-2">•</span>
                  <span>Min: {item.minStockLevel}</span>
                </div>
              </div>
            </div>
          ))}
          
          {lowStockItems.length > 5 && (
            <div className="text-center pt-2">
              <Link
                to="/inventory?lowStock=true"
                className="text-sm text-red-600 hover:text-red-500 font-medium"
              >
                +{lowStockItems.length - 5} produk lainnya
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default LowStockAlert
