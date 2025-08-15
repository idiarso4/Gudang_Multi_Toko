import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

import { authApi } from '@/services/api'
import { User, LoginCredentials, RegisterData } from '@/types/auth'

interface AuthContextType {
  user: User | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (credentials: LoginCredentials) => Promise<void>
  register: (data: RegisterData) => Promise<void>
  logout: () => void
  refreshToken: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()

  const isAuthenticated = !!user && !!token

  // Initialize auth state from localStorage
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const storedToken = localStorage.getItem('auth_token')
        const storedUser = localStorage.getItem('auth_user')

        if (storedToken && storedUser) {
          setToken(storedToken)
          setUser(JSON.parse(storedUser))
          
          // Verify token is still valid
          try {
            const response = await authApi.getProfile()
            setUser(response.data.user)
          } catch (error) {
            // Token is invalid, clear auth state
            localStorage.removeItem('auth_token')
            localStorage.removeItem('auth_user')
            setToken(null)
            setUser(null)
          }
        }
      } catch (error) {
        console.error('Failed to initialize auth:', error)
      } finally {
        setIsLoading(false)
      }
    }

    initializeAuth()
  }, [])

  const login = async (credentials: LoginCredentials) => {
    try {
      setIsLoading(true)
      const response = await authApi.login(credentials)
      const { user: userData, token: authToken } = response.data

      setUser(userData)
      setToken(authToken)
      
      // Store in localStorage
      localStorage.setItem('auth_token', authToken)
      localStorage.setItem('auth_user', JSON.stringify(userData))

      toast.success('Login berhasil!')
      navigate('/dashboard')
    } catch (error: any) {
      const message = error.response?.data?.message || 'Login gagal'
      toast.error(message)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  const register = async (data: RegisterData) => {
    try {
      setIsLoading(true)
      await authApi.register(data)
      
      toast.success('Registrasi berhasil! Silakan login.')
      navigate('/login')
    } catch (error: any) {
      const message = error.response?.data?.message || 'Registrasi gagal'
      toast.error(message)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  const logout = async () => {
    try {
      if (token) {
        await authApi.logout()
      }
    } catch (error) {
      console.error('Logout API call failed:', error)
    } finally {
      // Clear auth state regardless of API call result
      setUser(null)
      setToken(null)
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_user')
      
      toast.success('Logout berhasil!')
      navigate('/login')
    }
  }

  const refreshToken = async () => {
    try {
      const response = await authApi.refreshToken()
      const { token: newToken } = response.data

      setToken(newToken)
      localStorage.setItem('auth_token', newToken)
    } catch (error) {
      console.error('Token refresh failed:', error)
      logout()
      throw error
    }
  }

  const value: AuthContextType = {
    user,
    token,
    isLoading,
    isAuthenticated,
    login,
    register,
    logout,
    refreshToken,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
