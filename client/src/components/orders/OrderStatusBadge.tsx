import React from 'react'
import { cn } from '@/utils/cn'

interface OrderStatusBadgeProps {
  status: string
  size?: 'sm' | 'md' | 'lg'
}

const statusConfig = {
  PENDING: {
    label: 'Menunggu',
    color: 'bg-yellow-100 text-yellow-800',
    icon: '⏳'
  },
  CONFIRMED: {
    label: 'Dikonfirmasi',
    color: 'bg-blue-100 text-blue-800',
    icon: '✓'
  },
  PROCESSING: {
    label: 'Diproses',
    color: 'bg-purple-100 text-purple-800',
    icon: '⚙️'
  },
  SHIPPED: {
    label: 'Dikirim',
    color: 'bg-indigo-100 text-indigo-800',
    icon: '🚚'
  },
  DELIVERED: {
    label: 'Selesai',
    color: 'bg-green-100 text-green-800',
    icon: '✅'
  },
  CANCELLED: {
    label: 'Dibatalkan',
    color: 'bg-red-100 text-red-800',
    icon: '❌'
  },
  REFUNDED: {
    label: 'Dikembalikan',
    color: 'bg-gray-100 text-gray-800',
    icon: '↩️'
  }
}

const OrderStatusBadge: React.FC<OrderStatusBadgeProps> = ({ 
  status, 
  size = 'md' 
}) => {
  const config = statusConfig[status as keyof typeof statusConfig] || {
    label: status,
    color: 'bg-gray-100 text-gray-800',
    icon: '❓'
  }

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-2.5 py-0.5 text-sm',
    lg: 'px-3 py-1 text-sm'
  }

  return (
    <span className={cn(
      'inline-flex items-center rounded-full font-medium',
      config.color,
      sizeClasses[size]
    )}>
      <span className="mr-1">{config.icon}</span>
      {config.label}
    </span>
  )
}

export default OrderStatusBadge
