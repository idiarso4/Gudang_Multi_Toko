import React from 'react'
import { ArrowUpIcon, ArrowDownIcon } from '@heroicons/react/24/solid'
import { cn } from '@/utils/cn'

interface ReportCardProps {
  title: string
  value: string | number
  change?: number
  icon: React.ComponentType<{ className?: string }>
  color: 'blue' | 'green' | 'red' | 'purple' | 'yellow'
  subtitle?: string
}

const ReportCard: React.FC<ReportCardProps> = ({
  title,
  value,
  change,
  icon: Icon,
  color,
  subtitle
}) => {
  const colorClasses = {
    blue: 'bg-blue-500 text-blue-600',
    green: 'bg-green-500 text-green-600',
    red: 'bg-red-500 text-red-600',
    purple: 'bg-purple-500 text-purple-600',
    yellow: 'bg-yellow-500 text-yellow-600'
  }

  const hasPositiveChange = change !== undefined && change > 0
  const hasNegativeChange = change !== undefined && change < 0

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
                  {typeof value === 'number' ? value.toLocaleString('id-ID') : value}
                </div>
                {change !== undefined && (
                  <div className={cn(
                    'ml-2 flex items-baseline text-sm font-semibold',
                    hasPositiveChange ? 'text-green-600' : hasNegativeChange ? 'text-red-600' : 'text-gray-500'
                  )}>
                    {hasPositiveChange && (
                      <ArrowUpIcon className="self-center flex-shrink-0 h-4 w-4 text-green-500" />
                    )}
                    {hasNegativeChange && (
                      <ArrowDownIcon className="self-center flex-shrink-0 h-4 w-4 text-red-500" />
                    )}
                    <span className="sr-only">
                      {hasPositiveChange ? 'Increased' : hasNegativeChange ? 'Decreased' : 'No change'} by
                    </span>
                    {Math.abs(change).toFixed(1)}%
                  </div>
                )}
              </dd>
              {subtitle && (
                <dd className="text-sm text-gray-500 mt-1">
                  {subtitle}
                </dd>
              )}
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ReportCard
