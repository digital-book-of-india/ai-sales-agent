import { EventEmitter } from 'events';
import { AmiClient } from './ami-client';

/** Minimal fake standing in for `net.Socket` — enough surface for
 * AmiClient's connect()/write()/data-handling, driven manually from tests
 * via emitConnect()/emitData() instead of a real TCP round-trip. */
class FakeSocket extends EventEmitter {
  written: string[] = [];
  destroyed = false;
  ended = false;

  connect(_port: number, _host: string, cb: () => void): void {
    this.emitConnect = cb;
  }

  // Assigned by connect() above; tests call it to simulate the TCP connect
  // completing successfully.
  emitConnect: () => void = () => {};

  setEncoding(): void {}

  write(data: string): void {
    this.written.push(data);
  }

  end(): void {
    this.ended = true;
  }

  destroy(): void {
    this.destroyed = true;
  }

  emitData(text: string): void {
    this.emit('data', text);
  }
}

/** Flushes pending microtasks — needed after emitConnect() because
 * AmiClient.connect() resumes past its `await` (and then synchronously
 * calls sendAction/write for the Login action) on a later microtask turn,
 * not synchronously within the resolve() call itself. */
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function amiBlock(fields: Record<string, string>): string {
  return (
    Object.entries(fields)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\r\n') + '\r\n\r\n'
  );
}

describe('AmiClient', () => {
  let socket: FakeSocket;
  let client: AmiClient;

  beforeEach(() => {
    socket = new FakeSocket();
    client = new AmiClient({
      host: '127.0.0.1',
      port: 5038,
      username: 'backend',
      password: 'secret',
      actionTimeoutMs: 200,
      createSocket: () => socket as unknown as import('net').Socket,
    });
  });

  it('connects and logs in, resolving once a matching Login response arrives', async () => {
    const connectPromise = client.connect();
    socket.emitConnect();
    await flush();

    // The login Action carries its own ActionID (login-<n>); grab it from
    // what was actually written so the fake response can echo it back.
    const written = socket.written[0];
    const actionId = /ActionID: (\S+)/.exec(written)![1];
    expect(written).toContain('Action: Login');
    expect(written).toContain('Username: backend');
    expect(written).toContain('Secret: secret');

    socket.emitData(amiBlock({ Response: 'Success', ActionID: actionId }));

    await expect(connectPromise).resolves.toBeUndefined();
    expect(client.connected).toBe(true);
  });

  it('rejects connect() when login fails', async () => {
    const connectPromise = client.connect();
    socket.emitConnect();
    await flush();
    const actionId = /ActionID: (\S+)/.exec(socket.written[0])![1];

    socket.emitData(
      amiBlock({
        Response: 'Error',
        Message: 'Authentication failed',
        ActionID: actionId,
      }),
    );

    await expect(connectPromise).rejects.toThrow('AMI login failed');
    expect(socket.destroyed).toBe(true);
  });

  async function login(): Promise<void> {
    const connectPromise = client.connect();
    socket.emitConnect();
    await flush();
    const actionId = /ActionID: (\S+)/.exec(socket.written[0])![1];
    socket.emitData(amiBlock({ Response: 'Success', ActionID: actionId }));
    await connectPromise;
    socket.written = [];
  }

  it('correlates sendAction responses by ActionID', async () => {
    await login();

    const promise = client.sendAction({
      Action: 'Hangup',
      Channel: 'PJSIP/1234-000001',
      ActionID: 'my-action-1',
    });

    expect(socket.written[0]).toContain('Action: Hangup');
    socket.emitData(amiBlock({ Response: 'Success', ActionID: 'my-action-1' }));

    await expect(promise).resolves.toEqual({
      Response: 'Success',
      ActionID: 'my-action-1',
    });
  });

  it('writes one Variable: line per array entry', async () => {
    await login();

    // Awaited (with a matching response queued below) rather than left
    // fire-and-forget — an unresolved sendAction() otherwise times out
    // ~200ms later, mid-way through whichever test happens to be running
    // by then.
    const promise = client.sendAction({
      Action: 'Originate',
      Channel: 'PJSIP/1234@airtel-trunk',
      ActionID: 'orig-1',
      Variable: ['BRIDGE_TARGET=ai', 'CAMPAIGN_ID=camp-1'],
    });

    const lines = socket.written[0].split('\r\n');
    expect(lines.filter((l) => l.startsWith('Variable:'))).toEqual([
      'Variable: BRIDGE_TARGET=ai',
      'Variable: CAMPAIGN_ID=camp-1',
    ]);

    socket.emitData(amiBlock({ Response: 'Success', ActionID: 'orig-1' }));
    await promise;
  });

  it('rejects sendAction if no response arrives before the timeout', async () => {
    await login();

    const promise = client.sendAction({
      Action: 'Hangup',
      Channel: 'PJSIP/1234-000001',
      ActionID: 'never-answered',
    });

    await expect(promise).rejects.toThrow('timed out');
  });

  it('dispatches Event blocks to onEvent handlers', async () => {
    await login();
    const handler = jest.fn();
    client.onEvent(handler);

    socket.emitData(
      amiBlock({ Event: 'Hangup', Uniqueid: 'call-1', Cause: '16' }),
    );

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ Event: 'Hangup', Uniqueid: 'call-1' }),
    );
  });

  it('waitForEvent resolves only on an event matching name + predicate', async () => {
    await login();

    const promise = client.waitForEvent(
      'OriginateResponse',
      (msg) => msg.ActionID === 'orig-1',
    );

    // A same-name event with the wrong ActionID must not resolve it.
    socket.emitData(
      amiBlock({ Event: 'OriginateResponse', ActionID: 'orig-other' }),
    );
    socket.emitData(
      amiBlock({
        Event: 'OriginateResponse',
        ActionID: 'orig-1',
        Response: 'Success',
      }),
    );

    await expect(promise).resolves.toEqual(
      expect.objectContaining({ ActionID: 'orig-1', Response: 'Success' }),
    );
  });

  it('handles a single TCP chunk containing multiple back-to-back blocks', async () => {
    await login();
    const handler = jest.fn();
    client.onEvent(handler);

    socket.emitData(
      amiBlock({ Event: 'Newchannel', Uniqueid: 'call-1' }) +
        amiBlock({
          Event: 'Newstate',
          Uniqueid: 'call-1',
          ChannelStateDesc: 'Up',
        }),
    );

    expect(handler).toHaveBeenCalledTimes(2);
  });
});
