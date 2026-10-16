export type Role = 'ADMIN' | 'SALES_MANAGER' | 'SALES_EXECUTIVE'

export interface AuthUser {
  id: string
  email: string
  role: Role
}

export interface LoginResponse {
  accessToken: string
  user: AuthUser
}
