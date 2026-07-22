import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCloneRequest } from './clone-upstream.mjs';

const valid = {
  id: 'paperless-ngx',
  officialUrl: 'https://github.com/paperless-ngx/paperless-ngx',
  ref: 'a'.repeat(40),
  release: 'reference-commit',
  licensePath: 'LICENSE',
};

test('accepts only an official URL and full immutable source commit', () => {
  assert.doesNotThrow(() => validateCloneRequest(valid));
  assert.throws(() => validateCloneRequest({ ...valid, officialUrl: 'https://example.com/repo' }), /official/);
  assert.throws(() => validateCloneRequest({ ...valid, ref: 'main' }), /commit/);
  assert.throws(() => validateCloneRequest({ ...valid, licensePath: '../LICENSE' }), /license/);
});
