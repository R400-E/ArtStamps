// netlify/functions/ots-stamp.js
// ブラウザからのOTS stampリクエストをカレンダーサーバーに中継するプロキシ
// CORS問題をサーバーサイドで回避する

const CALENDARS = [
  'https://alice.btc.calendar.opentimestamps.org/digest',
  'https://bob.btc.calendar.opentimestamps.org/digest',
  'https://finney.calendar.eternitywall.com/digest',
];

exports.handler = async (event) => {
  // POST以外は拒否
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // リクエストボディ: 32バイトのSHA-256ハッシュ（base64エンコード済み）
  let hashBytes;
  try {
    hashBytes = Buffer.from(event.body, 'base64');
    if (hashBytes.length !== 32) {
      return { statusCode: 400, body: 'Invalid hash: must be 32 bytes (SHA-256)' };
    }
  } catch (e) {
    return { statusCode: 400, body: 'Invalid request body' };
  }

  // 全カレンダーに並列送信
  const results = await Promise.allSettled(
    CALENDARS.map(url =>
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: hashBytes,
      }).then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status} from ${url}`);
        const buf = await r.arrayBuffer();
        if (buf.byteLength < 10) throw new Error('Empty response');
        return { url, buf };
      })
    )
  );

  const success = results.find(r => r.status === 'fulfilled');
  if (!success) {
    const errors = results.map(r => r.reason?.message || 'unknown').join('; ');
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'All calendars failed', details: errors }),
    };
  }

  // 成功したカレンダーのOTSレスポンスをbase64で返す
  const otsBytes = Buffer.from(success.value.buf);
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Calendar': success.value.url,
      'Access-Control-Allow-Origin': 'https://artstamps.netlify.app',
    },
    body: otsBytes.toString('base64'),
    isBase64Encoded: true,
  };
};
