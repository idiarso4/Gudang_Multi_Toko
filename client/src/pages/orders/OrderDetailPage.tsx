import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  ArrowLeftIcon,
  PencilIcon,
  TagIcon,
  UserIcon,
  ClockIcon,
  TruckIcon,
  CheckCircleIcon,
  XCircleIcon,
  PrinterIcon,
  DocumentDuplicateIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

import { ordersApi } from '@/services/api'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import OrderStatusBadge from '@/components/orders/OrderStatusBadge'
import OrderStatusUpdateModal from '@/components/orders/OrderStatusUpdateModal'
import OrderAssignModal from '@/components/orders/OrderAssignModal'
import OrderTagModal from '@/components/orders/OrderTagModal'
import { cn } from '@/utils/cn'

const OrderDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [showStatusModal, setShowStatusModal] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [showTagModal, setShowTagModal] = useState(false)

  // Fetch order details
  const { data: orderData, isLoading, error } = useQuery({
    queryKey: ['order-detail', id],
    queryFn: () => ordersApi.getById(id!),
    enabled: !!id
  })

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ status, reason, updateMarketplace }: any) =>
      ordersApi.updateStatus(id!, status, reason, updateMarketplace),
    onSuccess: () => {
      toast.success('Status pesanan berhasil diperbarui')
      queryClient.invalidateQueries(['order-detail', id])
      queryClient.invalidateQueries(['orders'])
      setShowStatusModal(false)
    },
    onError: (error: any) => {
      toast.error(error.message || 'Gagal memperbarui status pesanan')
    }
  })

  const order = orderData?.data?.order

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" text="Memuat detail pesanan..." />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="text-center py-12">
        <XCircleIcon className="mx-auto h-12 w-12 text-red-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">Pesanan tidak ditemukan</h3>
        <p className="mt-1 text-sm text-gray-500">
          Pesanan yang Anda cari tidak ditemukan atau telah dihapus.
        </p>
        <button
          onClick={() => navigate('/orders')}
          className="mt-4 btn btn-primary btn-sm"
        >
          Kembali ke Daftar Pesanan
        </button>
      </div>
    )
  }

  const handleStatusUpdate = (data: any) => {
    updateStatusMutation.mutate(data)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/orders')}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-md"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Pesanan {order.orderNumber}
            </h1>
            <p className="text-sm text-gray-500">
              ID Marketplace: {order.marketplaceOrderId}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowTagModal(true)}
            className="btn btn-outline btn-sm"
          >
            <TagIcon className="h-4 w-4 mr-2" />
            Tag
          </button>
          <button
            onClick={() => setShowAssignModal(true)}
            className="btn btn-outline btn-sm"
          >
            <UserIcon className="h-4 w-4 mr-2" />
            Assign
          </button>
          <button
            onClick={() => setShowStatusModal(true)}
            className="btn btn-primary btn-sm"
          >
            <PencilIcon className="h-4 w-4 mr-2" />
            Update Status
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Status */}
          <div className="bg-white rounded-lg shadow-soft p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900">Status Pesanan</h2>
              <OrderStatusBadge status={order.status} size="lg" />
            </div>

            {/* Status Timeline */}
            <div className="flow-root">
              <ul className="-mb-8">
                {order.statusHistory?.map((history: any, index: number) => (
                  <li key={history.id}>
                    <div className="relative pb-8">
                      {index !== order.statusHistory.length - 1 && (
                        <span
                          className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200"
                          aria-hidden="true"
                        />
                      )}
                      <div className="relative flex space-x-3">
                        <div>
                          <span className={cn(
                            'h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white',
                            history.status === 'DELIVERED' ? 'bg-green-500' :
                            history.status === 'CANCELLED' ? 'bg-red-500' :
                            history.status === 'SHIPPED' ? 'bg-blue-500' :
                            'bg-gray-400'
                          )}>
                            {history.status === 'DELIVERED' ? (
                              <CheckCircleIcon className="h-5 w-5 text-white" />
                            ) : history.status === 'CANCELLED' ? (
                              <XCircleIcon className="h-5 w-5 text-white" />
                            ) : history.status === 'SHIPPED' ? (
                              <TruckIcon className="h-5 w-5 text-white" />
                            ) : (
                              <ClockIcon className="h-5 w-5 text-white" />
                            )}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                          <div>
                            <p className="text-sm text-gray-500">
                              Status diubah ke{' '}
                              <span className="font-medium text-gray-900">
                                <OrderStatusBadge status={history.status} size="sm" />
                              </span>
                              {history.previousStatus && (
                                <span> dari {history.previousStatus}</span>
                              )}
                            </p>
                            {history.reason && (
                              <p className="text-sm text-gray-500 mt-1">
                                Alasan: {history.reason}
                              </p>
                            )}
                            <p className="text-xs text-gray-400 mt-1">
                              oleh {history.changedBy}
                            </p>
                          </div>
                          <div className="text-right text-sm whitespace-nowrap text-gray-500">
                            <time dateTime={history.changedAt}>
                              {new Date(history.changedAt).toLocaleString('id-ID')}
                            </time>
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Order Items */}
          <div className="bg-white rounded-lg shadow-soft p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Item Pesanan</h2>
            
            <div className="space-y-4">
              {order.orderItems?.map((item: any) => (
                <div key={item.id} className="flex items-center space-x-4 p-4 border border-gray-200 rounded-lg">
                  <div className="flex-shrink-0">
                    {item.product?.images && item.product.images.length > 0 ? (
                      <img
                        src={item.product.images[0]}
                        alt={item.productName}
                        className="h-16 w-16 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="h-16 w-16 bg-gray-200 rounded-lg flex items-center justify-center">
                        <span className="text-gray-400 text-xs">No Image</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-gray-900">
                      {item.productName}
                    </h4>
                    {item.variantName && (
                      <p className="text-sm text-gray-500">
                        Varian: {item.variantName}
                      </p>
                    )}
                    <p className="text-sm text-gray-500">
                      SKU: {item.sku}
                    </p>
                  </div>
                  
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">
                      {item.quantity} x Rp {item.unitPrice?.toLocaleString('id-ID')}
                    </p>
                    <p className="text-sm text-gray-500">
                      Total: Rp {item.totalPrice?.toLocaleString('id-ID')}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Order Summary */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal:</span>
                  <span className="text-gray-900">
                    Rp {(order.totalAmount - order.shippingCost).toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Ongkos Kirim:</span>
                  <span className="text-gray-900">
                    Rp {order.shippingCost?.toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="flex justify-between text-base font-medium border-t border-gray-200 pt-2">
                  <span className="text-gray-900">Total:</span>
                  <span className="text-gray-900">
                    Rp {order.totalAmount?.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Order Info */}
          <div className="bg-white rounded-lg shadow-soft p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Informasi Pesanan</h3>
            
            <div className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-gray-500">Marketplace</dt>
                <dd className="text-sm text-gray-900 mt-1">
                  {order.marketplaceAccount?.marketplace?.name}
                </dd>
              </div>
              
              <div>
                <dt className="text-sm font-medium text-gray-500">Tanggal Pesanan</dt>
                <dd className="text-sm text-gray-900 mt-1">
                  {new Date(order.orderDate).toLocaleString('id-ID')}
                </dd>
              </div>
              
              {order.assignedUser && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Ditugaskan ke</dt>
                  <dd className="text-sm text-gray-900 mt-1">
                    {order.assignedUser.fullName}
                  </dd>
                </div>
              )}
              
              {order.notes && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Catatan</dt>
                  <dd className="text-sm text-gray-900 mt-1">
                    {order.notes}
                  </dd>
                </div>
              )}
            </div>
          </div>

          {/* Customer Info */}
          <div className="bg-white rounded-lg shadow-soft p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Informasi Pelanggan</h3>
            
            <div className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-gray-500">Nama</dt>
                <dd className="text-sm text-gray-900 mt-1">
                  {order.customerInfo?.name || '-'}
                </dd>
              </div>
              
              <div>
                <dt className="text-sm font-medium text-gray-500">Email</dt>
                <dd className="text-sm text-gray-900 mt-1">
                  {order.customerInfo?.email || '-'}
                </dd>
              </div>
              
              <div>
                <dt className="text-sm font-medium text-gray-500">Telepon</dt>
                <dd className="text-sm text-gray-900 mt-1">
                  {order.customerInfo?.phone || '-'}
                </dd>
              </div>
            </div>
          </div>

          {/* Shipping Address */}
          <div className="bg-white rounded-lg shadow-soft p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Alamat Pengiriman</h3>
            
            <div className="text-sm text-gray-900">
              {order.shippingAddress?.street && (
                <p>{order.shippingAddress.street}</p>
              )}
              {order.shippingAddress?.city && (
                <p>{order.shippingAddress.city}</p>
              )}
              {order.shippingAddress?.state && (
                <p>{order.shippingAddress.state}</p>
              )}
              {order.shippingAddress?.postalCode && (
                <p>{order.shippingAddress.postalCode}</p>
              )}
              {order.shippingAddress?.country && (
                <p>{order.shippingAddress.country}</p>
              )}
            </div>
          </div>

          {/* Tags */}
          {order.tags && order.tags.length > 0 && (
            <div className="bg-white rounded-lg shadow-soft p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Tags</h3>
              
              <div className="flex flex-wrap gap-2">
                {order.tags.map((tag: any) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                  >
                    {tag.tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="bg-white rounded-lg shadow-soft p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Aksi</h3>
            
            <div className="space-y-3">
              <button className="btn btn-outline btn-sm w-full">
                <PrinterIcon className="h-4 w-4 mr-2" />
                Cetak Invoice
              </button>
              
              <button className="btn btn-outline btn-sm w-full">
                <DocumentDuplicateIcon className="h-4 w-4 mr-2" />
                Duplikasi Pesanan
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showStatusModal && (
        <OrderStatusUpdateModal
          order={order}
          onClose={() => setShowStatusModal(false)}
          onSubmit={handleStatusUpdate}
          isLoading={updateStatusMutation.isLoading}
        />
      )}

      {showAssignModal && (
        <OrderAssignModal
          order={order}
          onClose={() => setShowAssignModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries(['order-detail', id])
            setShowAssignModal(false)
          }}
        />
      )}

      {showTagModal && (
        <OrderTagModal
          order={order}
          onClose={() => setShowTagModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries(['order-detail', id])
            setShowTagModal(false)
          }}
        />
      )}
    </div>
  )
}

export default OrderDetailPage
