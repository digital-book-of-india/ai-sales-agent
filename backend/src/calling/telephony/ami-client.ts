import { Logger } from '@nestjs/common';
import { Socket } from 'net';

/**
 * Minimal Asterisk Manager Interface (AMI) client — connect, Login, send an
 * Action and correlate its Response by ActionID, and subscribe to the raw
 * Event stream. Hand-rolled rather than pulling in a third-party AMI
 * package: the wire protocol is small (CRLF key/value blocks separated by a
 * blank line — https://docs.asterisk.org/Asterisk_20_Documentation/API_Documentation/AsteriskManagerInterfacePages/AsteriskManagerInterfaceAMI/)
 * and keeping it in-repo means AsteriskProvider's tests can drive it against
 * a fake socket instead of a real Asterisk instance (see ami-client.spec.ts).
 *
 * All AMI-specific parsing/framing lives in this file only — the same
 * isolation rule this codebase applies to every other wire format (see
 * ../ai-voice/audiosocket-protocol.ts for AudioSocket's).
 */

export type AmiMessage = Record<string, string>;

/** Fields for an outgoing Action. Most headers appear once, but AMI actions
 * like Originate accept a repeated `Variable:` header (one per channel
 * variable) — pass an array for those; write() emits one line per entry. */
export type AmiActionFields = Record<string, string | string[] | undefined>;

export interface AmiClientOptions {
  host: string;
  port: number;
  username: string;
  password: string;
  /** How long to wait for a Response/matching Event before giving up. */
  actionTimeoutMs?: number;
  /** Injectable for tests — defaults to a real `net.Socket`. */
  createSocket?: () => Socket;
}

interface PendingAction {
  resolve: (msg: AmiMessage) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface PendingEventWait {
  eventName: string;
  predicate: (msg: AmiMessage) => boolean;
  resolve: (msg: AmiMessage) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_TIMEOUT_MS = 10_000;

let actionIdCounter = 0;
/** Exported so callers (AsteriskProvider) can mint an ActionID up front and
 * use it consistently across the Originate action and the OriginateResponse
 * event they then wait for. */
export function nextActionId(prefix = 'act'): string {
  actionIdCounter += 1;
  return `${prefix}-${Date.now()}-${actionIdCounter}`;
}

export class AmiClient {
  private readonly logger = new Logger(AmiClient.name);
  private socket: Socket | null = null;
  private buffer = '';
  private readonly pendingActions = new Map<string, PendingAction>();
  private readonly pendingEventWaits = new Set<PendingEventWait>();
  private readonly eventHandlers: Array<(msg: AmiMessage) => void> = [];
  private loggedIn = false;

  constructor(private readonly options: AmiClientOptions) {}

  get connected(): boolean {
    return this.loggedIn;
  }

  async connect(): Promise<void> {
    const createSocket = this.options.createSocket ?? (() => new Socket());
    const socket = createSocket();
    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => reject(err);
      socket.once('error', onError);
      socket.connect(this.options.port, this.options.host, () => {
        socket.off('error', onError);
        resolve();
      });
    });

    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => this.handleData(chunk));
    socket.on('close', () => {
      this.loggedIn = false;
      this.logger.warn('AMI connection closed');
      this.failAllPending(new Error('AMI connection closed'));
    });
    socket.on('error', (err: Error) => {
      this.logger.error(`AMI socket error: ${err.message}`);
    });

