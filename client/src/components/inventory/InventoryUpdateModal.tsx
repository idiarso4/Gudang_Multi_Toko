import React, { useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import LoadingSpinner from '@/components/ui/LoadingSpinner'

const updateSchema = z.object({
  stockQuantity: z.number().min(0, 'Stok tidak boleh negatif'),
  minStockLevel: z.number().min(0, 'Minimum stok tidak boleh negatif'),
  reason: z.string().min(1, 'Alasan harus diisi').max(255, 'Alasan terlalu panjang')
})

type UpdateFormData = z.infer<typeof updateSchema>

interface InventoryUpdateModalProps {
  item: {
    productId: string
    variantId?: string
    stockQuantity: number
    minStockLevel: number
    product: {
      name: string
      sku: string
    }
    variant?: {
      variantName: string
      sku: string
    }
  }
  onClose: () => void
  onSubmit: (data: UpdateFormData) => void
  isLoading: boolean
}

const InventoryUpdateModal: React.FC<InventoryUpdateModalProps> = ({
  item,
  onClose,
  onSubmit,
  isLoading
}) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch
  } = useForm<UpdateFormData>({
    resolver: zodResolver(updateSchema),
    defaultValues: {
      stockQuantity: item.stockQuantity,
      minStockLevel: item.minStockLevel,
      reason: ''
    }
  })

  const currentStock = watch('stockQuantity')
  const stockDifference = currentStock - item.stockQuantity

  const handleFormSubmit = (data: UpdateFormData) => {
    onSubmit(data)
  }

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
                Update Stok Produk
              </h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {/* Product info */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-900">
                {item.product.name}
                {item.variant && (
                  <span className="text-gray-500 ml-1">
                    - {item.variant.variantName}
                  </span>
                )}
              </h4>
              <p className="text-sm text-gray-500 mt-1">
                SKU: {item.variant?.sku || item.product.sku}
              </p>
              <p className="text-sm text-gray-500">
                Stok saat ini: <span className="font-medium">{item.stockQuantity}</span>
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
              {/* Stock quantity */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Stok Baru
                </label>
                <input
                  {...register('stockQuantity', { valueAsNumber: true })}
                  type="number"
                  min="0"
                  className={`input w-full ${errors.stockQuantity ? 'input-error' : ''}`}
                  placeholder="Masukkan jumlah stok baru"
                />
                {errors.stockQuantity && (
                  <p className="mt-1 text-sm text-red-600">{errors.stockQuantity.message}</p>
                )}
                
                {/* Stock difference indicator */}
                {stockDifference !== 0 && (
                  <div className="mt-2 text-sm">
                    {stockDifference > 0 ? (
                      <span className="text-green-600">
                        +{stockDifference} (Penambahan stok)
                      </span>
                    ) : (
                      <span className="text-red-600">
                        {stockDifference} (Pengurangan stok)
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Minimum stock level */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Minimum Stok
                </label>
                <input
                  {...register('minStockLevel', { valueAsNumber: true })}
                  type="number"
                  min="0"
                  className={`input w-full ${errors.minStockLevel ? 'input-error' : ''}`}
                  placeholder="Masukkan minimum stok"
                />
                {errors.minStockLevel && (
                  <p className="mt-1 text-sm text-red-600">{errors.minStockLevel.message}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  Sistem akan memberikan peringatan jika stok di bawah nilai ini
                </p>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Alasan Perubahan
                </label>
                <select
                  {...register('reason')}
                  className={`input w-full ${errors.reason ? 'input-error' : ''}`}
                >
                  <option value="">Pilih alasan</option>
                  <option value="Restock">Restock</option>
                  <option value="Penjualan">Penjualan</option>
                  <option value="Rusak/Hilang">Rusak/Hilang</option>
                  <option value="Retur">Retur</option>
                  <option value="Koreksi Stok">Koreksi Stok</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
                {errors.reason && (
                  <p className="mt-1 text-sm text-red-600">{errors.reason.message}</p>
                )}
              </div>

              {/* Custom reason input */}
              {watch('reason') === 'Lainnya' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Alasan Lainnya
                  </label>
                  <input
                    {...register('reason')}
                    type="text"
                    className="input w-full"
                    placeholder="Masukkan alasan lainnya"
                  />
                </div>
              )}

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
                    'Update Stok'
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

export default InventoryUpdateModal
