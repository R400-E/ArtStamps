// api/ots-stamp.js — Vercel Serverless Function
const CALENDARS = [
  'https://alice.btc.calendar.opentimestamps.org/digest',
  'https://bob.btc.calendar.opentimestamps.org/digest',
  'https://finney.calendar.eternitywall.com/digest',
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://artstamps.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const hashBytes = Buffer.concat(chunks);

  if (hashBytes.length !== 32)
    return res.status(400).end('Invalid hash: must be 32 bytes');

  const results = await Promise.allSettled(
    CALENDARS.map(url =>
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: hashBytes,
      }).then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length < 10) throw new Error('Empty response');
        return { url, buf };
      })
    )
  );

  const success = results.find(r => r.status === 'fulfilled');
  if (!success) return res.status(502).end('All calendars failed');

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('X-Calendar', success.value.url);
  return res.send(success.value.buf);
}

export const config = { api: { bodyParser: false } };
