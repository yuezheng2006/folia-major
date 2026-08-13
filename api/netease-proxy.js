// Same-origin Netease API proxy for Folia Web on Vercel.
// Browser only talks to folia-web.vercel.app/netease/* — keeps the user-facing
// deploy on Vercel while forwarding to the Netease API (with Zeabur fallback).

const PRIMARY = process.env.NETEASE_UPSTREAM_BASE || 'https://folia-netease-api.vercel.app';
const FALLBACK = process.env.NETEASE_FALLBACK_BASE || 'https://folia-netease-api.zeabur.app';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

function buildUpstreamUrl(base, req) {
  const incoming = new URL(req.url || '/', 'http://localhost');
  const path = incoming.searchParams.get('path') || '';
  const upstream = new URL(path.startsWith('/') ? path : `/${path}`, `${base.replace(/\/$/, '')}/`);

  incoming.searchParams.forEach((value, key) => {
    if (key === 'path') return;
    upstream.searchParams.set(key, value);
  });

  if (!upstream.searchParams.has('randomCNIP')) {
    upstream.searchParams.set('randomCNIP', 'true');
  }

  return upstream;
}

function collectForwardHeaders(req) {
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value || HOP_BY_HOP.has(key.toLowerCase())) continue;
    if (key.toLowerCase() === 'cookie') {
      headers.cookie = Array.isArray(value) ? value.join('; ') : value;
      continue;
    }
    headers[key] = Array.isArray(value) ? value.join(', ') : value;
  }
  return headers;
}

async function forward(base, req) {
  const upstreamUrl = buildUpstreamUrl(base, req);
  const init = {
    method: req.method,
    headers: collectForwardHeaders(req),
    redirect: 'manual',
  };

  if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
    init.body = typeof req.body === 'string' || Buffer.isBuffer(req.body)
      ? req.body
      : JSON.stringify(req.body);
  }

  const upstreamRes = await fetch(upstreamUrl, init);
  const buf = Buffer.from(await upstreamRes.arrayBuffer());
  return { upstreamRes, buf, base };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'Content-Type');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.status(204).end();
    return;
  }

  const bases = Array.from(new Set([PRIMARY, FALLBACK].filter(Boolean)));
  let lastError = null;

  for (const base of bases) {
    try {
      const { upstreamRes, buf } = await forward(base, req);
      // Retry next upstream on hard gateway failures.
      if (upstreamRes.status >= 502 && bases.length > 1 && base === PRIMARY) {
        lastError = new Error(`upstream ${base} returned ${upstreamRes.status}`);
        continue;
      }

      res.status(upstreamRes.status);
      upstreamRes.headers.forEach((value, key) => {
        if (HOP_BY_HOP.has(key.toLowerCase())) return;
        if (key.toLowerCase() === 'set-cookie') {
          const existing = res.getHeader('Set-Cookie');
          if (!existing) res.setHeader('Set-Cookie', value);
          else res.setHeader('Set-Cookie', [].concat(existing, value));
          return;
        }
        res.setHeader(key, value);
      });
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('x-folia-netease-upstream', base);
      res.send(buf);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  res.status(502).json({
    code: 502,
    message: 'Netease upstream proxy failed',
    error: lastError instanceof Error ? lastError.message : String(lastError),
  });
}
