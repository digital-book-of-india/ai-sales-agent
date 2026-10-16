import type { Role } from '../auth/types'
import type { DashboardQuery } from '../dashboard/types'

export const TEAM_ROLES: Role[] = ['ADMIN', 'SALES_MANAGER', 'SALES_EXECUTIVE']

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin',
  SALES_MANAGER: 'Sales Manager',
  SALES_EXECUTIVE: 'Sales Executive',
}

export interface TeamMemberPerformance {
  callsMade: number
  leadsConverted: number
  revenue: number
}

export interface TeamMember {
  id: string
  name: string
  email: string
  role: Role
  isActive: boolean
  createdAt: string
  performance: TeamMemberPerformance
}

// Reuses the same range shape as the Dashboard/Analytics pages so the Team
// page's performance filter behaves identically.
export type TeamQuery = DashboardQuery

export interface InviteTeamMemberInput {
  name: string
  email: string
  // Set by the inviting admin/manager, shared with the new hire out of
  // band — they can log in with it right away, min 8 characters
  // (matches ResetPasswordDto.newPassword on the backend).
  password: string
  role?: Role
}

export interface UpdateTeamMemberInput {
  name?: string
  role?: Role
}
