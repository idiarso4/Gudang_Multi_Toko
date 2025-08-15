export interface User {
  id: string
  email: string
  fullName: string
  phone?: string
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN'
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterData {
  email: string
  password: string
  fullName: string
  phone?: string
}

export interface AuthResponse {
  message: string
  user: User
  token: string
  expiresIn: string
}

export interface RefreshTokenResponse {
  message: string
  token: string
  expiresIn: string
}
