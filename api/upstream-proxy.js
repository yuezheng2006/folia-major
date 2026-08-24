// Same-origin upstream proxy that can target a Zeabur dedicated-server IP
// with the correct Host / TLS SNI (public *.zeabur.app domains are quota-limited
// on this project; custom Host routing still works on the server IP).

import https from 'node:https';
import http from 'node:http';

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

function parseUpstream(spec) {
  // Supports:
  // - https://host.example
  // - https://1.2.3.4|Host:real-hostname.example  (IP + virtual host / SNI)
  const [urlPart, hostPart] = String(spec || '').split('|Host:');
  const base = urlPart.replace(/\/$/, '');
  const virtualHost = (hostPart || '').trim() || null;
  return { base, virtualHost };
}

function buildUpstreamUrl(base, req) {
  const incoming = new URL(req.url || '/', 'http://localhost');
  const path = incoming.searchParams.get('path') || '';
  const upstream = new URL(path.startsWith('/') ? path : `/${path}`, `${base}/`);
  incoming.searchParams.forEach((value, key) => {
    if (key === 'path') return;
    upstream.searchParams.set(key, value);
  });
  return upstream;
}

function collectForwardHeaders(req, virtualHost) {
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value || HOP_BY_HOP.has(key.toLowerCase())) continue;
    if (key.toLowerCase() === 'cookie') {
      headers.cookie = Array.isArray(value) ? value.join('; ') : value;
      continue;
    }
    headers[key] = Array.isArray(value) ? value.join(', ') : value;
  }
  if (virtualHost) headers.host = virtualHost;
  return headers;
}

function requestUpstream(upstreamUrl, { method, headers, body, virtualHost }) {
  return new Promise((resolve, reject) => {
    const isHttps = upstreamUrl.protocol === 'https:';
    const lib = isHttps ? https : http;
    const options = {
      protocol: upstreamUrl.protocol,
      hostname: upstreamUrl.hostname,
      port: upstreamUrl.port || (isHttps ? 443 : 80),
      path: `${upstreamUrl.pathname}${upstreamUrl.search}`,
      method,
      headers,
      timeout: 25000,
    };
    if (isHttps && virtualHost) {
      options.servername = virtualHost;
      // Dedicated-server certs may be issued before public DNS validates.
      options.rejectUnauthorized = false;
    }

    const upstreamReq = lib.request(options, (upstreamRes) => {
      const chunks = [];
      upstreamRes.on('data', (c) => chunks.push(c));
      upstreamRes.on('end', () => {
        resolve({
          status: upstreamRes.statusCode || 502,
          headers: upstreamRes.headers,
          body: Buffer.concat(chunks),
        });
      });
    });
    upstreamReq.on('error', reject);
    upstreamReq.on('timeout', () => {
      upstreamReq.destroy();
      reject(new Error('upstream timeout'));
    });
    if (body) upstreamReq.write(body);
    upstreamReq.end();
  });
}

export function createUpstreamProxy({
  primaryEnv,
  fallbackEnv,
  primaryDefault,
  fallbackDefault,
  label,
}) {
  const PRIMARY = process.env[primaryEnv] || primaryDefault || '';
  const FALLBACK = process.env[fallbackEnv] || fallbackDefault || '';

  return async function handler(req, res) {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'Content-Type');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.status(204).end();
      return;
    }

    const specs = Array.from(new Set([PRIMARY, FALLBACK].filter(Boolean)));
    if (specs.length === 0) {
      res.status(503).json({ code: 503, message: `${label} upstream is not configured` });
      return;
    }

    let lastError = null;
    for (const spec of specs) {
      try {
        const { base, virtualHost } = parseUpstream(spec);
        const upstreamUrl = buildUpstreamUrl(base, req);
        let body;
        if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
          body = typeof req.body === 'string' || Buffer.isBuffer(req.body)
            ? req.body
            : JSON.stringify(req.body);
        }
        const upstream = await requestUpstream(upstreamUrl, {
          method: req.method,
          headers: collectForwardHeaders(req, virtualHost),
          body,
          virtualHost,
        });

        if (upstream.status >= 502 && specs.length > 1 && spec === PRIMARY) {
          lastError = new Error(`upstream ${spec} returned ${upstream.status}`);
          continue;
        }

        res.status(upstream.status);
        for (const [key, value] of Object.entries(upstream.headers)) {
          if (!value || HOP_BY_HOP.has(key.toLowerCase())) continue;
          if (key.toLowerCase() === 'set-cookie') {
            const existing = res.getHeader('Set-Cookie');
            if (!existing) res.setHeader('Set-Cookie', value);
            else res.setHeader('Set-Cookie', [].concat(existing, value));
            continue;
          }
          res.setHeader(key, value);
        }
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader(`x-folia-${label}-upstream`, spec);
        res.send(upstream.body);
        return;
      } catch (error) {
        lastError = error;
      }
    }

    res.status(502).json({
      code: 502,
      message: `${label} upstream proxy failed`,
      error: lastError instanceof Error ? lastError.message : String(lastError),
    });
  };
}
