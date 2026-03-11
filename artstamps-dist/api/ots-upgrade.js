// api/ots-upgrade.js — Vercel Serverless Function
const CALENDARS = [
  'https://alice.btc.calendar.opentimestamps.org',
  'https://bob.btc.calendar.opentimestamps.org',
  'https://finney.calendar.eternitywall.com',
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const otsBytes = Buffer.concat(chunks);

  if (otsBytes.length < 10) return res.status(400).end('Invalid OTS data');

  const otsText = otsBytes.toString('binary');
  const targets = CALENDARS.filter(base =>
    otsText.includes(base.replace('https://', ''))
  );
  const tryList = targets.length > 0 ? targets : CALENDARS;

  const results = await Promise.allSettled(
    tryList.map(base =>
      fetch(`${base}/timestamp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: otsBytes,
      }).then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > otsBytes.length) return buf;
        throw new Error('No new attestation');
      })
    )
  );

  const success = results.find(r => r.status === 'fulfilled');
  if (!success) return res.status(204).end(); // まだ未確認（正常な待機）

  res.setHeader('Content-Type', 'application/octet-stream');
  return res.send(success.value);
}

export const config = { api: { bodyParser: false } };
