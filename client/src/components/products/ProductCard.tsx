import React from 'react'
import { Link } from 'react-router-dom'
import { 
  EyeIcon, 
  PencilIcon, 
  TrashIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline'

import { cn } from '@/utils/cn'

interface Product {
  id: string
  name: string
  sku: string
  price: number
  images?: string[]
  isActive: boolean
  category?: {
    name: string
  }
  inventory?: {
    stockQuantity: number
    minStockLevel: number
  }
  marketplaceProducts?: Array<{
    marketplace: {
      name: string
      code: string
    }
    syncStatus: string
  }>
  _count?: {
    variants: number
  }
}

interface ProductCardProps {
  product: Product
}

const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const isLowStock = product.inventory && 
    product.inventory.stockQuantity <= product.inventory.minStockLevel

  const syncedMarketplaces = product.marketplaceProducts?.filter(
    mp => mp.syncStatus === 'SUCCESS'
  ).length || 0

  const totalMarketplaces = product.marketplaceProducts?.length || 0

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
      {/* Product image */}
      <div className="aspect-w-1 aspect-h-1 w-full overflow-hidden bg-gray-200">
        {product.images && product.images.length > 0 ? (
          <img
            src={product.images[0]}
            alt={product.name}
            className="h-48 w-full object-cover object-center group-hover:opacity-75"
          />
        ) : (
          <div className="h-48 w-full flex items-center justify-center bg-gray-100">
            <svg className="h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </div>

      {/* Product info */}
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-gray-900 truncate">
              {product.name}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              SKU: {product.sku}
            </p>
            {product.category && (
              <p className="text-xs text-gray-400 mt-1">
                {product.category.name}
              </p>
            )}
          </div>
          
          {/* Status indicators */}
          <div className="flex flex-col items-end space-y-1">
            <span className={cn(
              'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
              product.isActive
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            )}>
              {product.isActive ? 'Aktif' : 'Nonaktif'}
            </span>
            
            {isLowStock && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                <ExclamationTriangleIcon className="h-3 w-3 mr-1" />
                Stok Rendah
              </span>
            )}
          </div>
        </div>

        {/* Price and stock */}
        <div className="mt-3">
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold text-gray-900">
              Rp {product.price?.toLocaleString('id-ID')}
            </span>
            <span className={cn(
              'text-sm font-medium',
              isLowStock ? 'text-red-600' : 'text-gray-600'
            )}>
              Stok: {product.inventory?.stockQuantity || 0}
            </span>
          </div>
          
          {product._count?.variants && product._count.variants > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              {product._count.variants} varian
            </p>
          )}
        </div>

        {/* Marketplace sync status */}
        {totalMarketplaces > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">
                Marketplace:
              </span>
              <div className="flex items-center space-x-1">
                {syncedMarketplaces === totalMarketplaces ? (
                  <CheckCircleIcon className="h-4 w-4 text-green-500" />
                ) : (
                  <ExclamationTriangleIcon className="h-4 w-4 text-yellow-500" />
                )}
                <span className="text-xs text-gray-600">
                  {syncedMarketplaces}/{totalMarketplaces}
                </span>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-1 mt-2">
              {product.marketplaceProducts?.slice(0, 3).map((mp, index) => (
                <span
                  key={index}
                  className={cn(
                    'inline-flex items-center px-2 py-1 rounded text-xs font-medium',
                    mp.syncStatus === 'SUCCESS'
                      ? 'bg-green-100 text-green-700'
                      : mp.syncStatus === 'FAILED'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-yellow-100 text-yellow-700'
                  )}
                >
                  {mp.marketplace.name}
                </span>
              ))}
              {totalMarketplaces > 3 && (
                <span className="text-xs text-gray-500">
                  +{totalMarketplaces - 3}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex items-center justify-between">
          <Link
            to={`/products/${product.id}`}
            className="text-primary-600 hover:text-primary-500 text-sm font-medium"
          >
            Lihat Detail
          </Link>
          
          <div className="flex items-center space-x-2">
            <Link
              to={`/products/${product.id}`}
              className="p-1 text-gray-400 hover:text-gray-600"
              title="Lihat"
            >
              <EyeIcon className="h-4 w-4" />
            </Link>
            <Link
              to={`/products/${product.id}/edit`}
              className="p-1 text-gray-400 hover:text-gray-600"
              title="Edit"
            >
              <PencilIcon className="h-4 w-4" />
            </Link>
            <button
              type="button"
              className="p-1 text-gray-400 hover:text-red-600"
              title="Hapus"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProductCard
