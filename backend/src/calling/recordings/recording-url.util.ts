import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Signs and verifies the short-lived query-string tokens that gate
 * `GET /calling/recordings/:id/stream` (see recordings.controller.ts). That
 * route has to be reachable by a bare `<audio src>`/`<a href>`, which can't
 * attach an Authorization header — so access control instead lives entirely
 * in this signature: the recording id, the expiry, and the disposition
 * (inline for playback, attachment for download) are all covered by the
 * HMAC, so a play-only link can never be edited into a download link and a
 * URL guessed or shared past its TTL simply fails verification.
 */

export type RecordingDisposition = 'inline' | 'attachment';

export interface RecordingTokenParams {
  recordingId: string;
  disposition: RecordingDisposition;
  /** Unix ms timestamp the link stops working at. */
  expiresAt: number;
}

export interface RecordingStreamQuery {
  exp?: string;
  disp?: string;
  sig?: string;
}

function payloadFor(params: RecordingTokenParams): string {
  return `${params.recordingId}.${params.disposition}.${params.expiresAt}`;
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function signRecordingToken(
  params: RecordingTokenParams,
  secret: string,
): string {
  return sign(payloadFor(params), secret);
}

/** Builds the full relative path (with query string) for a signed stream
 * link, ready to hand to the frontend as-is. */
export function buildSignedRecordingPath(
  params: RecordingTokenParams,
  secret: string,
): string {
  const sig = signRecordingToken(params, secret);
  const query = new URLSearchParams({
    exp: String(params.expiresAt),
    disp: params.disposition,
    sig,
  });
  return `/calling/recordings/${params.recordingId}/stream?${query.toString()}`;
}

/**
 * Verifies a stream request's query params against `recordingId`. Returns
 * the disposition to serve with if the signature checks out and the link
 * hasn't expired, or `null` otherwise — callers should treat `null` as an
 * unauthorized request, never fall back to a default disposition.
 */
export function verifyRecordingToken(
  recordingId: string,
  query: RecordingStreamQuery,
  secret: string,
  now: number = Date.now(),
): RecordingDisposition | null {
  const { exp, disp, sig } = query;
  if (!exp || !sig || (disp !== 'inline' && disp !== 'attachment')) {
    return null;
  }

  const expiresAt = Number(exp);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    return null;
  }

  const expected = sign(
    payloadFor({ recordingId, disposition: disp, expiresAt }),
    secret,
  );

  const providedBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  // Length check first — timingSafeEqual throws on mismatched lengths, and
  // a length mismatch is simply not a match anyway.
  if (providedBuf.length !== expectedBuf.length) return null;
  return timingSafeEqual(providedBuf, expectedBuf) ? disp : null;
}
