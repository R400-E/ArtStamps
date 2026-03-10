// netlify/functions/ots-upgrade.js
// pending OTSファイルをカレンダーサーバーに送ってBitcoin確認済みに更新するプロキシ

const CALENDARS = [
  'https://alice.btc.calendar.opentimestamps.org',
  'https://bob.btc.calendar.opentimestamps.org',
  'https://finney.calendar.eternitywall.com',
];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let otsBytes;
  try {
    otsBytes = Buffer.from(event.body, 'base64');
    if (otsBytes.length < 10) throw new Error('Too short');
  } catch (e) {
    return { statusCode: 400, body: 'Invalid OTS data' };
  }

  // OTSファイルに記録されているカレンダーURLを抽出
  // PendingAttestation の URL は OTS バイナリ内にテキストで埋め込まれている
  const otsText = otsBytes.toString('binary');
  const calendarUrls = [];
  for (const base of CALENDARS) {
    const host = base.replace('https://', '');
    if (otsText.includes(host)) {
      calendarUrls.push(base);
    }
  }
  // 見つからなければ全カレンダーを試す
  const targets = calendarUrls.length > 0 ? calendarUrls : CALENDARS;

  // 各カレンダーの /timestamp エンドポイントへ送信
  const results = await Promise.allSettled(
    targets.map(base =>
      fetch(`${base}/timestamp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: otsBytes,
      }).then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const buf = await r.arrayBuffer();
        const newBytes = Buffer.from(buf);
        // レスポンスが元より大きい = Bitcoin proof が追加された
        if (newBytes.length > otsBytes.length) {
          return newBytes;
        }
        throw new Error('No new attestation');
      })
    )
  );

  const success = results.find(r => r.status === 'fulfilled');
  if (!success) {
    // まだBitcoinに組み込まれていない（正常な待機状態）
    return {
      statusCode: 204, // No Content: まだ確認されていない
      headers: { 'Access-Control-Allow-Origin': 'https://artstamps.netlify.app' },
      body: '',
    };
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Access-Control-Allow-Origin': 'https://artstamps.netlify.app',
    },
    body: success.value.toString('base64'),
    isBase64Encoded: true,
  };
};
