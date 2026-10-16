import {
  buildSignedRecordingPath,
  signRecordingToken,
  verifyRecordingToken,
} from './recording-url.util';

const SECRET = 'test-secret';

describe('recording-url.util', () => {
  describe('buildSignedRecordingPath / verifyRecordingToken round trip', () => {
    it('accepts a freshly signed inline link', () => {
      const expiresAt = Date.now() + 60_000;
      const path = buildSignedRecordingPath(
        { recordingId: 'rec-1', disposition: 'inline', expiresAt },
        SECRET,
      );
      const query = Object.fromEntries(new URL(path, 'http://x').searchParams);

      expect(verifyRecordingToken('rec-1', query, SECRET)).toBe('inline');
    });

    it('accepts a freshly signed attachment link', () => {
      const expiresAt = Date.now() + 60_000;
      const path = buildSignedRecordingPath(
        { recordingId: 'rec-1', disposition: 'attachment', expiresAt },
        SECRET,
      );
      const query = Object.fromEntries(new URL(path, 'http://x').searchParams);

      expect(verifyRecordingToken('rec-1', query, SECRET)).toBe('attachment');
    });
  });

  describe('verifyRecordingToken', () => {
    function validQuery(
      overrides: Partial<{
        recordingId: string;
        disposition: 'inline' | 'attachment';
        expiresAt: number;
      }> = {},
    ) {
      const params = {
        recordingId: 'rec-1',
        disposition: 'inline' as const,
        expiresAt: Date.now() + 60_000,
        ...overrides,
      };
      const sig = signRecordingToken(params, SECRET);
      return { exp: String(params.expiresAt), disp: params.disposition, sig };
    }

    it('rejects an expired link', () => {
      const query = validQuery({ expiresAt: Date.now() - 1000 });
      expect(verifyRecordingToken('rec-1', query, SECRET)).toBeNull();
    });

    it('rejects a signature minted for a different recording id', () => {
      const query = validQuery();
      expect(verifyRecordingToken('rec-2', query, SECRET)).toBeNull();
    });

    it('rejects a disposition swapped after signing (play link edited into a download link)', () => {
      const query = validQuery({ disposition: 'inline' });
      expect(
        verifyRecordingToken('rec-1', { ...query, disp: 'attachment' }, SECRET),
      ).toBeNull();
    });

    it('rejects a signature produced with a different secret', () => {
      const query = validQuery();
      expect(verifyRecordingToken('rec-1', query, 'wrong-secret')).toBeNull();
    });

    it('rejects a malformed/missing query', () => {
      expect(verifyRecordingToken('rec-1', {}, SECRET)).toBeNull();
      expect(
        verifyRecordingToken(
          'rec-1',
          { exp: 'not-a-number', disp: 'inline', sig: 'x' },
          SECRET,
        ),
      ).toBeNull();
      expect(
        verifyRecordingToken(
          'rec-1',
          {
            exp: String(Date.now() + 60_000),
            disp: 'bogus',
            sig: 'x',
          },
          SECRET,
        ),
      ).toBeNull();
    });
  });
});
