import { useEffect, useState } from 'react'
import { getTranscriptForCall } from './api'
import { useTranscriptSocket } from './socket'
import { TranscriptMessages } from './TranscriptMessages'
import type { CallingQueueItem, TranscriptMessage } from './types'
import { ApiError } from '../lib/api'

// Only a CONNECTED call has the AI voice pipeline (or a bridged manual
// call's audio) actually running — dialing/ringing calls have no
// transcript yet.
function withTranscript(
  liveCalls: CallingQueueItem[],
): (CallingQueueItem & { callId: string })[] {
  return liveCalls.filter(
    (call): call is CallingQueueItem & { callId: string } =>
      call.callId !== null && call.status === 'CONNECTED',
  )
}

/** Loads and live-updates the transcript for one connected call. Mounted
 * with `key={call.callId}` by the panel below so switching calls remounts
 * it fresh instead of needing to manually reset state on every prop
 * change. */
function ConnectedCallTranscript({
  call,
}: {
  call: CallingQueueItem & { callId: string }
}) {
  const [messages, setMessages] = useState<TranscriptMessage[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getTranscriptForCall(call.callId)
      .then((transcript) => setMessages(transcript?.messages ?? []))
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Failed to load the transcript')
      })
  }, [call.callId])

  const handleMessage = (message: TranscriptMessage) => {
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]))
  }
  useTranscriptSocket(call.callId, handleMessage)

  return (
    <>
      {error && (
        <p role="alert" className="mb-3 text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <p className="mb-3 text-xs text-muted">
        {call.lead.name} · {call.campaign.name}
      </p>
      <TranscriptMessages messages={messages} emptyText="Waiting for the conversation to start…" />
    </>
  )
}

/**
 * Lets the viewer watch one connected call's transcript build up live,
 * speaker-labeled and auto-scrolling.
 */
export function LiveTranscriptPanel({ liveCalls }: { liveCalls: CallingQueueItem[] }) {
  const candidates = withTranscript(liveCalls)

  // The viewer's explicit pick, if it's still a live candidate; otherwise
  // fall back to the first connected call. Deriving this at render time
  // (rather than syncing it via an effect) means a call dropping off the
  // live board reselects on its own, with no reset step to remember.
  const [manualSelection, setManualSelection] = useState<string | null>(null)
  const selectedCallId =
    manualSelection && candidates.some((c) => c.callId === manualSelection)
      ? manualSelection
      : (candidates[0]?.callId ?? null)
  const selectedCall = candidates.find((c) => c.callId === selectedCallId)

  return (
    <div className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-ink">Live transcript</h2>
        {candidates.length > 1 && (
          <>
            <label htmlFor="live-transcript-call" className="sr-only">
              Select a live call
            </label>
            <select
              id="live-transcript-call"
              className="input-field w-auto"
              value={selectedCallId ?? ''}
              onChange={(e) => setManualSelection(e.target.value || null)}
            >
              {candidates.map((c) => (
                <option key={c.callId} value={c.callId}>
                  {c.lead.name}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {!selectedCall ? (
        <p className="text-sm text-muted">No connected calls to show a transcript for.</p>
      ) : (
        <ConnectedCallTranscript key={selectedCall.callId} call={selectedCall} />
      )}
    </div>
  )
}
