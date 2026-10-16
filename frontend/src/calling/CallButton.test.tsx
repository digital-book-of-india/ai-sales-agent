import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CallButton } from './CallButton'
import { toast } from '../lib/toast'
import * as leadsApi from '../leads/api'
import type { CallEvent, CallEventName } from './types'

// Everything a mock factory below needs to close over must live inside this
// one vi.hoisted() block — vi.mock() factories run before any of this
// file's own top-level `let`/`const` statements would otherwise have
// initialized, so referencing them directly throws a TDZ ReferenceError.
const mocks = vi.hoisted(() => {
  let onEvent: ((name: string, event: unknown) => void) | null = null
  let socketConnected = true
  let softphoneSnapshot: {
    status: 'idle' | 'connecting' | 'registered' | 'error'
    callStatus: 'idle' | 'ringing' | 'connected' | 'ended'
    error: string | null
  } = { status: 'idle', callStatus: 'idle', error: null }

  return {
    softphone: {
      ensureRegistered: vi.fn(),
      hangup: vi.fn(),
      resetCallStatus: vi.fn(),
    },
    getOnEvent: () => onEvent,
    setOnEvent: (next: typeof onEvent) => {
      onEvent = next
    },
    setSocketConnected: (next: boolean) => {
      socketConnected = next
    },
    getSocketConnected: () => socketConnected,
    getSoftphoneSnapshot: () => softphoneSnapshot,
    setSoftphoneSnapshot: (next: typeof softphoneSnapshot) => {
      softphoneSnapshot = next
    },
  }
})

vi.mock('./socket', () => ({
  useCallingSocket: (onEvent: (name: string, event: unknown) => void) => {
    mocks.setOnEvent(onEvent)
    return { connected: mocks.getSocketConnected() }
  },
}))

vi.mock('./softphone', () => ({
  softphone: mocks.softphone,
  useSoftphone: () => mocks.getSoftphoneSnapshot(),
}))

vi.mock('../leads/api', () => ({
  initiateLeadCall: vi.fn(),
}))

function emitCallEvent(name: CallEventName, event: CallEvent) {
  // The captured handler runs outside any simulated DOM event, so wrap it
  // like RTL wraps its own event helpers — otherwise the resulting state
  // update lands after the test's next assertion instead of before it.
  act(() => {
    mocks.getOnEvent()?.(name, event)
  })
}

describe('CallButton', () => {
  beforeEach(() => {
    // vi.restoreAllMocks() only undoes vi.spyOn() spies (e.g. the toast one
    // below) — the vi.fn()s returned by the vi.mock() factories above keep
    // their call history/implementation across tests unless reset here too.
    vi.restoreAllMocks()
    mocks.setOnEvent(null)
    mocks.setSocketConnected(true)
    mocks.setSoftphoneSnapshot({ status: 'idle', callStatus: 'idle', error: null })
    mocks.softphone.ensureRegistered.mockReset().mockResolvedValue(undefined)
    mocks.softphone.hangup.mockReset()
    mocks.softphone.resetCallStatus.mockReset()
    vi.mocked(leadsApi.initiateLeadCall).mockReset()
  })

  it('registers the softphone and starts the call on click, opening the live call panel', async () => {
    const user = userEvent.setup()
    vi.mocked(leadsApi.initiateLeadCall).mockResolvedValue({
      callId: 'call-1',
      queueItemId: 'queue-1',
      campaignId: 'manual-campaign-1',
    })

    render(<CallButton leadId="lead-1" leadName="Asha Verma" />)

    await user.click(screen.getByRole('button', { name: 'Call Asha Verma' }))

    expect(mocks.softphone.ensureRegistered).toHaveBeenCalled()
    expect(leadsApi.initiateLeadCall).toHaveBeenCalledWith('lead-1')
    expect(
      await screen.findByRole('dialog', { name: 'Call — Asha Verma' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Dialing')).toBeInTheDocument()
  })

  it('shows an error toast and never opens the panel when mic permission is denied', async () => {
    const user = userEvent.setup()
    const toastSpy = vi.spyOn(toast, 'error')
    mocks.softphone.ensureRegistered.mockRejectedValue(
      new Error('Permission denied'),
    )

    render(<CallButton leadId="lead-1" leadName="Asha Verma" />)
    await user.click(screen.getByRole('button', { name: 'Call Asha Verma' }))

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith('Permission denied')
    })
    expect(leadsApi.initiateLeadCall).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('updates live call status from matching websocket events and ignores events for other calls', async () => {
    const user = userEvent.setup()
    vi.mocked(leadsApi.initiateLeadCall).mockResolvedValue({
      callId: 'call-1',
      queueItemId: 'queue-1',
      campaignId: 'manual-campaign-1',
    })

    render(<CallButton leadId="lead-1" leadName="Asha Verma" />)
    await user.click(screen.getByRole('button', { name: 'Call Asha Verma' }))
    await screen.findByRole('dialog')

    emitCallEvent('call.ringing', {
      queueItemId: 'queue-1',
      leadId: 'lead-1',
      leadName: 'Asha Verma',
      campaignId: 'manual-campaign-1',
      campaignName: 'Manual Calls',
      status: 'RINGING',
      attempts: 1,
      callId: 'call-other',
    })
    expect(screen.getByText('Dialing')).toBeInTheDocument()

    emitCallEvent('call.ringing', {
      queueItemId: 'queue-1',
      leadId: 'lead-1',
      leadName: 'Asha Verma',
      campaignId: 'manual-campaign-1',
      campaignName: 'Manual Calls',
      status: 'RINGING',
      attempts: 1,
      callId: 'call-1',
    })
    expect(screen.getByText('Ringing')).toBeInTheDocument()
  })

  it('hangs up via the softphone and shows Close once the call ends', async () => {
    const user = userEvent.setup()
    vi.mocked(leadsApi.initiateLeadCall).mockResolvedValue({
      callId: 'call-1',
      queueItemId: 'queue-1',
      campaignId: 'manual-campaign-1',
    })
    const onCallEnded = vi.fn()

    render(
      <CallButton
        leadId="lead-1"
        leadName="Asha Verma"
        onCallEnded={onCallEnded}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Call Asha Verma' }))
    await screen.findByRole('dialog')

    await user.click(screen.getByRole('button', { name: 'Hang up' }))
    expect(mocks.softphone.hangup).toHaveBeenCalled()

    emitCallEvent('call.ended', {
      queueItemId: 'queue-1',
      leadId: 'lead-1',
      leadName: 'Asha Verma',
      campaignId: 'manual-campaign-1',
      campaignName: 'Manual Calls',
      status: 'COMPLETED',
      attempts: 1,
      callId: 'call-1',
      outcome: 'CONNECTED',
    })

    // Two "Close"-named buttons exist once the call has ended: the Modal's
    // own icon-only dismiss button (aria-label="Close") and this panel's
    // own visible "Close" action — target the latter, which is the one
    // wired to onCallEnded.
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(2)
    })
    expect(onCallEnded).not.toHaveBeenCalled()

    const closeButtons = screen.getAllByRole('button', { name: 'Close' })
    await user.click(closeButtons[closeButtons.length - 1])
    expect(onCallEnded).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
