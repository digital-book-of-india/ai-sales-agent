import { useSyncExternalStore } from 'react'
import { Web } from 'sip.js'
import { getSipCredentials } from '../users/api'

export type SoftphoneStatus = 'idle' | 'connecting' | 'registered' | 'error'
export type SoftphoneCallStatus = 'idle' | 'ringing' | 'connected' | 'ended'

export interface SoftphoneSnapshot {
  status: SoftphoneStatus
  callStatus: SoftphoneCallStatus
  error: string | null
}

type Listener = () => void

const IDLE_SNAPSHOT: SoftphoneSnapshot = {
  status: 'idle',
  callStatus: 'idle',
  error: null,
}

/**
 * One SIP.js `SimpleUser` shared by the whole app — a sales rep has exactly
 * one softphone extension (User.sipExtension/sipPassword), so every "Call"
 * button (leads list rows, lead detail page) drives the same WebRTC
 * registration rather than each spinning up its own. Created lazily —
 * `ensureRegistered()` is only called from a click handler (see
 * CallButton), never on page load, so pages that never place a call never
 * touch the microphone or open a WebSocket. Module-level singleton, same
 * "plain listener set" pattern as `lib/toast.ts`.
 */
class SoftphoneClient {
  private snapshot: SoftphoneSnapshot = IDLE_SNAPSHOT
  private listeners = new Set<Listener>()
  private user: InstanceType<typeof Web.SimpleUser> | null = null
  private connectPromise: Promise<void> | null = null
  private remoteAudio: HTMLAudioElement | null = null

  getSnapshot = (): SoftphoneSnapshot => this.snapshot

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private setSnapshot(patch: Partial<SoftphoneSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    this.listeners.forEach((listener) => listener())
  }

  /** Requests mic permission, then registers to the rep's SIP extension if
   * not already connected. Safe to call repeatedly — a second call while
   * already registered resolves immediately; a second call while still
   * connecting awaits the same in-flight attempt instead of racing it. */
  async ensureRegistered(): Promise<void> {
    if (this.snapshot.status === 'registered') return
    this.connectPromise ??= this.connect().finally(() => {
      this.connectPromise = null
    })
    return this.connectPromise
  }

  private async connect(): Promise<void> {
    this.setSnapshot({ status: 'connecting', error: null })

    try {
      // Fails fast on mic permission before opening any SIP connection —
      // CallButton surfaces this rejection directly to the rep.
      await navigator.mediaDevices.getUserMedia({ audio: true })

      const credentials = await getSipCredentials()
      if (credentials.wsServers.length === 0) {
        throw new Error(
          'No softphone server is configured for this environment yet',
        )
      }

      if (!this.remoteAudio && typeof document !== 'undefined') {
        this.remoteAudio = document.createElement('audio')
        this.remoteAudio.autoplay = true
      }

      const user = new Web.SimpleUser(credentials.wsServers[0], {
        aor: credentials.uri,
        media: {
          constraints: { audio: true, video: false },
          remote: this.remoteAudio ? { audio: this.remoteAudio } : undefined,
        },
        userAgentOptions: {
          authorizationUsername: credentials.extension,
          authorizationPassword: credentials.password,
        },
        delegate: {
          onCallReceived: () => {
            this.setSnapshot({ callStatus: 'ringing' })
            // The rep already committed to this call by clicking "Call" on
            // a lead — Asterisk only rings this extension because of that
            // click (or a MANUAL AI-dialer call assigned to them), so
            // auto-answer instead of showing a second "accept" prompt.
            user.answer().catch(() => this.setSnapshot({ callStatus: 'ended' }))
          },
          onCallAnswered: () => this.setSnapshot({ callStatus: 'connected' }),
          onCallHangup: () => this.setSnapshot({ callStatus: 'ended' }),
          onServerDisconnect: (error) => {
            this.setSnapshot({
              status: 'error',
              error: error?.message ?? 'Softphone disconnected',
            })
          },
        },
      })

      await user.connect()
      await user.register()

      this.user = user
      this.setSnapshot({ status: 'registered' })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to connect the softphone'
      this.setSnapshot({ status: 'error', error: message })
      throw err
    }
  }

  /** Ends the rep's own leg. See extensions.conf's [internal-ring]: hanging
   * up this leg unwinds the Dial() the PSTN leg is bridged through, ending
   * the whole call — same effect as hanging up a desk phone. */
  hangup(): void {
    if (!this.user) return
    this.user.hangup().catch(() => {})
  }

  /** Clears a stale 'ended'/'ringing' status before starting a new call, so
   * the next call's UI doesn't briefly show the previous call's outcome. */
  resetCallStatus(): void {
    this.setSnapshot({ callStatus: 'idle' })
  }
}

export const softphone = new SoftphoneClient()

export function useSoftphone(): SoftphoneSnapshot {
  return useSyncExternalStore(
    softphone.subscribe,
    softphone.getSnapshot,
    softphone.getSnapshot,
  )
}
