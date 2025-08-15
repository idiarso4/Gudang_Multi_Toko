import React, { useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import LoadingSpinner from '@/components/ui/LoadingSpinner'
import OrderStatusBadge from './OrderStatusBadge'

const updateSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']),
  reason: z.string().min(1, 'Alasan harus diisi').max(500, 'Alasan terlalu panjang'),
  updateMarketplace: z.boolean().default(false)
})

type UpdateFormData = z.infer<typeof updateSchema>

interface OrderStatusUpdateModalProps {
  order: {
    id: string
    orderNumber: string
    status: string
    marketplaceAccount: {
      marketplace: {
        name: string
      }
    }
  }
  onClose: () => void
  onSubmit: (data: UpdateFormData) => void
  isLoading: boolean
}

const statusOptions = [
  { value: 'PENDING', label: 'Menunggu', description: 'Pesanan menunggu konfirmasi' },
  { value: 'CONFIRMED', label: 'Dikonfirmasi', description: 'Pesanan telah dikonfirmasi' },
  { value: 'PROCESSING', label: 'Diproses', description: 'Pesanan sedang diproses' },
  { value: 'SHIPPED', label: 'Dikirim', description: 'Pesanan telah dikirim' },
  { value: 'DELIVERED', label: 'Selesai', description: 'Pesanan telah diterima pelanggan' },
  { value: 'CANCELLED', label: 'Dibatalkan', description: 'Pesanan dibatalkan' },
  { value: 'REFUNDED', label: 'Dikembalikan', description: 'Pesanan dikembalikan/refund' }
]

const reasonTemplates = {
  CONFIRMED: [
    'Pesanan dikonfirmasi dan siap diproses',
    'Pembayaran telah diterima',
    'Stok tersedia dan pesanan valid'
  ],
  PROCESSING: [
    'Pesanan sedang disiapkan',
    'Produk sedang dikemas',
    'Menunggu pengambilan kurir'
  ],
  SHIPPED: [
    'Pesanan telah dikirim',
    'Paket telah diserahkan ke kurir',
    'Sedang dalam perjalanan ke tujuan'
  ],
  DELIVERED: [
    'Pesanan telah diterima pelanggan',
    'Pengiriman berhasil diselesaikan',
    'Konfirmasi penerimaan dari pelanggan'
  ],
  CANCELLED: [
    'Dibatalkan atas permintaan pelanggan',
    'Stok tidak tersedia',
    'Alamat pengiriman tidak valid',
    'Pembayaran tidak valid'
  ],
  REFUNDED: [
    'Refund atas permintaan pelanggan',
    'Produk rusak/cacat',
    'Kesalahan pengiriman',
    'Pembatalan setelah pembayaran'
  ]
}

const OrderStatusUpdateModal: React.FC<OrderStatusUpdateModalProps> = ({
  order,
  onClose,
  onSubmit,
  isLoading
}) => {
  const [selectedReason, setSelectedReason] = useState('')

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors }
  } = useForm<UpdateFormData>({
    resolver: zodResolver(updateSchema),
    defaultValues: {
      status: order.status as any,
      reason: '',
      updateMarketplace: false
    }
  })

  const watchedStatus = watch('status')
  const watchedReason = watch('reason')

  const handleFormSubmit = (data: UpdateFormData) => {
    onSubmit(data)
  }

  const handleReasonSelect = (reason: string) => {
    setValue('reason', reason)
    setSelectedReason(reason)
  }

  const currentReasonTemplates = reasonTemplates[watchedStatus as keyof typeof reasonTemplates] || []

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div 
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          {/* Header */}
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                Update Status Pesanan
              </h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {/* Order info */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-gray-900">
                    {order.orderNumber}
                  </h4>
                  <p className="text-sm text-gray-500">
                    {order.marketplaceAccount.marketplace.name}
                  </p>
                </div>
                <OrderStatusBadge status={order.status} />
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
              {/* Status selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Status Baru
                </label>
                <div className="space-y-2">
                  {statusOptions.map((option) => (
                    <label
                      key={option.value}
                      className="flex items-start space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        {...register('status')}
                        type="radio"
                        value={option.value}
                        className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300"
                      />
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-gray-900">
                            {option.label}
                          </span>
                          <OrderStatusBadge status={option.value} size="sm" />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {option.description}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
                {errors.status && (
                  <p className="mt-1 text-sm text-red-600">{errors.status.message}</p>
                )}
              </div>

              {/* Reason templates */}
              {currentReasonTemplates.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Template Alasan
                  </label>
                  <div className="space-y-1">
                    {currentReasonTemplates.map((template, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => handleReasonSelect(template)}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md border border-gray-200"
                      >
                        {template}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom reason */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Alasan Perubahan
                </label>
                <textarea
                  {...register('reason')}
                  rows={3}
                  className={`input w-full ${errors.reason ? 'input-error' : ''}`}
                  placeholder="Masukkan alasan perubahan status..."
                />
                {errors.reason && (
                  <p className="mt-1 text-sm text-red-600">{errors.reason.message}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  {watchedReason.length}/500 karakter
                </p>
              </div>

              {/* Update marketplace option */}
              <div className="flex items-center">
                <input
                  {...register('updateMarketplace')}
                  id="updateMarketplace"
                  type="checkbox"
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <label htmlFor="updateMarketplace" className="ml-2 block text-sm text-gray-900">
                  Update status di marketplace juga
                </label>
              </div>
              <p className="text-xs text-gray-500">
                Jika dicentang, status akan diperbarui di {order.marketplaceAccount.marketplace.name} juga
              </p>

              {/* Actions */}
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-outline btn-md"
                  disabled={isLoading}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-md"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    'Update Status'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

export default OrderStatusUpdateModal
