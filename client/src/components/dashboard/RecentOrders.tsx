import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { EyeIcon } from '@heroicons/react/24/outline'

import { ordersApi } from '@/services/api'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { cn } from '@/utils/cn'

const statusColors = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  CONFIRMED: 'bg-blue-100 text-blue-800',
  PROCESSING: 'bg-purple-100 text-purple-800',
  SHIPPED: 'bg-indigo-100 text-indigo-800',
  DELIVERED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
  REFUNDED: 'bg-gray-100 text-gray-800'
}

const statusLabels = {
  PENDING: 'Menunggu',
  CONFIRMED: 'Dikonfirmasi',
  PROCESSING: 'Diproses',
  SHIPPED: 'Dikirim',
  DELIVERED: 'Selesai',
  CANCELLED: 'Dibatalkan',
  REFUNDED: 'Dikembalikan'
}

const RecentOrders: React.FC = () => {
  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['recent-orders'],
    queryFn: () => ordersApi.getAll({ page: 1, limit: 5 }),
    refetchInterval: 30 * 1000, // Refetch every 30 seconds
  })

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-soft p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Pesanan Terbaru
        </h3>
        <div className="flex items-center justify-center h-32">
          <LoadingSpinner size="md" text="Memuat pesanan..." />
        </div>
      </div>
    )
  }

  const orders = ordersData?.data?.orders || []

  return (
    <div className="bg-white rounded-lg shadow-soft p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">
          Pesanan Terbaru
        </h3>
        <Link
          to="/orders"
          className="text-sm text-primary-600 hover:text-primary-500 font-medium"
        >
          Lihat semua
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">Belum ada pesanan</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div
              key={order.id}
              className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {order.orderNumber}
                  </p>
                  <span className={cn(
                    'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                    statusColors[order.status as keyof typeof statusColors]
                  )}>
                    {statusLabels[order.status as keyof typeof statusLabels]}
                  </span>
                </div>
                
                <div className="mt-1 flex items-center text-sm text-gray-500">
                  <span>
                    {order.marketplaceAccount?.marketplace?.name}
                  </span>
                  <span className="mx-2">•</span>
                  <span>
                    Rp {order.totalAmount?.toLocaleString('id-ID')}
                  </span>
                  <span className="mx-2">•</span>
                  <span>
                    {order._count?.orderItems || 0} item
                  </span>
                </div>
                
                <p className="mt-1 text-xs text-gray-400">
                  {new Date(order.orderDate).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
              
              <div className="ml-4 flex-shrink-0">
                <Link
                  to={`/orders/${order.id}`}
                  className="inline-flex items-center p-2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <EyeIcon className="h-5 w-5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default RecentOrders
