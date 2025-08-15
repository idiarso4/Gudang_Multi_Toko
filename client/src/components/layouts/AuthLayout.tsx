import React, { ReactNode } from 'react'

interface AuthLayoutProps {
  children: ReactNode
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-secondary-100">
      <div className="flex min-h-screen">
        {/* Left side - Branding */}
        <div className="hidden lg:flex lg:w-1/2 bg-primary-600 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary-600 to-primary-800" />
          <div className="relative z-10 flex flex-col justify-center px-12 text-white">
            <div className="mb-8">
              <h1 className="text-4xl font-bold mb-4">
                Marketplace Integration
              </h1>
              <p className="text-xl text-primary-100 leading-relaxed">
                Kelola semua toko online Anda dalam satu dashboard yang powerful. 
                Sinkronisasi produk, pesanan, dan inventori secara otomatis.
              </p>
            </div>
            
            <div className="space-y-6">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-primary-500 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold">Multi-Marketplace</h3>
                  <p className="text-primary-200 text-sm">Shopee, Tokopedia, Lazada, dan lainnya</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-primary-500 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold">Sinkronisasi Otomatis</h3>
                  <p className="text-primary-200 text-sm">Real-time sync produk dan inventori</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-primary-500 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold">Analytics & Reporting</h3>
                  <p className="text-primary-200 text-sm">Laporan penjualan dan performa toko</p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Decorative elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500 rounded-full opacity-20 transform translate-x-32 -translate-y-32" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary-400 rounded-full opacity-20 transform -translate-x-24 translate-y-24" />
        </div>

        {/* Right side - Auth form */}
        <div className="flex-1 flex flex-col justify-center px-6 py-12 lg:px-8">
          <div className="sm:mx-auto sm:w-full sm:max-w-md">
            <div className="lg:hidden text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Marketplace Integration
              </h1>
              <p className="text-gray-600">
                Kelola semua toko online Anda dalam satu dashboard
              </p>
            </div>
            
            <div className="bg-white py-8 px-6 shadow-soft rounded-lg sm:px-10">
              {children}
            </div>
            
            <div className="mt-8 text-center">
              <p className="text-sm text-gray-600">
                © 2024 Marketplace Integration. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AuthLayout
