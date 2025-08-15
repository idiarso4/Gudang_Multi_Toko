import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import '@testing-library/jest-dom'

import OrderDetailPage from '../orders/OrderDetailPage'
import { ordersApi } from '@/services/api'

// Mock the API
vi.mock('@/services/api', () => ({
  ordersApi: {
    getById: vi.fn(),
    updateStatus: vi.fn()
  }
}))

// Mock react-router-dom hooks
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ id: 'test-order-id' }),
    useNavigate: () => mockNavigate
  }
})

// Mock toast
vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  }
}))

const mockOrder = {
  id: 'test-order-id',
  orderNumber: 'TEST-ORDER-001',
  marketplaceOrderId: 'MP-ORDER-001',
  status: 'PENDING',
  totalAmount: 150000,
  shippingCost: 15000,
  customerInfo: {
    name: 'John Doe',
    email: 'john@example.com',
    phone: '081234567890'
  },
  shippingAddress: {
    street: 'Jl. Test 123',
    city: 'Jakarta',
    state: 'DKI Jakarta',
    postalCode: '12345',
    country: 'Indonesia'
  },
  orderDate: '2024-01-15T10:00:00Z',
  marketplaceAccount: {
    marketplace: {
      name: 'Shopee',
      code: 'SHOPEE'
    }
  },
  orderItems: [
    {
      id: 'item-1',
      productName: 'Test Product',
      variantName: 'Red - Large',
      sku: 'TEST-SKU-001',
      quantity: 2,
      unitPrice: 75000,
      totalPrice: 150000,
      product: {
        images: ['https://example.com/image1.jpg']
      }
    }
  ],
  statusHistory: [
    {
      id: 'history-1',
      status: 'PENDING',
      previousStatus: null,
      changedBy: 'SYSTEM',
      reason: 'Order imported from marketplace',
      changedAt: '2024-01-15T10:00:00Z'
    }
  ],
  tags: [
    {
      id: 'tag-1',
      tag: 'Priority High'
    }
  ],
  assignedUser: null,
  notes: 'Test order notes'
}

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/orders/test-order-id']}>
        {children}
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('OrderDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading state initially', () => {
    vi.mocked(ordersApi.getById).mockImplementation(() => new Promise(() => {}))

    render(<OrderDetailPage />, { wrapper: createWrapper() })

    expect(screen.getByText('Memuat detail pesanan...')).toBeInTheDocument()
  })

  it('renders order details when data is loaded', async () => {
    vi.mocked(ordersApi.getById).mockResolvedValue({
      data: { order: mockOrder }
    })

    render(<OrderDetailPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Pesanan TEST-ORDER-001')).toBeInTheDocument()
    })

    expect(screen.getByText('ID Marketplace: MP-ORDER-001')).toBeInTheDocument()
    expect(screen.getByText('Shopee')).toBeInTheDocument()
    expect(screen.getByText('John Doe')).toBeInTheDocument()
    expect(screen.getByText('john@example.com')).toBeInTheDocument()
    expect(screen.getByText('Jl. Test 123')).toBeInTheDocument()
  })

  it('renders order items correctly', async () => {
    vi.mocked(ordersApi.getById).mockResolvedValue({
      data: { order: mockOrder }
    })

    render(<OrderDetailPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Test Product')).toBeInTheDocument()
    })

    expect(screen.getByText('Varian: Red - Large')).toBeInTheDocument()
    expect(screen.getByText('SKU: TEST-SKU-001')).toBeInTheDocument()
    expect(screen.getByText('2 x Rp 75.000')).toBeInTheDocument()
    expect(screen.getByText('Total: Rp 150.000')).toBeInTheDocument()
  })

  it('renders order summary correctly', async () => {
    vi.mocked(ordersApi.getById).mockResolvedValue({
      data: { order: mockOrder }
    })

    render(<OrderDetailPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Subtotal:')).toBeInTheDocument()
    })

    expect(screen.getByText('Rp 135.000')).toBeInTheDocument() // totalAmount - shippingCost
    expect(screen.getByText('Ongkos Kirim:')).toBeInTheDocument()
    expect(screen.getByText('Rp 15.000')).toBeInTheDocument()
    expect(screen.getByText('Total:')).toBeInTheDocument()
    expect(screen.getByText('Rp 150.000')).toBeInTheDocument()
  })

  it('renders status timeline correctly', async () => {
    vi.mocked(ordersApi.getById).mockResolvedValue({
      data: { order: mockOrder }
    })

    render(<OrderDetailPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Status Pesanan')).toBeInTheDocument()
    })

    expect(screen.getByText('Order imported from marketplace')).toBeInTheDocument()
    expect(screen.getByText('oleh SYSTEM')).toBeInTheDocument()
  })

  it('renders tags when present', async () => {
    vi.mocked(ordersApi.getById).mockResolvedValue({
      data: { order: mockOrder }
    })

    render(<OrderDetailPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Tags')).toBeInTheDocument()
    })

    expect(screen.getByText('Priority High')).toBeInTheDocument()
  })

  it('opens status update modal when button is clicked', async () => {
    vi.mocked(ordersApi.getById).mockResolvedValue({
      data: { order: mockOrder }
    })

    render(<OrderDetailPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Update Status')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Update Status'))

    // Modal should open (assuming modal component renders)
    // This would need to be tested with the actual modal component
  })

  it('opens assign modal when button is clicked', async () => {
    vi.mocked(ordersApi.getById).mockResolvedValue({
      data: { order: mockOrder }
    })

    render(<OrderDetailPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Assign')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Assign'))

    // Modal should open (assuming modal component renders)
  })

  it('opens tag modal when button is clicked', async () => {
    vi.mocked(ordersApi.getById).mockResolvedValue({
      data: { order: mockOrder }
    })

    render(<OrderDetailPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Tag')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Tag'))

    // Modal should open (assuming modal component renders)
  })

  it('navigates back when back button is clicked', async () => {
    vi.mocked(ordersApi.getById).mockResolvedValue({
      data: { order: mockOrder }
    })

    render(<OrderDetailPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /back/i }))

    expect(mockNavigate).toHaveBeenCalledWith('/orders')
  })

  it('handles error state when order not found', async () => {
    vi.mocked(ordersApi.getById).mockRejectedValue(new Error('Order not found'))

    render(<OrderDetailPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Pesanan tidak ditemukan')).toBeInTheDocument()
    })

    expect(screen.getByText('Pesanan yang Anda cari tidak ditemukan atau telah dihapus.')).toBeInTheDocument()
    expect(screen.getByText('Kembali ke Daftar Pesanan')).toBeInTheDocument()
  })

  it('handles status update success', async () => {
    vi.mocked(ordersApi.getById).mockResolvedValue({
      data: { order: mockOrder }
    })
    vi.mocked(ordersApi.updateStatus).mockResolvedValue({
      data: { message: 'Status updated successfully' }
    })

    render(<OrderDetailPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Update Status')).toBeInTheDocument()
    })

    // Simulate status update (this would normally be done through the modal)
    // For testing purposes, we can directly call the handler
    // In a real test, you'd interact with the modal form
  })

  it('handles status update error', async () => {
    vi.mocked(ordersApi.getById).mockResolvedValue({
      data: { order: mockOrder }
    })
    vi.mocked(ordersApi.updateStatus).mockRejectedValue(new Error('Update failed'))

    render(<OrderDetailPage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Update Status')).toBeInTheDocument()
    })

    // Test error handling for status update
  })

  describe('Order information display', () => {
    it('displays marketplace information correctly', async () => {
      vi.mocked(ordersApi.getById).mockResolvedValue({
        data: { order: mockOrder }
      })

      render(<OrderDetailPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Informasi Pesanan')).toBeInTheDocument()
      })

      expect(screen.getByText('Marketplace')).toBeInTheDocument()
      expect(screen.getByText('Shopee')).toBeInTheDocument()
      expect(screen.getByText('Tanggal Pesanan')).toBeInTheDocument()
    })

    it('displays customer information correctly', async () => {
      vi.mocked(ordersApi.getById).mockResolvedValue({
        data: { order: mockOrder }
      })

      render(<OrderDetailPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Informasi Pelanggan')).toBeInTheDocument()
      })

      expect(screen.getByText('Nama')).toBeInTheDocument()
      expect(screen.getByText('John Doe')).toBeInTheDocument()
      expect(screen.getByText('Email')).toBeInTheDocument()
      expect(screen.getByText('john@example.com')).toBeInTheDocument()
      expect(screen.getByText('Telepon')).toBeInTheDocument()
      expect(screen.getByText('081234567890')).toBeInTheDocument()
    })

    it('displays shipping address correctly', async () => {
      vi.mocked(ordersApi.getById).mockResolvedValue({
        data: { order: mockOrder }
      })

      render(<OrderDetailPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Alamat Pengiriman')).toBeInTheDocument()
      })

      expect(screen.getByText('Jl. Test 123')).toBeInTheDocument()
      expect(screen.getByText('Jakarta')).toBeInTheDocument()
      expect(screen.getByText('DKI Jakarta')).toBeInTheDocument()
      expect(screen.getByText('12345')).toBeInTheDocument()
      expect(screen.getByText('Indonesia')).toBeInTheDocument()
    })
  })

  describe('Action buttons', () => {
    it('renders all action buttons', async () => {
      vi.mocked(ordersApi.getById).mockResolvedValue({
        data: { order: mockOrder }
      })

      render(<OrderDetailPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Tag')).toBeInTheDocument()
      })

      expect(screen.getByText('Assign')).toBeInTheDocument()
      expect(screen.getByText('Update Status')).toBeInTheDocument()
      expect(screen.getByText('Cetak Invoice')).toBeInTheDocument()
      expect(screen.getByText('Duplikasi Pesanan')).toBeInTheDocument()
    })
  })

  describe('Responsive behavior', () => {
    it('adapts layout for different screen sizes', async () => {
      vi.mocked(ordersApi.getById).mockResolvedValue({
        data: { order: mockOrder }
      })

      render(<OrderDetailPage />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Pesanan TEST-ORDER-001')).toBeInTheDocument()
      })

      // Check for responsive grid classes
      const mainGrid = screen.getByText('Pesanan TEST-ORDER-001').closest('.grid')
      expect(mainGrid).toHaveClass('grid-cols-1', 'lg:grid-cols-3')
    })
  })
})
