import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { API_URL, getAccessToken } from '../lib/api'
import type { CallEvent, CallEventName, TranscriptEvent, TranscriptMessage } from './types'

const CALL_EVENTS: CallEventName[] = [
  'call.created',
  'call.dialing',
  'call.ringing',
  'call.connected',
  'call.ended',
]

/**
 * Subscribes to the backend's read-only /calling websocket namespace and
 * hands back the most recent event of each kind, plus a connection flag.
 * The frontend never sends calling commands over this socket — only the
 * backend dialer queue drives calls; this is purely an observer.
 */
export function useCallingSocket(onEvent: (name: CallEventName, event: CallEvent) => void) {
  const [connected, setConnected] = useState(false)
  const onEventRef = useRef(onEvent)

  useEffect(() => {
    onEventRef.current = onEvent
  })

  useEffect(() => {
    const token = getAccessToken()
    const socket: Socket = io(`${API_URL}/calling`, {
      auth: token ? { token } : undefined,
      transports: ['websocket'],
    })

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))

    const handlers = CALL_EVENTS.map((name) => {
      const handler = (event: CallEvent) => onEventRef.current(name, event)
      socket.on(name, handler)
      return { name, handler }
    })

    return () => {
      handlers.forEach(({ name, handler }) => socket.off(name, handler))
      socket.disconnect()
    }
  }, [])

  return { connected }
}

/**
 * Subscribes to transcript.updated for one specific call and hands each new
 * message to onMessage as it arrives — for the Live Calls page's live
 * transcript panel. Opens its own socket connection (kept separate from
 * useCallingSocket above, which drives the queue/live-call board) so the
 * panel can mount/unmount independently as the viewer switches which call
 * they're watching. A null callId skips connecting entirely. onMessage is
 * read through a ref, same as useCallingSocket's onEvent above, so callers
 * don't need to memoize it.
 */
export function useTranscriptSocket(
  callId: string | null,
  onMessage: (message: TranscriptMessage) => void,
) {
  const onMessageRef = useRef(onMessage)

  useEffect(() => {
    onMessageRef.current = onMessage
  })

  useEffect(() => {
    if (!callId) return

    const token = getAccessToken()
    const socket: Socket = io(`${API_URL}/calling`, {
      auth: token ? { token } : undefined,
      transports: ['websocket'],
    })

    const handler = (event: TranscriptEvent) => {
      if (event.callId === callId) onMessageRef.current(event.message)
    }
    socket.on('transcript.updated', handler)

    return () => {
      socket.off('transcript.updated', handler)
      socket.disconnect()
    }
  }, [callId])
}

/**
 * Subscribes to lead.updated/lead.score.updated for one specific lead and
 * calls onChange whenever either fires for it — e.g. once the post-call
 * analysis worker (see CallAnalysisService) finishes updating the lead the
 * Lead Detail page has open, so it can refetch rather than show stale data
 * until the viewer navigates away and back. A null leadId skips connecting,
 * same as useTranscriptSocket. onChange is read through a ref so callers
 * don't need to memoize it.
 */
export function useLeadEventsSocket(leadId: string | null, onChange: () => void) {
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    if (!leadId) return

    const token = getAccessToken()
    const socket: Socket = io(`${API_URL}/calling`, {
      auth: token ? { token } : undefined,
      transports: ['websocket'],
    })

    const handler = (event: { leadId: string }) => {
      if (event.leadId === leadId) onChangeRef.current()
    }
    socket.on('lead.updated', handler)
    socket.on('lead.score.updated', handler)

    return () => {
      socket.off('lead.updated', handler)
      socket.off('lead.score.updated', handler)
      socket.disconnect()
    }
  }, [leadId])
}
