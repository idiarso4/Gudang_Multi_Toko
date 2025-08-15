import React from 'react'
import { 
  CheckCircleIcon, 
  ExclamationTriangleIcon,
  XCircleIcon,
  ArrowPathIcon,
  CloudArrowUpIcon,
  EyeIcon,
  Cog6ToothIcon
} from '@heroicons/react/24/outline'

import { cn } from '@/utils/cn'

interface MarketplaceAccount {
  id: string
  storeName: string
  isConnected: boolean
  lastSynced?: string
  marketplace: {
    name: string
    code: string
    logo?: string
  }
  _count?: {
    marketplaceProducts: number
  }
  connectionStatus?: 'ACTIVE' | 'ERROR' | 'PENDING'
}

interface MarketplaceCardProps {
  account: MarketplaceAccount
  onTestConnection: () => void
  onSyncProducts: () => void
  onViewDetails: () => void
  isTestingConnection?: boolean
  isSyncingProducts?: boolean
}

const MarketplaceCard: React.FC<MarketplaceCardProps> = ({
  account,
  onTestConnection,
  onSyncProducts,
  onViewDetails,
  isTestingConnection = false,
  isSyncingProducts = false
}) => {
  const getStatusIcon = () => {
    if (!account.isConnected) {
      return <XCircleIcon className="h-5 w-5 text-red-500" />
    }
    
    switch (account.connectionStatus) {
      case 'ACTIVE':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />
      case 'ERROR':
        return <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
      case 'PENDING':
        return <ArrowPathIcon className="h-5 w-5 text-yellow-500 animate-spin" />
      default:
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />
    }
  }

  const getStatusText = () => {
    if (!account.isConnected) {
      return 'Terputus'
    }
    
    switch (account.connectionStatus) {
      case 'ACTIVE':
        return 'Terhubung'
      case 'ERROR':
        return 'Error'
      case 'PENDING':
        return 'Menghubungkan...'
      default:
        return 'Terhubung'
    }
  }

  const getStatusColor = () => {
    if (!account.isConnected) {
      return 'text-red-600'
    }
    
    switch (account.connectionStatus) {
      case 'ACTIVE':
        return 'text-green-600'
      case 'ERROR':
        return 'text-red-600'
      case 'PENDING':
        return 'text-yellow-600'
      default:
        return 'text-green-600'
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            {account.marketplace.logo ? (
              <img
                src={account.marketplace.logo}
                alt={account.marketplace.name}
                className="h-10 w-10 object-contain"
              />
            ) : (
              <div className="h-10 w-10 bg-gray-100 rounded-lg flex items-center justify-center">
                <span className="text-lg font-bold text-gray-600">
                  {account.marketplace.name.charAt(0)}
                </span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-medium text-gray-900 truncate">
              {account.marketplace.name}
            </h3>
            <p className="text-sm text-gray-500 truncate">
              {account.storeName}
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {getStatusIcon()}
          <span className={cn('text-sm font-medium', getStatusColor())}>
            {getStatusText()}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="text-center p-3 bg-gray-50 rounded-lg">
          <div className="text-2xl font-bold text-gray-900">
            {account._count?.marketplaceProducts || 0}
          </div>
          <div className="text-xs text-gray-500">Produk Tersync</div>
        </div>
        <div className="text-center p-3 bg-gray-50 rounded-lg">
          <div className="text-sm font-medium text-gray-900">
            {account.lastSynced ? (
              new Date(account.lastSynced).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'short'
              })
            ) : (
              'Belum pernah'
            )}
          </div>
          <div className="text-xs text-gray-500">Sync Terakhir</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex space-x-2">
        <button
          onClick={onTestConnection}
          disabled={isTestingConnection}
          className="flex-1 btn btn-outline btn-sm"
        >
          {isTestingConnection ? (
            <ArrowPathIcon className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <CheckCircleIcon className="h-4 w-4 mr-2" />
          )}
          Test Koneksi
        </button>
        
        <button
          onClick={onSyncProducts}
          disabled={isSyncingProducts || !account.isConnected}
          className="flex-1 btn btn-primary btn-sm"
        >
          {isSyncingProducts ? (
            <ArrowPathIcon className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <CloudArrowUpIcon className="h-4 w-4 mr-2" />
          )}
          Sync Produk
        </button>
      </div>

      {/* Additional actions */}
      <div className="flex justify-between mt-3 pt-3 border-t border-gray-100">
        <button
          onClick={onViewDetails}
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center"
        >
          <EyeIcon className="h-4 w-4 mr-1" />
          Lihat Detail
        </button>
        
        <button
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center"
        >
          <Cog6ToothIcon className="h-4 w-4 mr-1" />
          Pengaturan
        </button>
      </div>

      {/* Connection warning */}
      {!account.isConnected && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center">
            <ExclamationTriangleIcon className="h-4 w-4 text-red-400 mr-2" />
            <span className="text-sm text-red-700">
              Koneksi terputus. Periksa kredensial API.
            </span>
          </div>
        </div>
      )}

      {/* Last sync info */}
      {account.isConnected && account.lastSynced && (
        <div className="mt-3 text-xs text-gray-500 text-center">
          Terakhir disinkronkan: {new Date(account.lastSynced).toLocaleString('id-ID')}
        </div>
      )}
    </div>
  )
}

export default MarketplaceCard
