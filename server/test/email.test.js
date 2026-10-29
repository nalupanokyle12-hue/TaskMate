import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmailCode, createChallengeId, hashChallengeId, hashEmailCode } from '../src/lib/email.js';

process.env.SESSION_SECRET = 'test-only-secret-with-more-than-32-characters';

test('email verification codes are six numeric digits, including leading zeroes', () => {
  for (let i = 0; i < 100; i++) assert.match(createEmailCode(), /^\d{6}$/);
});

test('challenge identifiers are high entropy URL-safe values and stored hashes are not raw identifiers', () => {
  const challengeId = createChallengeId();
  assert.match(challengeId, /^[A-Za-z0-9_-]{40,50}$/);
  const hash = hashChallengeId(challengeId);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, challengeId);
});

test('code HMAC binds the code to its challenge and the server secret', () => {
  const challengeId = createChallengeId();
  const code = '012345';
  const stored = hashEmailCode(challengeId, code);
  assert.equal(stored, hashEmailCode(challengeId, code));
  assert.notEqual(stored, hashEmailCode(challengeId, '543210'));
  assert.notEqual(stored, hashEmailCode(createChallengeId(), code));
  assert.match(stored, /^[a-f0-9]{64}$/);
});
