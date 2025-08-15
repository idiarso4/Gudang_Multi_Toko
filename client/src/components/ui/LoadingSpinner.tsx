import React from 'react'
import { cn } from '@/utils/cn'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  text?: string
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 'md', 
  className,
  text 
}) => {
  const sizeClasses = {
    sm: 'spinner-sm',
    md: 'spinner-md', 
    lg: 'spinner-lg'
  }

  return (
    <div className={cn('flex flex-col items-center justify-center', className)}>
      <div className={cn('spinner', sizeClasses[size])} />
      {text && (
        <p className="mt-2 text-sm text-gray-600">{text}</p>
      )}
    </div>
  )
}

export default LoadingSpinner
