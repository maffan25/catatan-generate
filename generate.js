'use strict';

const crypto = require('crypto');
const { MODELS, LENGTHS, sanitizeOptions, buildUserText } = require('./_models');

const API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_TEXT_CHARS = 120000;
const MAX_PDF_B64 = 4200000; // batas body Vercel ~4.5MB
const SENTINEL = '⟦CG:'; // penanda error/terpotong di dalam stream

// Pembatas laju sederhana (best-effort; instance serverless bisa berganti)
const hits = new Map();
function rateLimited(ip) {
  const limit = Number(process.env.RATE_LIMIT_PER_HOUR || 30);
  if (!limit) return false;
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 3600e3);
  if (recent.length >= limit) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return false;
}

function safeEqual(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

function upstreamMessage(status, raw) {
  let detail = '';
  try {
    const j = JSON.parse(raw);
    detail = (j && j.error && j.error.message) || '';
  } catch (_) {
    /* abaikan */
  }
  if (status === 401 || status === 403) return 'Kunci API tidak valid atau tidak punya akses. Periksa ANTHROPIC_API_KEY di Vercel.';
  if (status === 429) return 'Batas permintaan ke Claude tercapai. Coba lagi sebentar lagi.';
  if (status === 529 || status === 503) return 'Layanan Claude sedang sibuk. Coba lagi beberapa saat lagi.';
  if (status === 400 && detail) return `Permintaan ditolak: ${detail.slice(0, 200)}`;
  return `Claude mengembalikan galat (${status}).`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Metode tidak didukung.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json(res, 500, { error: 'Server belum dikonfigurasi: ANTHROPIC_API_KEY belum diatur di Vercel.' });
  }

  const required = process.env.ACCESS_CODE;
  if (required && !safeEqual(String(req.headers['x-access-code'] || ''), required)) {
    return json(res, 401, { code: 'ACCESS_REQUIRED', error: 'Kode akses diperlukan atau salah.' });
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || 'unknown';
  if (rateLimited(ip)) {
    return json(res, 429, { error: 'Terlalu banyak permintaan. Coba lagi dalam satu jam.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (_) {
      body = null;
    }
  }
  if (!body || typeof body !== 'object') return json(res, 400, { error: 'Body permintaan tidak valid.' });

  const model = MODELS[body.model];
  if (!model) return json(res, 400, { error: 'Model catatan tidak dikenal.' });

  const options = sanitizeOptions(body.options);
  const fileName = String(body.fileName || 'dokumen.pdf').slice(0, 120);
  const pdf = typeof body.pdfBase64 === 'string' ? body.pdfBase64 : '';
  let text = typeof body.text === 'string' ? body.text : '';

  if (pdf) {
    if (pdf.length > MAX_PDF_B64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(pdf)) {
      return json(res, 413, { error: 'PDF terlalu besar atau formatnya tidak valid.' });
    }
  } else {
    text = text.slice(0, MAX_TEXT_CHARS);
    if (text.trim().length < 50) {
      return json(res, 400, { error: 'Isi dokumen terlalu sedikit untuk dibuat catatan.' });
    }
  }

  const userText = buildUserText({ options, fileName, text, hasPdf: !!pdf });
  const content = pdf
    ? [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf } },
        { type: 'text', text: userText },
      ]
    : [{ type: 'text', text: userText }];

  const payload = {
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
    max_tokens: LENGTHS[options.length].maxTokens,
    stream: true,
    system: model.buildSystem(options.language),
    messages: [{ role: 'user', content }],
  };

  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  let upstream;
  try {
    upstream = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) return;
    return json(res, 502, { error: 'Tidak dapat terhubung ke Claude. Coba lagi.' });
  }

  if (!upstream.ok) {
    const raw = await upstream.text().catch(() => '');
    return json(res, upstream.status === 429 ? 429 : 502, { error: upstreamMessage(upstream.status, raw) });
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const write = (s) => {
    if (!res.writableEnded && !res.destroyed) res.write(s);
  };

  const handleEvent = (rawEvent) => {
    const dataLines = rawEvent
      .split(/\r?\n/)
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim());
    if (!dataLines.length) return;
    let evt;
    try {
      evt = JSON.parse(dataLines.join('\n'));
    } catch (_) {
      return;
    }
    if (evt.type === 'content_block_delta' && evt.delta && evt.delta.type === 'text_delta') {
      write(evt.delta.text);
    } else if (evt.type === 'message_delta' && evt.delta && evt.delta.stop_reason === 'max_tokens') {
      write(`\n${SENTINEL}TRUNCATED⟧`);
    } else if (evt.type === 'error') {
      const msg = (evt.error && evt.error.message) || 'Terjadi galat saat menulis.';
      write(`\n${SENTINEL}ERROR:${msg.replace(/⟧/g, '')}⟧`);
    }
  };

  try {
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let m;
      while ((m = /\r?\n\r?\n/.exec(buf))) {
        const ev = buf.slice(0, m.index);
        buf = buf.slice(m.index + m[0].length);
        handleEvent(ev);
      }
    }
    if (buf.trim()) handleEvent(buf);
  } catch (err) {
    if (!controller.signal.aborted) write(`\n${SENTINEL}ERROR:Koneksi ke Claude terputus.⟧`);
  }
  if (!res.writableEnded) res.end();
};
