import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  XMarkIcon, 
  PlusIcon,
  PencilIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

import { stockSyncApi } from '@/services/api'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import CreateSyncRuleModal from './CreateSyncRuleModal'
import { cn } from '@/utils/cn'

interface SyncRulesModalProps {
  onClose: () => void
  onRuleChange: () => void
}

const SyncRulesModal: React.FC<SyncRulesModalProps> = ({ onClose, onRuleChange }) => {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedRule, setSelectedRule] = useState<any>(null)

  const queryClient = useQueryClient()

  // Fetch sync rules
  const { data: rulesData, isLoading } = useQuery({
    queryKey: ['sync-rules-modal'],
    queryFn: () => stockSyncApi.getRules({ page: 1, limit: 100 })
  })

  // Delete rule mutation
  const deleteRuleMutation = useMutation({
    mutationFn: stockSyncApi.deleteRule,
    onSuccess: () => {
      toast.success('Aturan sync berhasil dihapus')
      queryClient.invalidateQueries(['sync-rules-modal'])
      queryClient.invalidateQueries(['sync-rules'])
      onRuleChange()
    },
    onError: (error: any) => {
      toast.error(error.message || 'Gagal menghapus aturan sync')
    }
  })

  // Toggle rule status mutation
  const toggleRuleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string, isActive: boolean }) =>
      stockSyncApi.updateRule(id, { isActive }),
    onSuccess: () => {
      toast.success('Status aturan sync berhasil diubah')
      queryClient.invalidateQueries(['sync-rules-modal'])
      queryClient.invalidateQueries(['sync-rules'])
      onRuleChange()
    },
    onError: (error: any) => {
      toast.error(error.message || 'Gagal mengubah status aturan sync')
    }
  })

  const rules = rulesData?.data?.rules || []

  const handleDeleteRule = (ruleId: string) => {
    if (confirm('Apakah Anda yakin ingin menghapus aturan sync ini?')) {
      deleteRuleMutation.mutate(ruleId)
    }
  }

  const handleToggleRule = (rule: any) => {
    toggleRuleMutation.mutate({
      id: rule.id,
      isActive: !rule.isActive
    })
  }

  const getSyncStrategyLabel = (strategy: string) => {
    const labels = {
      'EXACT_MATCH': 'Sama Persis',
      'PERCENTAGE': 'Persentase',
      'FIXED_OFFSET': 'Offset Tetap',
      'MINIMUM_THRESHOLD': 'Minimum Threshold',
      'CUSTOM_FORMULA': 'Formula Kustom'
    }
    return labels[strategy as keyof typeof labels] || strategy
  }

  const getSyncScopeLabel = (scope: string) => {
    const labels = {
      'ALL_PRODUCTS': 'Semua Produk',
      'SPECIFIC_PRODUCTS': 'Produk Tertentu',
      'CATEGORY': 'Kategori'
    }
    return labels[scope as keyof typeof labels] || scope
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
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
          {/* Header */}
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                Aturan Sinkronisasi Stok
              </h3>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="btn btn-primary btn-sm"
                >
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Tambah Aturan
                </button>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="max-h-96 overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <LoadingSpinner size="md" text="Memuat aturan sync..." />
                </div>
              ) : rules.length === 0 ? (
                <div className="text-center py-8">
                  <div className="mx-auto h-12 w-12 text-gray-400">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="mt-2 text-sm font-medium text-gray-900">
                    Belum ada aturan sync
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Buat aturan sync pertama untuk otomatisasi stok
                  </p>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="mt-4 btn btn-primary btn-sm"
                  >
                    <PlusIcon className="h-4 w-4 mr-2" />
                    Tambah Aturan
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {rules.map((rule) => (
                    <div
                      key={rule.id}
                      className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <h4 className="text-sm font-medium text-gray-900">
                              {rule.name}
                            </h4>
                            <span className={cn(
                              'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
                              rule.isActive
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            )}>
                              {rule.isActive ? (
                                <CheckCircleIcon className="h-3 w-3 mr-1" />
                              ) : (
                                <XCircleIcon className="h-3 w-3 mr-1" />
                              )}
                              {rule.isActive ? 'Aktif' : 'Nonaktif'}
                            </span>
                          </div>
                          
                          {rule.description && (
                            <p className="text-sm text-gray-500 mt-1">
                              {rule.description}
                            </p>
                          )}
                          
                          <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                            <span>
                              Strategi: {getSyncStrategyLabel(rule.syncStrategy)}
                            </span>
                            <span>•</span>
                            <span>
                              Scope: {getSyncScopeLabel(rule.syncScope)}
                            </span>
                            <span>•</span>
                            <span>
                              Target: {rule.targetMarketplaceAccounts?.length || 0} marketplace
                            </span>
                          </div>

                          {/* Strategy details */}
                          <div className="mt-2 text-xs text-gray-600">
                            {rule.syncStrategy === 'PERCENTAGE' && rule.syncPercentage && (
                              <span>Persentase: {rule.syncPercentage}%</span>
                            )}
                            {rule.syncStrategy === 'FIXED_OFFSET' && rule.syncOffset !== null && (
                              <span>Offset: {rule.syncOffset > 0 ? '+' : ''}{rule.syncOffset}</span>
                            )}
                            {rule.syncStrategy === 'MINIMUM_THRESHOLD' && rule.minimumStock && (
                              <span>Minimum: {rule.minimumStock}</span>
                            )}
                            {rule.syncStrategy === 'CUSTOM_FORMULA' && rule.customFormula && (
                              <span>Formula: {rule.customFormula}</span>
                            )}
                          </div>

                          {/* Target marketplaces */}
                          {rule.targetMarketplaceAccounts && rule.targetMarketplaceAccounts.length > 0 && (
                            <div className="mt-2">
                              <div className="flex flex-wrap gap-1">
                                {rule.targetMarketplaceAccounts.map((target: any, index: number) => (
                                  <span
                                    key={index}
                                    className="inline-flex items-center px-2 py-1 rounded text-xs bg-blue-100 text-blue-800"
                                  >
                                    {target.marketplaceAccount?.marketplace?.name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center space-x-2 ml-4">
                          <button
                            onClick={() => handleToggleRule(rule)}
                            disabled={toggleRuleMutation.isLoading}
                            className={cn(
                              'p-2 rounded-md text-sm',
                              rule.isActive
                                ? 'text-red-600 hover:bg-red-50'
                                : 'text-green-600 hover:bg-green-50'
                            )}
                            title={rule.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                          >
                            {rule.isActive ? (
                              <XCircleIcon className="h-4 w-4" />
                            ) : (
                              <CheckCircleIcon className="h-4 w-4" />
                            )}
                          </button>
                          
                          <button
                            onClick={() => {
                              setSelectedRule(rule)
                              setShowCreateModal(true)
                            }}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-md"
                            title="Edit"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          
                          <button
                            onClick={() => handleDeleteRule(rule.id)}
                            disabled={deleteRuleMutation.isLoading}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md"
                            title="Hapus"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Create/Edit Rule Modal */}
      {showCreateModal && (
        <CreateSyncRuleModal
          rule={selectedRule}
          onClose={() => {
            setShowCreateModal(false)
            setSelectedRule(null)
          }}
          onSuccess={() => {
            queryClient.invalidateQueries(['sync-rules-modal'])
            queryClient.invalidateQueries(['sync-rules'])
            onRuleChange()
            setShowCreateModal(false)
            setSelectedRule(null)
          }}
        />
      )}
    </div>
  )
}

export default SyncRulesModal
