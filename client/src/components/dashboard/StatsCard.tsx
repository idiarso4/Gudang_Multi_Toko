import React from 'react'
import { ArrowUpIcon, ArrowDownIcon } from '@heroicons/react/24/solid'
import { cn } from '@/utils/cn'

interface StatsCardProps {
  title: string
  value: number
  previousValue?: number
  growth?: number
  icon: React.ComponentType<{ className?: string }>
  color: 'blue' | 'green' | 'purple' | 'red' | 'yellow'
  format?: 'number' | 'currency' | 'percentage'
  alert?: boolean
}

const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  previousValue,
  growth,
  icon: Icon,
  color,
  format = 'number',
  alert = false
}) => {
  const colorClasses = {
    blue: 'bg-blue-500 text-blue-600',
    green: 'bg-green-500 text-green-600',
    purple: 'bg-purple-500 text-purple-600',
    red: 'bg-red-500 text-red-600',
    yellow: 'bg-yellow-500 text-yellow-600'
  }

  const formatValue = (val: number) => {
    switch (format) {
      case 'currency':
        return `Rp ${val.toLocaleString('id-ID')}`
      case 'percentage':
        return `${val.toFixed(1)}%`
      default:
        return val.toLocaleString('id-ID')
    }
  }

  const isPositiveGrowth = growth && growth > 0
  const isNegativeGrowth = growth && growth < 0

  return (
    <div className={cn(
      'bg-white overflow-hidden shadow-soft rounded-lg',
      alert && 'ring-2 ring-red-200'
    )}>
      <div className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className={cn(
              'w-8 h-8 rounded-md flex items-center justify-center',
              colorClasses[color].split(' ')[0],
              'bg-opacity-10'
            )}>
              <Icon className={cn('w-5 h-5', colorClasses[color].split(' ')[1])} />
            </div>
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 truncate">
                {title}
              </dt>
              <dd className="flex items-baseline">
                <div className="text-2xl font-semibold text-gray-900">
                  {formatValue(value)}
                </div>
                {growth !== undefined && (
                  <div className={cn(
                    'ml-2 flex items-baseline text-sm font-semibold',
                    isPositiveGrowth ? 'text-green-600' : isNegativeGrowth ? 'text-red-600' : 'text-gray-500'
                  )}>
                    {isPositiveGrowth && <ArrowUpIcon className="w-3 h-3 mr-0.5 flex-shrink-0" />}
                    {isNegativeGrowth && <ArrowDownIcon className="w-3 h-3 mr-0.5 flex-shrink-0" />}
                    {Math.abs(growth).toFixed(1)}%
                  </div>
                )}
              </dd>
            </dl>
          </div>
        </div>
        
        {previousValue !== undefined && (
          <div className="mt-3 text-xs text-gray-500">
            Periode sebelumnya: {formatValue(previousValue)}
          </div>
        )}
        
        {alert && (
          <div className="mt-2 text-xs text-red-600 font-medium">
            Perlu perhatian!
          </div>
        )}
      </div>
    </div>
  )
}

export default StatsCard
