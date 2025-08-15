import React from 'react'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js'
import { Doughnut } from 'react-chartjs-2'

ChartJS.register(ArcElement, Tooltip, Legend)

interface MarketplaceChartProps {
  data: Array<{
    marketplaceAccountId: string
    marketplace: {
      name: string
      code: string
    }
    _sum: {
      totalAmount: number
    }
    _count: {
      id: number
    }
  }>
  height?: number
}

const MarketplaceChart: React.FC<MarketplaceChartProps> = ({ data, height = 300 }) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Tidak ada data marketplace untuk ditampilkan
      </div>
    )
  }

  // Color palette for different marketplaces
  const colors = [
    'rgba(59, 130, 246, 0.8)',   // Blue - Shopee
    'rgba(16, 185, 129, 0.8)',   // Green - Tokopedia
    'rgba(245, 158, 11, 0.8)',   // Yellow - Lazada
    'rgba(139, 92, 246, 0.8)',   // Purple - Bukalapak
    'rgba(239, 68, 68, 0.8)',    // Red - Blibli
    'rgba(236, 72, 153, 0.8)',   // Pink - JD.ID
  ]

  const borderColors = [
    'rgba(59, 130, 246, 1)',
    'rgba(16, 185, 129, 1)',
    'rgba(245, 158, 11, 1)',
    'rgba(139, 92, 246, 1)',
    'rgba(239, 68, 68, 1)',
    'rgba(236, 72, 153, 1)',
  ]

  const chartData = {
    labels: data.map(item => item.marketplace?.name || 'Unknown'),
    datasets: [
      {
        label: 'Revenue',
        data: data.map(item => item._sum?.totalAmount || 0),
        backgroundColor: colors.slice(0, data.length),
        borderColor: borderColors.slice(0, data.length),
        borderWidth: 2,
        hoverOffset: 4
      }
    ]
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          padding: 20,
          usePointStyle: true,
          font: {
            size: 12
          }
        }
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            const label = context.label || ''
            const value = context.parsed
            const dataIndex = context.dataIndex
            const orders = data[dataIndex]?._count?.id || 0
            
            const total = data.reduce((sum, item) => sum + (item._sum?.totalAmount || 0), 0)
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0'
            
            return [
              `${label}`,
              `Revenue: Rp ${value.toLocaleString('id-ID')}`,
              `Pesanan: ${orders} order`,
              `Persentase: ${percentage}%`
            ]
          }
        }
      }
    },
    cutout: '60%',
    elements: {
      arc: {
        borderWidth: 2
      }
    }
  }

  // Calculate total for center display
  const totalRevenue = data.reduce((sum, item) => sum + (item._sum?.totalAmount || 0), 0)
  const totalOrders = data.reduce((sum, item) => sum + (item._count?.id || 0), 0)

  return (
    <div className="relative" style={{ height: `${height}px` }}>
      <Doughnut data={chartData} options={options} />
      
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">
            {totalOrders}
          </div>
          <div className="text-sm text-gray-500">
            Total Pesanan
          </div>
          <div className="text-lg font-semibold text-gray-700 mt-1">
            Rp {totalRevenue.toLocaleString('id-ID')}
          </div>
        </div>
      </div>
    </div>
  )
}

export default MarketplaceChart
