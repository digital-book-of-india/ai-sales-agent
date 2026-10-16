import { apiFetch } from '../lib/api'

interface SettingEnvelope<T> {
  key: string
  value: T
}

// Every system_settings key shares this one GET/PATCH shape (see
// system-settings.controller.ts) — a single generic pair covers all four
// Settings-page tabs plus lead_scoring, no per-domain endpoint needed.
export async function getSetting<T>(key: string): Promise<T> {
  const { value } = await apiFetch<SettingEnvelope<T>>(`/system-settings/${key}`)
  return value
}

export async function updateSetting<T>(key: string, value: T): Promise<T> {
  const result = await apiFetch<SettingEnvelope<T>>(`/system-settings/${key}`, {
    method: 'PATCH',
    body: JSON.stringify({ value }),
  })
  return result.value
}
