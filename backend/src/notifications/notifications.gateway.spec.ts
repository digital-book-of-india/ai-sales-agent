import { NotificationsGateway } from './notifications.gateway';
import type { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import type { NotificationRow } from './notifications.service';

describe('NotificationsGateway', () => {
  let verify: jest.Mock;
  let getOrThrow: jest.Mock;
  let jwtService: JwtService;
  let configService: ConfigService;
  let gateway: NotificationsGateway;

  // Returns { client, join, disconnect } — join/disconnect are their own
  // jest.fn() consts (not accessed as client.join in assertions), same
  // convention voice-session.service.spec.ts documents: asserting on
  // `object.method` directly trips @typescript-eslint/unbound-method.
  const makeClient = (overrides: Partial<Record<string, unknown>> = {}) => {
    const join = jest.fn();
    const disconnect = jest.fn();
    const client = {
      id: 'socket-1',
      handshake: { auth: {}, headers: {} },
      join,
      disconnect,
      ...overrides,
    } as unknown as import('socket.io').Socket;
    return { client, join, disconnect };
  };

  beforeEach(() => {
    verify = jest.fn();
    getOrThrow = jest.fn().mockReturnValue('secret');
    jwtService = { verify } as unknown as JwtService;
    configService = { getOrThrow } as unknown as ConfigService;
    gateway = new NotificationsGateway(jwtService, configService);
  });

  it('joins the socket to a room keyed by the token subject on a valid token', () => {
    verify.mockReturnValue({ sub: 'user-1', role: 'SALES_EXECUTIVE' });
    const { client, join, disconnect } = makeClient({
      handshake: { auth: { token: 'valid' }, headers: {} },
    });

    gateway.handleConnection(client);

    expect(join).toHaveBeenCalledWith('user:user-1');
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('accepts the token from an Authorization header when auth.token is absent', () => {
    verify.mockReturnValue({ sub: 'user-2', role: 'ADMIN' });
    const { client, join } = makeClient({
      handshake: { auth: {}, headers: { authorization: 'Bearer from-header' } },
    });

    gateway.handleConnection(client);

    expect(verify).toHaveBeenCalledWith('from-header', { secret: 'secret' });
    expect(join).toHaveBeenCalledWith('user:user-2');
  });

  it('disconnects a socket with no token', () => {
    const { client, join, disconnect } = makeClient();

    gateway.handleConnection(client);

    expect(disconnect).toHaveBeenCalledWith(true);
    expect(join).not.toHaveBeenCalled();
  });

  it('disconnects a socket whose token fails verification', () => {
    verify.mockImplementation(() => {
      throw new Error('invalid token');
    });
    const { client, join, disconnect } = makeClient({
      handshake: { auth: { token: 'bad' }, headers: {} },
    });

    gateway.handleConnection(client);

    expect(disconnect).toHaveBeenCalledWith(true);
    expect(join).not.toHaveBeenCalled();
  });

  it('emits notification.created only into the recipient user room', () => {
    const to = jest.fn();
    const emit = jest.fn();
    to.mockReturnValue({ emit });
    gateway.server = { to } as unknown as NotificationsGateway['server'];

    const notification = {
      id: 'notif-1',
      type: 'HOT_LEAD',
    } as unknown as NotificationRow;
    gateway.emit('user-1', notification);

    expect(to).toHaveBeenCalledWith('user:user-1');
    expect(emit).toHaveBeenCalledWith('notification.created', notification);
  });
});
