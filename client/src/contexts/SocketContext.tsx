import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { io, Socket } from 'socket.io-client'
import toast from 'react-hot-toast'

import { useAuth } from './AuthContext'

interface SocketContextType {
  socket: Socket | null
  isConnected: boolean
  emit: (event: string, data?: any) => void
  on: (event: string, callback: (data: any) => void) => void
  off: (event: string, callback?: (data: any) => void) => void
}

const SocketContext = createContext<SocketContextType | undefined>(undefined)

interface SocketProviderProps {
  children: ReactNode
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const { user, token } = useAuth()

  useEffect(() => {
    if (user && token) {
      // Create socket connection
      const newSocket = io(process.env.REACT_APP_SERVER_URL || 'http://localhost:3000', {
        auth: {
          token
        },
        transports: ['websocket', 'polling']
      })

      // Connection event handlers
      newSocket.on('connect', () => {
        console.log('Socket connected:', newSocket.id)
        setIsConnected(true)
        
        // Join user-specific room
        newSocket.emit('join-room', user.id)
      })

      newSocket.on('disconnect', () => {
        console.log('Socket disconnected')
        setIsConnected(false)
      })

      newSocket.on('connect_error', (error) => {
        console.error('Socket connection error:', error)
        setIsConnected(false)
      })

      // Application-specific event handlers
      newSocket.on('sync-completed', (data) => {
        toast.success(`Sinkronisasi ${data.type} selesai: ${data.successCount} berhasil, ${data.failureCount} gagal`)
      })

      newSocket.on('sync-failed', (data) => {
        toast.error(`Sinkronisasi ${data.type} gagal: ${data.message}`)
      })

      newSocket.on('low-stock-alert', (data) => {
        toast.error(`Stok rendah: ${data.productName} (${data.currentStock} tersisa)`)
      })

      newSocket.on('order-received', (data) => {
        toast.success(`Pesanan baru diterima: ${data.orderNumber} dari ${data.marketplace}`)
      })

      newSocket.on('inventory-updated', (data) => {
        toast.info(`Stok ${data.productName} diperbarui: ${data.newStock}`)
      })

      setSocket(newSocket)

      // Cleanup on unmount
      return () => {
        newSocket.close()
        setSocket(null)
        setIsConnected(false)
      }
    } else {
      // Disconnect socket if user is not authenticated
      if (socket) {
        socket.close()
        setSocket(null)
        setIsConnected(false)
      }
    }
  }, [user, token])

  const emit = (event: string, data?: any) => {
    if (socket && isConnected) {
      socket.emit(event, data)
    }
  }

  const on = (event: string, callback: (data: any) => void) => {
    if (socket) {
      socket.on(event, callback)
    }
  }

  const off = (event: string, callback?: (data: any) => void) => {
    if (socket) {
      if (callback) {
        socket.off(event, callback)
      } else {
        socket.off(event)
      }
    }
  }

  const value: SocketContextType = {
    socket,
    isConnected,
    emit,
    on,
    off
  }

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  )
}

export const useSocket = (): SocketContextType => {
  const context = useContext(SocketContext)
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider')
  }
  return context
}
