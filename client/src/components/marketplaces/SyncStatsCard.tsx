import React from 'react'
import { cn } from '@/utils/cn'

interface SyncStatsCardProps {
  title: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  color: 'blue' | 'green' | 'red' | 'purple' | 'yellow'
  trend?: {
    value: number
    isPositive: boolean
  }
}

const SyncStatsCard: React.FC<SyncStatsCardProps> = ({
  title,
  value,
  icon: Icon,
  color,
  trend
}) => {
  const colorClasses = {
    blue: 'bg-blue-500 text-blue-600',
    green: 'bg-green-500 text-green-600',
    red: 'bg-red-500 text-red-600',
    purple: 'bg-purple-500 text-purple-600',
    yellow: 'bg-yellow-500 text-yellow-600'
  }

  return (
    <div className="bg-white overflow-hidden shadow-soft rounded-lg">
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
                  {value}
                </div>
                {trend && (
                  <div className={cn(
                    'ml-2 flex items-baseline text-sm font-semibold',
                    trend.isPositive ? 'text-green-600' : 'text-red-600'
                  )}>
                    <span className="sr-only">
                      {trend.isPositive ? 'Increased' : 'Decreased'} by
                    </span>
                    {trend.isPositive ? '+' : ''}{trend.value}%
                  </div>
                )}
              </dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SyncStatsCard
