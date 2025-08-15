import React, { useState } from 'react'
import { 
  ChevronUpIcon, 
  ChevronDownIcon,
  MagnifyingGlassIcon 
} from '@heroicons/react/24/outline'
import { cn } from '@/utils/cn'

interface Product {
  productId: string
  productName: string
  sku: string
  quantitySold: number
  revenue: number
  orderCount: number
}

interface ProductPerformanceTableProps {
  products: Product[]
}

const ProductPerformanceTable: React.FC<ProductPerformanceTableProps> = ({ products }) => {
  const [sortField, setSortField] = useState<keyof Product>('revenue')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [searchTerm, setSearchTerm] = useState('')

  // Filter products based on search term
  const filteredProducts = products.filter(product =>
    product.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.sku.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Sort products
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    const aValue = a[sortField]
    const bValue = b[sortField]
    
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortDirection === 'asc' 
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue)
    }
    
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue
    }
    
    return 0
  })

  const handleSort = (field: keyof Product) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const SortIcon = ({ field }: { field: keyof Product }) => {
    if (sortField !== field) {
      return <div className="w-4 h-4" />
    }
    
    return sortDirection === 'asc' 
      ? <ChevronUpIcon className="w-4 h-4" />
      : <ChevronDownIcon className="w-4 h-4" />
  }

  if (!products || products.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-soft p-6">
        <div className="text-center py-12">
          <div className="mx-auto h-12 w-12 text-gray-400">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            Tidak ada data produk
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Belum ada data performa produk untuk periode ini.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-soft">
      {/* Header with search */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">
            Performa Produk
          </h3>
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Cari produk atau SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Rank
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('productName')}
              >
                <div className="flex items-center space-x-1">
                  <span>Produk</span>
                  <SortIcon field="productName" />
                </div>
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('quantitySold')}
              >
                <div className="flex items-center space-x-1">
                  <span>Qty Terjual</span>
                  <SortIcon field="quantitySold" />
                </div>
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('revenue')}
              >
                <div className="flex items-center space-x-1">
                  <span>Revenue</span>
                  <SortIcon field="revenue" />
                </div>
              </th>
              <th 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('orderCount')}
              >
                <div className="flex items-center space-x-1">
                  <span>Jumlah Order</span>
                  <SortIcon field="orderCount" />
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Avg Order Value
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedProducts.map((product, index) => {
              const avgOrderValue = product.orderCount > 0 
                ? product.revenue / product.orderCount 
                : 0

              return (
                <tr key={product.productId} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <span className={cn(
                        'inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium',
                        index < 3 
                          ? 'bg-yellow-100 text-yellow-800' 
                          : 'bg-gray-100 text-gray-600'
                      )}>
                        {index + 1}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <div className="text-sm font-medium text-gray-900 truncate max-w-xs">
                        {product.productName}
                      </div>
                      <div className="text-sm text-gray-500">
                        SKU: {product.sku}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {product.quantitySold.toLocaleString('id-ID')}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      Rp {product.revenue.toLocaleString('id-ID')}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {product.orderCount.toLocaleString('id-ID')}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      Rp {avgOrderValue.toLocaleString('id-ID')}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footer with summary */}
      <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>
            Menampilkan {sortedProducts.length} dari {products.length} produk
          </span>
          <div className="flex space-x-6">
            <span>
              Total Qty: {sortedProducts.reduce((sum, p) => sum + p.quantitySold, 0).toLocaleString('id-ID')}
            </span>
            <span>
              Total Revenue: Rp {sortedProducts.reduce((sum, p) => sum + p.revenue, 0).toLocaleString('id-ID')}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProductPerformanceTable
