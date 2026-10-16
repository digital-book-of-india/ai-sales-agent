import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as usersApi from '../users/api'

interface FakeDelegate {
  onCallReceived?: () => void
  onCallAnswered?: () => void
  onCallHangup?: () => void
  onServerDisconnect?: (error?: Error) => void
}

const simpleUserInstances: {
  connect: ReturnType<typeof vi.fn>
  register: ReturnType<typeof vi.fn>
  hangup: ReturnType<typeof vi.fn>
  answer: ReturnType<typeof vi.fn>
  delegate: FakeDelegate
}[] = []

vi.mock('sip.js', () => {
  class FakeSimpleUser {
    connect = vi.fn().mockResolvedValue(undefined)
    register = vi.fn().mockResolvedValue(undefined)
    hangup = vi.fn().mockResolvedValue(undefined)
    answer = vi.fn().mockResolvedValue(undefined)
    delegate: FakeDelegate

    constructor(
      _server: string,
      options: { delegate: FakeDelegate },
    ) {
      this.delegate = options.delegate
      simpleUserInstances.push(this)
    }
  }

  return { Web: { SimpleUser: FakeSimpleUser } }
})

vi.mock('../users/api', () => ({
  getSipCredentials: vi.fn(),
}))

describe('softphone', () => {
  beforeEach(() => {
    vi.resetModules()
    simpleUserInstances.length = 0
    vi.mocked(usersApi.getSipCredentials).mockReset()
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockResolvedValue({}) },
      configurable: true,
    })
  })

  async function loadSoftphone() {
    return import('./softphone')
  }

  it('starts idle and reports an error without registering when mic permission is denied', async () => {
    const { softphone } = await loadSoftphone()
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new Error('Permission denied')),
      },
      configurable: true,
    })

    expect(softphone.getSnapshot().status).toBe('idle')
    await expect(softphone.ensureRegistered()).rejects.toThrow(
      'Permission denied',
    )
    expect(softphone.getSnapshot().status).toBe('error')
    expect(softphone.getSnapshot().error).toBe('Permission denied')
  })

  it('errors out when the backend reports no configured softphone server', async () => {
    const { softphone } = await loadSoftphone()
    vi.mocked(usersApi.getSipCredentials).mockResolvedValue({
      extension: '1001',
      password: 'secret',
      uri: 'sip:1001@pbx.example.com',
      wsServers: [],
    })

    await expect(softphone.ensureRegistered()).rejects.toThrow(
      'No softphone server is configured',
    )
    expect(softphone.getSnapshot().status).toBe('error')
  })

  it('connects and registers using the credentials from the backend', async () => {
    const { softphone } = await loadSoftphone()
    vi.mocked(usersApi.getSipCredentials).mockResolvedValue({
      extension: '1001',
      password: 'secret',
      uri: 'sip:1001@pbx.example.com',
      wsServers: ['wss://pbx.example.com:8089/ws'],
    })

    await softphone.ensureRegistered()

    expect(softphone.getSnapshot().status).toBe('registered')
    expect(simpleUserInstances).toHaveLength(1)
    expect(simpleUserInstances[0].connect).toHaveBeenCalled()
    expect(simpleUserInstances[0].register).toHaveBeenCalled()
  })

  it('does not reconnect once already registered', async () => {
    const { softphone } = await loadSoftphone()
    vi.mocked(usersApi.getSipCredentials).mockResolvedValue({
      extension: '1001',
      password: 'secret',
      uri: 'sip:1001@pbx.example.com',
      wsServers: ['wss://pbx.example.com:8089/ws'],
    })

    await softphone.ensureRegistered()
    await softphone.ensureRegistered()

    expect(simpleUserInstances).toHaveLength(1)
  })

  it('auto-answers an incoming call and tracks ringing -> connected -> ended', async () => {
    const { softphone } = await loadSoftphone()
    vi.mocked(usersApi.getSipCredentials).mockResolvedValue({
      extension: '1001',
      password: 'secret',
      uri: 'sip:1001@pbx.example.com',
      wsServers: ['wss://pbx.example.com:8089/ws'],
    })

    await softphone.ensureRegistered()
    const instance = simpleUserInstances[0]

    instance.delegate.onCallReceived?.()
    expect(softphone.getSnapshot().callStatus).toBe('ringing')
    expect(instance.answer).toHaveBeenCalled()

    instance.delegate.onCallAnswered?.()
    expect(softphone.getSnapshot().callStatus).toBe('connected')

    instance.delegate.onCallHangup?.()
    expect(softphone.getSnapshot().callStatus).toBe('ended')
  })

  it('hangs up the current session via SimpleUser.hangup', async () => {
    const { softphone } = await loadSoftphone()
    vi.mocked(usersApi.getSipCredentials).mockResolvedValue({
      extension: '1001',
      password: 'secret',
      uri: 'sip:1001@pbx.example.com',
      wsServers: ['wss://pbx.example.com:8089/ws'],
    })

    await softphone.ensureRegistered()
    softphone.hangup()

    expect(simpleUserInstances[0].hangup).toHaveBeenCalled()
  })
})
