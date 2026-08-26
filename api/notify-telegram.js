// /api/notify-telegram.js
// Server-side only — this runs on Vercel's servers, never in the browser.
// The bot token lives in Vercel's Environment Variables, not in this file
// and not in the repo, so it can never leak through GitHub again.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message } = req.body || {};
  if (!message) {
    return res.status(400).json({ error: 'Missing message' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return res.status(500).json({ error: 'Server not configured — set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Vercel.' });
  }

  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.description || 'Telegram API error');
    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
