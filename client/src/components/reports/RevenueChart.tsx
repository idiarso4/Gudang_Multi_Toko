import React from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'
import { Bar } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
)

interface RevenueChartProps {
  data: Array<{
    date: string
    revenue: number
    orders: number
  }>
  height?: number
}

const RevenueChart: React.FC<RevenueChartProps> = ({ data, height = 300 }) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Tidak ada data revenue untuk ditampilkan
      </div>
    )
  }

  const chartData = {
    labels: data.map(item => 
      new Date(item.date).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short'
      })
    ),
    datasets: [
      {
        label: 'Revenue Harian',
        data: data.map(item => item.revenue),
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
      }
    ]
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            const revenue = context.parsed.y
            const dataIndex = context.dataIndex
            const orders = data[dataIndex]?.orders || 0
            
            return [
              `Revenue: Rp ${revenue.toLocaleString('id-ID')}`,
              `Pesanan: ${orders} order`
            ]
          }
        }
      }
    },
    scales: {
      x: {
        display: true,
        grid: {
          display: false
        },
        ticks: {
          maxRotation: 45,
          minRotation: 0
        }
      },
      y: {
        display: true,
        beginAtZero: true,
        ticks: {
          callback: function(value: any) {
            if (value >= 1000000) {
              return 'Rp ' + (value / 1000000).toFixed(1) + 'M'
            } else if (value >= 1000) {
              return 'Rp ' + (value / 1000).toFixed(0) + 'K'
            }
            return 'Rp ' + value.toLocaleString('id-ID')
          }
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      }
    },
    elements: {
      bar: {
        borderRadius: 4
      }
    }
  }

  return (
    <div style={{ height: `${height}px` }}>
      <Bar data={chartData} options={options} />
    </div>
  )
}

export default RevenueChart
