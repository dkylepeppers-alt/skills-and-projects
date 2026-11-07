import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import vm from 'node:vm';
import { engineHeaders, originalHeaders, patchBundle } from './android-auth-patch.mjs';

const baseline = process.argv.includes('--baseline');
const headersFor = baseline ? vm.runInNewContext(`(${originalHeaders})`) : engineHeaders;
const secret = 'ab'.repeat(32);
const server = createServer((request, response) => {
  response.writeHead(request.headers['x-marinara-android-secret'] === secret ? 200 : 401);
  response.end('{}');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const port = String(server.address().port);
  const base = `http://127.0.0.1:${port}`;
  const env = { PORT: port, MARINARA_ANDROID_SECRET: secret };
  assert.equal((await fetch(base)).status, 401, 'Unauthenticated loopback must stay blocked');
  assert.equal((await fetch(base, { headers: headersFor(env, base) })).status, 200,
    'Life Sim internal requests must pass Android authentication');
  if (!baseline) {
    for (const target of [`http://127.0.0.1:${Number(port) + 1}`, `http://example.com:${port}`,
      `http://127.0.0.1.example.com:${port}`, `http://user@127.0.0.1:${port}`, 'invalid']) {
      assert.equal(headersFor(env, target)['x-marinara-android-secret'], undefined, target);
    }
    assert.equal(headersFor({ ...env, MARINARA_ANDROID_SECRET: 'bad' }, base)['x-marinara-android-secret'], undefined);
    assert.equal(headersFor({}, base).accept, 'application/json');
    assert.equal(headersFor({ ADMIN_SECRET: 'legacy' }, base)['X-Admin-Secret'], 'legacy');
    assert.equal(headersFor({ ...env, PORT: '443' }, 'https://[::1]')['x-marinara-android-secret'], secret);
    // Verify the actual rebuilt bundle calls the new helper and rejects redirects.
    const path = process.env.LIFE_SIM_BUNDLE;
    if (path) {
      const rebuilt = patchBundle(await readFile(path, 'utf8'));
      new vm.SourceTextModule(rebuilt);
      assert.equal(rebuilt.split('headers:aP(e,l()),redirect:"error",signal:').length, 3);
      assert.throws(() => patchBundle(rebuilt), /Unsupported/);
    }
    // Redirects must never carry the credential to another service.
    let leaked = false;
    const destination = createServer((_request, response) => { leaked = true; response.end('{}'); });
    await new Promise(resolve => destination.listen(0, '127.0.0.1', resolve));
    const redirector = createServer((_request, response) => {
      response.writeHead(302, { location: `http://127.0.0.1:${destination.address().port}` }); response.end();
    });
    await new Promise(resolve => redirector.listen(0, '127.0.0.1', resolve));
    try {
      const redirectBase = `http://127.0.0.1:${redirector.address().port}`;
      await assert.rejects(fetch(redirectBase, { headers: headersFor({ ...env, PORT: String(redirector.address().port) }, redirectBase), redirect: 'error' }));
      assert.equal(leaked, false);
    } finally { await Promise.all([new Promise(r => destination.close(r)), new Promise(r => redirector.close(r))]); }
  }
  console.log('PASS: internal authentication, anonymous rejection, destination restrictions, redirects, legacy headers');
} finally { await new Promise(resolve => server.close(resolve)); }
