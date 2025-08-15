import React, { useState } from 'react'
import { 
  CheckIcon,
  XMarkIcon,
  TagIcon,
  UserIcon,
  DocumentArrowDownIcon,
  TrashIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'

import { ordersApi } from '@/services/api'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { cn } from '@/utils/cn'

interface OrderBulkActionsProps {
  selectedOrders: string[]
  onClearSelection: () => void
  onRefresh: () => void
}

const OrderBulkActions: React.FC<OrderBulkActionsProps> = ({
  selectedOrders,
  onClearSelection,
  onRefresh
}) => {
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [showTagMenu, setShowTagMenu] = useState(false)
  const [showAssignMenu, setShowAssignMenu] = useState(false)

  const queryClient = useQueryClient()

  // Bulk status update mutation
  const bulkStatusMutation = useMutation({
    mutationFn: async ({ status, reason }: { status: string, reason: string }) => {
      const promises = selectedOrders.map(orderId =>
        ordersApi.updateStatus(orderId, status, reason)
      )
      return Promise.all(promises)
    },
    onSuccess: () => {
      toast.success(`${selectedOrders.length} pesanan berhasil diperbarui`)
      queryClient.invalidateQueries(['orders'])
      onClearSelection()
      onRefresh()
    },
    onError: (error: any) => {
      toast.error(error.message || 'Gagal memperbarui pesanan')
    }
  })

  // Bulk tag mutation
  const bulkTagMutation = useMutation({
    mutationFn: async (tag: string) => {
      const promises = selectedOrders.map(orderId =>
        ordersApi.addTag(orderId, tag)
      )
      return Promise.all(promises)
    },
    onSuccess: () => {
      toast.success(`Tag berhasil ditambahkan ke ${selectedOrders.length} pesanan`)
      queryClient.invalidateQueries(['orders'])
      onClearSelection()
    },
    onError: (error: any) => {
      toast.error(error.message || 'Gagal menambahkan tag')
    }
  })

  // Bulk assign mutation
  const bulkAssignMutation = useMutation({
    mutationFn: async (userId: string) => {
      const promises = selectedOrders.map(orderId =>
        ordersApi.assignOrder(orderId, userId)
      )
      return Promise.all(promises)
    },
    onSuccess: () => {
      toast.success(`${selectedOrders.length} pesanan berhasil ditugaskan`)
      queryClient.invalidateQueries(['orders'])
      onClearSelection()
    },
    onError: (error: any) => {
      toast.error(error.message || 'Gagal menugaskan pesanan')
    }
  })

  const handleStatusUpdate = (status: string) => {
    const reason = `Bulk update to ${status}`
    bulkStatusMutation.mutate({ status, reason })
    setShowStatusMenu(false)
  }

  const handleTagAdd = (tag: string) => {
    bulkTagMutation.mutate(tag)
    setShowTagMenu(false)
  }

  const handleAssign = (userId: string) => {
    bulkAssignMutation.mutate(userId)
    setShowAssignMenu(false)
  }

  const handleExport = () => {
    // Implement export functionality
    toast.info('Fitur export akan segera tersedia')
  }

  const handleDelete = () => {
    if (confirm(`Apakah Anda yakin ingin menghapus ${selectedOrders.length} pesanan?`)) {
      // Implement delete functionality
      toast.info('Fitur hapus akan segera tersedia')
    }
  }

  const isLoading = bulkStatusMutation.isLoading || bulkTagMutation.isLoading || bulkAssignMutation.isLoading

  if (selectedOrders.length === 0) {
    return null
  }

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-40">
      <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4">
        <div className="flex items-center space-x-4">
          {/* Selection info */}
          <div className="flex items-center space-x-2">
            <CheckIcon className="h-5 w-5 text-primary-600" />
            <span className="text-sm font-medium text-gray-900">
              {selectedOrders.length} pesanan dipilih
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-2">
            {/* Status update */}
            <div className="relative">
              <button
                onClick={() => setShowStatusMenu(!showStatusMenu)}
                disabled={isLoading}
                className="btn btn-outline btn-sm"
              >
                {isLoading && bulkStatusMutation.isLoading ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <ArrowPathIcon className="h-4 w-4 mr-2" />
                )}
                Status
              </button>

              {showStatusMenu && (
                <div className="absolute bottom-full mb-2 left-0 w-48 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
                  {[
                    { value: 'CONFIRMED', label: 'Konfirmasi' },
                    { value: 'PROCESSING', label: 'Proses' },
                    { value: 'SHIPPED', label: 'Kirim' },
                    { value: 'DELIVERED', label: 'Selesai' },
                    { value: 'CANCELLED', label: 'Batal' }
                  ].map((status) => (
                    <button
                      key={status.value}
                      onClick={() => handleStatusUpdate(status.value)}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      {status.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Add tag */}
            <div className="relative">
              <button
                onClick={() => setShowTagMenu(!showTagMenu)}
                disabled={isLoading}
                className="btn btn-outline btn-sm"
              >
                {isLoading && bulkTagMutation.isLoading ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <TagIcon className="h-4 w-4 mr-2" />
                )}
                Tag
              </button>

              {showTagMenu && (
                <div className="absolute bottom-full mb-2 left-0 w-48 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
                  {[
                    'Prioritas Tinggi',
                    'Perlu Review',
                    'Komplain',
                    'VIP Customer',
                    'Promo'
                  ].map((tag) => (
                    <button
                      key={tag}
                      onClick={() => handleTagAdd(tag)}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Assign */}
            <button
              onClick={() => setShowAssignMenu(!showAssignMenu)}
              disabled={isLoading}
              className="btn btn-outline btn-sm"
            >
              {isLoading && bulkAssignMutation.isLoading ? (
                <LoadingSpinner size="sm" />
              ) : (
                <UserIcon className="h-4 w-4 mr-2" />
              )}
              Assign
            </button>

            {/* Export */}
            <button
              onClick={handleExport}
              disabled={isLoading}
              className="btn btn-outline btn-sm"
            >
              <DocumentArrowDownIcon className="h-4 w-4 mr-2" />
              Export
            </button>

            {/* Delete */}
            <button
              onClick={handleDelete}
              disabled={isLoading}
              className="btn btn-outline btn-sm text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <TrashIcon className="h-4 w-4 mr-2" />
              Hapus
            </button>
          </div>

          {/* Clear selection */}
          <button
            onClick={onClearSelection}
            className="p-1 text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default OrderBulkActions
