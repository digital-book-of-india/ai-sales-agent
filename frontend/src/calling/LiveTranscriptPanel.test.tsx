import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveTranscriptPanel } from './LiveTranscriptPanel'
import type { CallingQueueItem, TranscriptMessage } from './types'

const mocks = vi.hoisted(() => {
  let onMessage: ((message: TranscriptMessage) => void) | null = null
  return {
    getTranscriptForCall: vi.fn(),
    getOnMessage: () => onMessage,
    setOnMessage: (next: typeof onMessage) => {
      onMessage = next
    },
    lastCallId: null as string | null,
  }
})

vi.mock('./api', () => ({
  getTranscriptForCall: mocks.getTranscriptForCall,
}))

vi.mock('./socket', () => ({
  useTranscriptSocket: (
    callId: string | null,
    onMessage: (message: TranscriptMessage) => void,
  ) => {
    mocks.lastCallId = callId
    mocks.setOnMessage(onMessage)
    return { connected: true }
  },
}))

function emitMessage(message: TranscriptMessage) {
  act(() => {
    mocks.getOnMessage()?.(message)
  })
}

function liveCall(overrides: Partial<CallingQueueItem> = {}): CallingQueueItem {
  return {
    id: 'queue-1',
    leadId: 'lead-1',
    campaignId: 'campaign-1',
    priority: 0,
    status: 'CONNECTED',
    attempts: 1,
    maxAttempts: 3,
    scheduledAt: '2026-08-26T00:00:00.000Z',
    nextRetryAt: null,
    lastAttemptAt: '2026-08-26T00:00:00.000Z',
    callId: 'call-1',
    createdAt: '2026-08-26T00:00:00.000Z',
    updatedAt: '2026-08-26T00:00:00.000Z',
    lead: { id: 'lead-1', name: 'Asha Verma', phone: '9998887777', companyName: null },
    campaign: { id: 'campaign-1', name: 'Diwali Outreach' },
    ...overrides,
  }
}

const aiMessage: TranscriptMessage = {
  id: 'msg-1',
  speaker: 'AI',
  text: 'Hi, this is Riya calling from Acme.',
  timestamp: '2026-08-26T10:00:01.000Z',
  confidence: null,
}

describe('LiveTranscriptPanel', () => {
  beforeEach(() => {
    mocks.getTranscriptForCall.mockReset().mockResolvedValue(null)
    mocks.setOnMessage(null)
    mocks.lastCallId = null
  })

  it('shows a fallback message when no calls are connected', () => {
    render(<LiveTranscriptPanel liveCalls={[liveCall({ status: 'RINGING' })]} />)

    expect(
      screen.getByText('No connected calls to show a transcript for.'),
    ).toBeInTheDocument()
    expect(mocks.getTranscriptForCall).not.toHaveBeenCalled()
  })

  it('loads and renders the transcript for the first connected call', async () => {
    mocks.getTranscriptForCall.mockResolvedValue({
      id: 'transcript-1',
      callId: 'call-1',
      finalizedAt: null,
      createdAt: '2026-08-26T10:00:00.000Z',
      messages: [aiMessage],
    })

    render(<LiveTranscriptPanel liveCalls={[liveCall()]} />)

    expect(
      await screen.findByText('Hi, this is Riya calling from Acme.'),
    ).toBeInTheDocument()
    expect(mocks.getTranscriptForCall).toHaveBeenCalledWith('call-1')
    expect(screen.getByText('Asha Verma · Diwali Outreach')).toBeInTheDocument()
  })

  it('appends a message pushed over the websocket without duplicating an already-loaded one', async () => {
    mocks.getTranscriptForCall.mockResolvedValue({
      id: 'transcript-1',
      callId: 'call-1',
      finalizedAt: null,
      createdAt: '2026-08-26T10:00:00.000Z',
      messages: [aiMessage],
    })

    render(<LiveTranscriptPanel liveCalls={[liveCall()]} />)
    await screen.findByText('Hi, this is Riya calling from Acme.')

    // Re-delivering the same message id must not duplicate it.
    emitMessage(aiMessage)
    expect(screen.getAllByText('Hi, this is Riya calling from Acme.')).toHaveLength(1)

    emitMessage({
      id: 'msg-2',
      speaker: 'CUSTOMER',
      text: 'Sure, tell me more.',
      timestamp: '2026-08-26T10:00:05.000Z',
      confidence: 0.9,
    })

    expect(await screen.findByText('Sure, tell me more.')).toBeInTheDocument()
  })

  it('lets the viewer switch between multiple connected calls', async () => {
    const user = userEvent.setup()
    mocks.getTranscriptForCall.mockImplementation((callId: string) =>
      Promise.resolve({
        id: `transcript-${callId}`,
        callId,
        finalizedAt: null,
        createdAt: '2026-08-26T10:00:00.000Z',
        messages: [],
      }),
    )

    render(
      <LiveTranscriptPanel
        liveCalls={[
          liveCall({ callId: 'call-1', lead: { id: 'lead-1', name: 'Asha Verma', phone: '1', companyName: null } }),
          liveCall({
            id: 'queue-2',
            callId: 'call-2',
            lead: { id: 'lead-2', name: 'Rahul Gupta', phone: '2', companyName: null },
          }),
        ]}
      />,
    )

    await waitFor(() => expect(mocks.getTranscriptForCall).toHaveBeenCalledWith('call-1'))

    const select = screen.getByLabelText('Select a live call')
    await user.selectOptions(select, 'call-2')

    await waitFor(() => expect(mocks.getTranscriptForCall).toHaveBeenCalledWith('call-2'))
  })
})
