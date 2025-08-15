import React from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

interface SalesChartProps {
  data: Array<{
    period: string
    revenue: number
    orders: number
    avgOrderValue: number
  }>
  height?: number
}

const SalesChart: React.FC<SalesChartProps> = ({ data, height = 300 }) => {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Tidak ada data untuk ditampilkan
      </div>
    )
  }

  const chartData = {
    labels: data.map(item => {
      // Format period based on the format (YYYY-MM-DD, YYYY-MM, etc.)
      const period = item.period
      if (period.includes('-') && period.length === 10) {
        // Daily format: YYYY-MM-DD
        return new Date(period).toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'short'
        })
      } else if (period.includes('-') && period.length === 7) {
        // Monthly format: YYYY-MM
        const [year, month] = period.split('-')
        return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('id-ID', {
          month: 'short',
          year: 'numeric'
        })
      } else if (period.includes('W')) {
        // Weekly format: YYYY-WWW
        return `Week ${period.split('W')[1]}`
      }
      return period
    }),
    datasets: [
      {
        label: 'Revenue (Rp)',
        data: data.map(item => item.revenue),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
        yAxisID: 'y'
      },
      {
        label: 'Jumlah Pesanan',
        data: data.map(item => item.orders),
        borderColor: 'rgb(16, 185, 129)',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: false,
        tension: 0.4,
        yAxisID: 'y1'
      }
    ]
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: false,
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        callbacks: {
          label: function(context: any) {
            let label = context.dataset.label || ''
            if (label) {
              label += ': '
            }
            if (context.datasetIndex === 0) {
              // Revenue formatting
              label += 'Rp ' + context.parsed.y.toLocaleString('id-ID')
            } else {
              // Orders formatting
              label += context.parsed.y.toLocaleString('id-ID') + ' pesanan'
            }
            return label
          }
        }
      }
    },
    interaction: {
      mode: 'nearest' as const,
      axis: 'x' as const,
      intersect: false,
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: 'Periode'
        },
        grid: {
          display: false
        }
      },
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: {
          display: true,
          text: 'Revenue (Rp)'
        },
        ticks: {
          callback: function(value: any) {
            return 'Rp ' + value.toLocaleString('id-ID')
          }
        }
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        title: {
          display: true,
          text: 'Jumlah Pesanan'
        },
        grid: {
          drawOnChartArea: false,
        },
        ticks: {
          callback: function(value: any) {
            return value.toLocaleString('id-ID')
          }
        }
      }
    }
  }

  return (
    <div style={{ height: `${height}px` }}>
      <Line data={chartData} options={options} />
    </div>
  )
}

export default SalesChart