    const loginId = nextActionId('login');
    const response = await this.sendAction({
      Action: 'Login',
      Username: this.options.username,
      Secret: this.options.password,
      ActionID: loginId,
    });
    if (response.Response !== 'Success') {
      this.socket.destroy();
      throw new Error(
        `AMI login failed: ${response.Message ?? 'unknown error'}`,
      );
    }
    this.loggedIn = true;
    this.logger.log('AMI connected and logged in');
  }

  close(): void {
    this.socket?.end();
    this.socket = null;
    this.loggedIn = false;
  }

  /** Registers a handler invoked for every Event block AMI sends (in
   * addition to any Response the same block might separately satisfy). */
  onEvent(handler: (msg: AmiMessage) => void): void {
    this.eventHandlers.push(handler);
  }

  /** Sends an Action and resolves with its immediate Response block,
   * correlated by ActionID (caller must set one). This is only the
   * synchronous ack ("queued", "success") — for Originate specifically that
   * is NOT the same as the call having connected; see waitForEvent. */
  sendAction(fields: AmiActionFields): Promise<AmiMessage> {
    if (!this.socket) return Promise.reject(new Error('AMI not connected'));
    const actionId = fields.ActionID as string | undefined;
    if (!actionId) {
      return Promise.reject(new Error('sendAction requires an ActionID'));
    }

    const timeoutMs = this.options.actionTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    const actionName = String(fields.Action);
    const promise = new Promise<AmiMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingActions.delete(actionId);
        reject(new Error(`AMI action ${actionName} timed out`));
      }, timeoutMs);
      this.pendingActions.set(actionId, { resolve, reject, timer });
    });

    this.write(fields);
    return promise;
  }

  /** Waits for a future Event of the given name matching `predicate` (e.g.
   * `msg.ActionID === originateActionId`) — how the caller learns the
   * *outcome* of an Async Originate, since the immediate Response is just
   * "request accepted". */
  waitForEvent(
    eventName: string,
    predicate: (msg: AmiMessage) => boolean,
    timeoutMs = this.options.actionTimeoutMs ?? DEFAULT_TIMEOUT_MS,
  ): Promise<AmiMessage> {
    return new Promise((resolve, reject) => {
      const wait: PendingEventWait = {
        eventName,
        predicate,
        resolve: (msg) => {
          this.pendingEventWaits.delete(wait);
          resolve(msg);
        },
        reject: (err) => {
          this.pendingEventWaits.delete(wait);
          reject(err);
        },
        timer: setTimeout(() => {
          this.pendingEventWaits.delete(wait);
          reject(new Error(`Timed out waiting for AMI event ${eventName}`));
        }, timeoutMs),
      };
      this.pendingEventWaits.add(wait);
    });
  }

  private write(fields: AmiActionFields): void {
    const lines: string[] = [];
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      for (const v of Array.isArray(value) ? value : [value]) {
        lines.push(`${key}: ${v}`);
      }
    }
    this.socket!.write(lines.join('\r\n') + '\r\n\r\n');
  }

  private handleData(chunk: string): void {
    this.buffer += chunk;
    let blockEnd: number;
    // AMI blocks are separated by a blank line (\r\n\r\n); the connection
    // banner ("Asterisk Call Manager/x.x.x\r\n") is the one exception —
    // parseBlock ignores it (no colon-separated fields to extract).
    while ((blockEnd = this.buffer.indexOf('\r\n\r\n')) !== -1) {
      const raw = this.buffer.slice(0, blockEnd);
      this.buffer = this.buffer.slice(blockEnd + 4);
      const msg = parseBlock(raw);
      if (msg) this.dispatch(msg);
    }
  }

  private dispatch(msg: AmiMessage): void {
    if (msg.ActionID && this.pendingActions.has(msg.ActionID)) {
      const pending = this.pendingActions.get(msg.ActionID)!;
      this.pendingActions.delete(msg.ActionID);
      clearTimeout(pending.timer);
      pending.resolve(msg);
    }

    if (msg.Event) {
      for (const handler of this.eventHandlers) handler(msg);
      for (const wait of [...this.pendingEventWaits]) {
        if (wait.eventName === msg.Event && wait.predicate(msg)) {
          clearTimeout(wait.timer);
          wait.resolve(msg);
        }
      }
    }
  }

  private failAllPending(err: Error): void {
    for (const pending of this.pendingActions.values()) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.pendingActions.clear();
    for (const wait of this.pendingEventWaits) {
      clearTimeout(wait.timer);
      wait.reject(err);
    }
    this.pendingEventWaits.clear();
  }
}

/** Parses one AMI block ("Key: Value" lines) into a flat object. Returns
 * null for the connection banner or anything else with no parseable
 * fields — callers should treat that as "nothing to dispatch". */
function parseBlock(raw: string): AmiMessage | null {
  const msg: AmiMessage = {};
  let sawField = false;
  for (const line of raw.split('\r\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    msg[key] = value;
    sawField = true;
  }
  return sawField ? msg : null;
}
