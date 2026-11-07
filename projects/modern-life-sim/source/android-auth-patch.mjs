import { createHash } from 'node:crypto';

export const baselineSha256 = 'd5672272a8267f205537f524a3ab2d52cc0531f4567ea624c06de1e67f95c890';
export const originalHeaders = 'function aP(e={}){let t=String(e.ADMIN_SECRET??"").trim();return{accept:"application/json",...t?{"X-Admin-Secret":t}:{}}}';

// Credentials belong only on this Engine's own loopback HTTP requests.
export function engineHeaders(env = {}, base) {
  const admin = String(env.ADMIN_SECRET ?? '').trim();
  const headers = { accept: 'application/json', ...(admin ? { 'X-Admin-Secret': admin } : {}) };
  const secret = String(env.MARINARA_ANDROID_SECRET ?? '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(secret)) return headers;
  let url;
  try { url = new URL(base); } catch { return headers; }
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  const host = url.hostname;
  if (
    ['http:', 'https:'].includes(url.protocol) &&
    (host === 'localhost' || host === '[::1]' || /^127\.(?:\d+\.){2}\d+$/.test(host)) &&
    /^\d+$/.test(String(env.PORT ?? '')) && Number(port) === Number(env.PORT) &&
    !url.username && !url.password
  ) headers['x-marinara-android-secret'] = secret;
  return headers;
}

export function patchBundle(source) {
  if (createHash('sha256').update(source).digest('hex') !== baselineSha256) {
    throw new Error('Unsupported Life Sim bundle: expected the original 0.3.2 SHA-256; refusing to modify it.');
  }
  if (source.split(originalHeaders).length !== 2 || source.split('headers:aP(e),signal:').length !== 3) {
    throw new Error('Unexpected bridge layout; refusing to modify it.');
  }
  return source.replace(originalHeaders, engineHeaders.toString().replace('engineHeaders', 'aP'))
    .replaceAll('headers:aP(e),signal:', 'headers:aP(e,l()),redirect:"error",signal:');
}
