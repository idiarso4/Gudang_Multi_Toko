import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  PlusIcon, 
  Cog6ToothIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  LinkIcon,
  EyeIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

import { marketplacesApi, stockSyncApi } from '@/services/api'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import MarketplaceCard from '@/components/marketplaces/MarketplaceCard'
import ConnectMarketplaceModal from '@/components/marketplaces/ConnectMarketplaceModal'
import SyncRulesModal from '@/components/marketplaces/SyncRulesModal'
import SyncStatsCard from '@/components/marketplaces/SyncStatsCard'
import { cn } from '@/utils/cn'

const MarketplacesPage: React.FC = () => {
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [showSyncRulesModal, setShowSyncRulesModal] = useState(false)
  const [selectedMarketplace, setSelectedMarketplace] = useState<any>(null)

  const queryClient = useQueryClient()

  // Fetch marketplace accounts
  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['marketplace-accounts'],
    queryFn: marketplacesApi.getAccounts
  })

  // Fetch available marketplaces
  const { data: marketplacesData, isLoading: marketplacesLoading } = useQuery({
    queryKey: ['available-marketplaces'],
    queryFn: marketplacesApi.getAvailable
  })

  // Fetch sync rules
  const { data: syncRulesData, isLoading: syncRulesLoading } = useQuery({
    queryKey: ['sync-rules'],
    queryFn: () => stockSyncApi.getRules({ page: 1, limit: 100 })
  })

  // Fetch sync stats
  const { data: syncStatsData } = useQuery({
    queryKey: ['sync-stats'],
    queryFn: () => stockSyncApi.getStats('24h'),
    refetchInterval: 30 * 1000 // Refetch every 30 seconds
  })

  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: marketplacesApi.testConnection,
    onSuccess: (data, accountId) => {
      if (data.success) {
        toast.success('Koneksi berhasil!')
      } else {
        toast.error(`Koneksi gagal: ${data.message}`)
      }
      queryClient.invalidateQueries(['marketplace-accounts'])
    },
    onError: (error: any) => {
      toast.error(error.message || 'Gagal menguji koneksi')
    }
  })

  // Sync products mutation
  const syncProductsMutation = useMutation({
    mutationFn: ({ accountId, productIds }: { accountId: string, productIds: string[] }) =>
      marketplacesApi.syncProducts(accountId, productIds),
    onSuccess: () => {
      toast.success('Sinkronisasi produk dimulai')
      queryClient.invalidateQueries(['sync-logs'])
    },
    onError: (error: any) => {
      toast.error(error.message || 'Gagal memulai sinkronisasi')
    }
  })

  const accounts = accountsData?.data?.accounts || []
  const availableMarketplaces = marketplacesData?.data?.marketplaces || []
  const syncRules = syncRulesData?.data?.rules || []
  const syncStats = syncStatsData?.data?.stats

  const connectedAccounts = accounts.filter(account => account.isConnected)
  const disconnectedAccounts = accounts.filter(account => !account.isConnected)

  const handleConnectMarketplace = (marketplace: any) => {
    setSelectedMarketplace(marketplace)
    setShowConnectModal(true)
  }

  const handleTestConnection = (accountId: string) => {
    testConnectionMutation.mutate(accountId)
  }

  const handleSyncProducts = (accountId: string) => {
    // For now, sync all products - in real app, let user select
    syncProductsMutation.mutate({ accountId, productIds: [] })
  }

  const handleManageSyncRules = () => {
    setShowSyncRulesModal(true)
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Marketplace</h1>
          <p className="mt-1 text-sm text-gray-600">
            Kelola koneksi marketplace dan aturan sinkronisasi
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex space-x-3">
          <button
            onClick={handleManageSyncRules}
            className="btn btn-outline btn-md"
          >
            <Cog6ToothIcon className="h-5 w-5 mr-2" />
            Aturan Sync
          </button>
          <button
            onClick={() => setShowConnectModal(true)}
            className="btn btn-primary btn-md"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            Hubungkan Marketplace
          </button>
        </div>
      </div>

      {/* Sync Statistics */}
      {syncStats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SyncStatsCard
            title="Total Sync (24h)"
            value={syncStats.totalSyncs}
            icon={ArrowPathIcon}
            color="blue"
          />
          <SyncStatsCard
            title="Berhasil"
            value={syncStats.successfulSyncs}
            icon={CheckCircleIcon}
            color="green"
          />
          <SyncStatsCard
            title="Gagal"
            value={syncStats.failedSyncs}
            icon={XCircleIcon}
            color="red"
          />
          <SyncStatsCard
            title="Success Rate"
            value={`${syncStats.successRate}%`}
            icon={CheckCircleIcon}
            color="purple"
          />
        </div>
      )}

      {/* Connected Marketplaces */}
      <div className="bg-white rounded-lg shadow-soft p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-medium text-gray-900">
            Marketplace Terhubung ({connectedAccounts.length})
          </h2>
          {connectedAccounts.length > 0 && (
            <button
              onClick={() => queryClient.invalidateQueries(['marketplace-accounts'])}
              className="btn btn-outline btn-sm"
            >
              <ArrowPathIcon className="h-4 w-4 mr-2" />
              Refresh
            </button>
          )}
        </div>

        {accountsLoading ? (
          <div className="flex items-center justify-center h-32">
            <LoadingSpinner size="md" text="Memuat marketplace..." />
          </div>
        ) : connectedAccounts.length === 0 ? (
          <div className="text-center py-8">
            <LinkIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">
              Belum ada marketplace terhubung
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Hubungkan marketplace pertama Anda untuk mulai berjualan
            </p>
            <button
              onClick={() => setShowConnectModal(true)}
              className="mt-4 btn btn-primary btn-md"
            >
              <PlusIcon className="h-5 w-5 mr-2" />
              Hubungkan Marketplace
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {connectedAccounts.map((account) => (
              <MarketplaceCard
                key={account.id}
                account={account}
                onTestConnection={() => handleTestConnection(account.id)}
                onSyncProducts={() => handleSyncProducts(account.id)}
                onViewDetails={() => {/* Navigate to account details */}}
                isTestingConnection={testConnectionMutation.isLoading}
                isSyncingProducts={syncProductsMutation.isLoading}
              />
            ))}
          </div>
        )}
      </div>

      {/* Available Marketplaces */}
      <div className="bg-white rounded-lg shadow-soft p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-6">
          Marketplace Tersedia
        </h2>

        {marketplacesLoading ? (
          <div className="flex items-center justify-center h-32">
            <LoadingSpinner size="md" text="Memuat marketplace..." />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {availableMarketplaces.map((marketplace) => {
              const isConnected = connectedAccounts.some(
                account => account.marketplace.code === marketplace.code
              )

              return (
                <div
                  key={marketplace.id}
                  className={cn(
                    'relative rounded-lg border-2 border-dashed p-6 hover:border-gray-400 transition-colors',
                    isConnected ? 'border-green-300 bg-green-50' : 'border-gray-300'
                  )}
                >
                  <div className="text-center">
                    <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-lg bg-gray-100">
                      {marketplace.logo ? (
                        <img
                          src={marketplace.logo}
                          alt={marketplace.name}
                          className="h-8 w-8 object-contain"
                        />
                      ) : (
                        <span className="text-lg font-bold text-gray-600">
                          {marketplace.name.charAt(0)}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-2 text-sm font-medium text-gray-900">
                      {marketplace.name}
                    </h3>
                    <p className="mt-1 text-xs text-gray-500">
                      {marketplace.description}
                    </p>
                    
                    {isConnected ? (
                      <div className="mt-3">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          <CheckCircleIcon className="h-3 w-3 mr-1" />
                          Terhubung
                        </span>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleConnectMarketplace(marketplace)}
                        className="mt-3 btn btn-outline btn-sm w-full"
                      >
                        Hubungkan
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Sync Rules Summary */}
      {syncRules.length > 0 && (
        <div className="bg-white rounded-lg shadow-soft p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-gray-900">
              Aturan Sinkronisasi ({syncRules.length})
            </h2>
            <button
              onClick={handleManageSyncRules}
              className="btn btn-outline btn-sm"
            >
              <EyeIcon className="h-4 w-4 mr-2" />
              Lihat Semua
            </button>
          </div>

          <div className="space-y-3">
            {syncRules.slice(0, 3).map((rule) => (
              <div
                key={rule.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-gray-900">
                    {rule.name}
                  </h4>
                  <p className="text-xs text-gray-500 mt-1">
                    {rule.syncStrategy} • {rule.syncScope}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={cn(
                    'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
                    rule.isActive
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  )}>
                    {rule.isActive ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>
              </div>
            ))}
            
            {syncRules.length > 3 && (
              <div className="text-center pt-2">
                <button
                  onClick={handleManageSyncRules}
                  className="text-sm text-primary-600 hover:text-primary-500"
                >
                  +{syncRules.length - 3} aturan lainnya
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {showConnectModal && (
        <ConnectMarketplaceModal
          marketplace={selectedMarketplace}
          onClose={() => {
            setShowConnectModal(false)
            setSelectedMarketplace(null)
          }}
          onSuccess={() => {
            queryClient.invalidateQueries(['marketplace-accounts'])
            setShowConnectModal(false)
            setSelectedMarketplace(null)
          }}
        />
      )}

      {showSyncRulesModal && (
        <SyncRulesModal
          onClose={() => setShowSyncRulesModal(false)}
          onRuleChange={() => {
            queryClient.invalidateQueries(['sync-rules'])
          }}
        />
      )}
    </div>
  )
}

export default MarketplacesPage
