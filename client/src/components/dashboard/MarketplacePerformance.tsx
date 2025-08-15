import React from 'react'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { Doughnut } from 'react-chartjs-2'

ChartJS.register(ArcElement, Tooltip, Legend)

interface MarketplaceData {
  marketplaceAccountId: string
  _count: { _all: number }
  _sum: { totalAmount: number }
  marketplace?: {
    name: string
    code: string
  }
}

interface MarketplacePerformanceProps {
  data: MarketplaceData[]
}

const MarketplacePerformance: React.FC<MarketplacePerformanceProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Belum ada data penjualan</p>
      </div>
    )
  }

  // Prepare chart data
  const chartData = {
    labels: data.map(item => item.marketplace?.name || 'Unknown'),
    datasets: [
      {
        data: data.map(item => item._sum?.totalAmount || 0),
        backgroundColor: [
          '#3B82F6', // Blue
          '#10B981', // Green
          '#F59E0B', // Yellow
          '#EF4444', // Red
          '#8B5CF6', // Purple
          '#06B6D4', // Cyan
          '#84CC16', // Lime
          '#F97316', // Orange
        ],
        borderColor: [
          '#2563EB',
          '#059669',
          '#D97706',
          '#DC2626',
          '#7C3AED',
          '#0891B2',
          '#65A30D',
          '#EA580C',
        ],
        borderWidth: 2,
      },
    ],
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
        },
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            const label = context.label || ''
            const value = context.parsed || 0
            const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0)
            const percentage = ((value / total) * 100).toFixed(1)
            return `${label}: Rp ${value.toLocaleString('id-ID')} (${percentage}%)`
          }
        }
      }
    },
  }

  const totalRevenue = data.reduce((sum, item) => sum + (item._sum?.totalAmount || 0), 0)
  const totalOrders = data.reduce((sum, item) => sum + (item._count?._all || 0), 0)

  return (
    <div>
      <div className="h-64 mb-6">
        <Doughnut data={chartData} options={options} />
      </div>
      
      <div className="space-y-3">
        {data.map((item, index) => {
          const revenue = item._sum?.totalAmount || 0
          const orders = item._count?._all || 0
          const percentage = totalRevenue > 0 ? ((revenue / totalRevenue) * 100).toFixed(1) : '0'
          
          return (
            <div key={item.marketplaceAccountId} className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div 
                  className="w-3 h-3 rounded-full"
                  style={{ 
                    backgroundColor: chartData.datasets[0].backgroundColor[index % chartData.datasets[0].backgroundColor.length] 
                  }}
                />
                <span className="text-sm font-medium text-gray-900">
                  {item.marketplace?.name || 'Unknown'}
                </span>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  {percentage}%
                </p>
                <p className="text-xs text-gray-500">
                  {orders} pesanan
                </p>
              </div>
            </div>
          )
        })}
      </div>
      
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Total Pendapatan:</span>
          <span className="font-medium text-gray-900">
            Rp {totalRevenue.toLocaleString('id-ID')}
          </span>
        </div>
        <div className="flex justify-between text-sm mt-1">
          <span className="text-gray-500">Total Pesanan:</span>
          <span className="font-medium text-gray-900">
            {totalOrders.toLocaleString('id-ID')}
          </span>
        </div>
      </div>
    </div>
  )
}

export default MarketplacePerformance
