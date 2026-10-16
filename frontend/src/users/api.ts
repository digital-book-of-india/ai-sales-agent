import { apiFetch } from '../lib/api'
import type { Role } from '../auth/types'

export interface BasicUser {
  id: string
  name: string
  email: string
  role: Role
}

export function listUsers() {
  return apiFetch<BasicUser[]>('/users')
}

export interface SipCredentials {
  extension: string
  password: string
  /** e.g. "sip:1001@pbx.example.com" — what the softphone registers as. */
  uri: string
  /** Empty when the backend has no ASTERISK_WSS_URI configured — treat as
   * "softphone unavailable in this environment", not an error. */
  wsServers: string[]
}

export function getSipCredentials() {
  return apiFetch<SipCredentials>('/users/me/sip-credentials')
}
