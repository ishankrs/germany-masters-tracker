// Cloudflare Pages Function: stores the two profiles in a KV namespace.
// Needs two things in the Pages project settings:
//   1. a KV namespace bound as TRACKER_KV
//   2. a secret called PASSCODE
const IDS = ['ishan', 'riya'];
const MAX_BYTES = 1024 * 1024;

function reply(body, status) {
  return new Response(body, { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-tracker': '1' } });
}
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function onRequest({ request, env, params }) {
  if (!env.TRACKER_KV || !env.PASSCODE) return reply('{"error":"not configured"}', 503);
  if (!same(request.headers.get('x-passcode') || '', String(env.PASSCODE))) return reply('{"error":"passcode"}', 401);
  const id = String(params.id || '');
  if (!IDS.includes(id)) return reply('{"error":"unknown profile"}', 400);
  const key = 'profile:' + id;

  if (request.method === 'GET') {
    const v = await env.TRACKER_KV.get(key);
    return v ? reply(v, 200) : reply('{"error":"empty"}', 404);
  }
  if (request.method === 'PUT') {
    const text = await request.text();
    if (text.length > MAX_BYTES) return reply('{"error":"too large"}', 413);
    try { const d = JSON.parse(text); if (!d || typeof d !== 'object' || Array.isArray(d)) throw 0; } catch (e) { return reply('{"error":"not json"}', 400); }
    await env.TRACKER_KV.put(key, text);
    return reply('{"ok":true}', 200);
  }
  return reply('{"error":"method"}', 405);
}
