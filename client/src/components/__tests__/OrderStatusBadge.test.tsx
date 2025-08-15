import React from 'react'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import OrderStatusBadge from '../orders/OrderStatusBadge'

describe('OrderStatusBadge', () => {
  it('renders PENDING status correctly', () => {
    render(<OrderStatusBadge status="PENDING" />)
    
    const badge = screen.getByText('Menunggu')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveClass('bg-yellow-100', 'text-yellow-800')
  })

  it('renders CONFIRMED status correctly', () => {
    render(<OrderStatusBadge status="CONFIRMED" />)
    
    const badge = screen.getByText('Dikonfirmasi')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveClass('bg-blue-100', 'text-blue-800')
  })

  it('renders PROCESSING status correctly', () => {
    render(<OrderStatusBadge status="PROCESSING" />)
    
    const badge = screen.getByText('Diproses')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveClass('bg-purple-100', 'text-purple-800')
  })

  it('renders SHIPPED status correctly', () => {
    render(<OrderStatusBadge status="SHIPPED" />)
    
    const badge = screen.getByText('Dikirim')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveClass('bg-indigo-100', 'text-indigo-800')
  })

  it('renders DELIVERED status correctly', () => {
    render(<OrderStatusBadge status="DELIVERED" />)
    
    const badge = screen.getByText('Selesai')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveClass('bg-green-100', 'text-green-800')
  })

  it('renders CANCELLED status correctly', () => {
    render(<OrderStatusBadge status="CANCELLED" />)
    
    const badge = screen.getByText('Dibatalkan')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveClass('bg-red-100', 'text-red-800')
  })

  it('renders REFUNDED status correctly', () => {
    render(<OrderStatusBadge status="REFUNDED" />)
    
    const badge = screen.getByText('Dikembalikan')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveClass('bg-gray-100', 'text-gray-800')
  })

  it('renders unknown status as default', () => {
    render(<OrderStatusBadge status="UNKNOWN_STATUS" />)
    
    const badge = screen.getByText('UNKNOWN_STATUS')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveClass('bg-gray-100', 'text-gray-800')
  })

  it('applies small size correctly', () => {
    render(<OrderStatusBadge status="PENDING" size="sm" />)
    
    const badge = screen.getByText('Menunggu')
    expect(badge).toHaveClass('px-2', 'py-0.5', 'text-xs')
  })

  it('applies large size correctly', () => {
    render(<OrderStatusBadge status="PENDING" size="lg" />)
    
    const badge = screen.getByText('Menunggu')
    expect(badge).toHaveClass('px-3', 'py-1', 'text-sm')
  })

  it('applies medium size by default', () => {
    render(<OrderStatusBadge status="PENDING" />)
    
    const badge = screen.getByText('Menunggu')
    expect(badge).toHaveClass('px-2.5', 'py-0.5', 'text-xs')
  })

  it('has correct accessibility attributes', () => {
    render(<OrderStatusBadge status="DELIVERED" />)
    
    const badge = screen.getByText('Selesai')
    expect(badge).toHaveAttribute('role', 'status')
    expect(badge).toHaveAttribute('aria-label', 'Status pesanan: Selesai')
  })

  it('renders with custom className', () => {
    render(<OrderStatusBadge status="PENDING" className="custom-class" />)
    
    const badge = screen.getByText('Menunggu')
    expect(badge).toHaveClass('custom-class')
  })

  describe('Status mapping', () => {
    const statusMappings = [
      { status: 'PENDING', label: 'Menunggu', color: 'yellow' },
      { status: 'CONFIRMED', label: 'Dikonfirmasi', color: 'blue' },
      { status: 'PROCESSING', label: 'Diproses', color: 'purple' },
      { status: 'SHIPPED', label: 'Dikirim', color: 'indigo' },
      { status: 'DELIVERED', label: 'Selesai', color: 'green' },
      { status: 'CANCELLED', label: 'Dibatalkan', color: 'red' },
      { status: 'REFUNDED', label: 'Dikembalikan', color: 'gray' }
    ]

    statusMappings.forEach(({ status, label, color }) => {
      it(`maps ${status} to ${label} with ${color} color`, () => {
        render(<OrderStatusBadge status={status} />)
        
        const badge = screen.getByText(label)
        expect(badge).toBeInTheDocument()
        expect(badge).toHaveClass(`bg-${color}-100`, `text-${color}-800`)
      })
    })
  })

  describe('Edge cases', () => {
    it('handles empty status', () => {
      render(<OrderStatusBadge status="" />)
      
      const badge = screen.getByRole('status')
      expect(badge).toBeInTheDocument()
      expect(badge).toHaveTextContent('')
    })

    it('handles null status', () => {
      render(<OrderStatusBadge status={null as any} />)
      
      const badge = screen.getByRole('status')
      expect(badge).toBeInTheDocument()
    })

    it('handles undefined status', () => {
      render(<OrderStatusBadge status={undefined as any} />)
      
      const badge = screen.getByRole('status')
      expect(badge).toBeInTheDocument()
    })
  })

  describe('Responsive behavior', () => {
    it('maintains consistent styling across different screen sizes', () => {
      render(<OrderStatusBadge status="DELIVERED" />)
      
      const badge = screen.getByText('Selesai')
      expect(badge).toHaveClass('inline-flex', 'items-center', 'rounded-full', 'font-medium')
    })
  })

  describe('Accessibility', () => {
    it('provides screen reader friendly content', () => {
      render(<OrderStatusBadge status="SHIPPED" />)
      
      const badge = screen.getByLabelText('Status pesanan: Dikirim')
      expect(badge).toBeInTheDocument()
    })

    it('has proper semantic role', () => {
      render(<OrderStatusBadge status="PROCESSING" />)
      
      const badge = screen.getByRole('status')
      expect(badge).toBeInTheDocument()
    })
  })
})
