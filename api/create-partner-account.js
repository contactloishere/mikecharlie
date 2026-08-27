// /api/create-partner-account.js
// Server-side only. Creates a login for a Hotel or Retail Partner on the
// admin's behalf. Uses the Supabase SERVICE ROLE key — which must live only
// in Vercel's Environment Variables, never in any file in this repo, never
// sent to the browser. This function itself checks that whoever is calling
// it is actually an admin before doing anything.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { adminAccessToken, email, password, role, businessName } = req.body || {};
  if (!adminAccessToken || !email || !password || !role || !businessName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!['hotel', 'retail_partner'].includes(role)) {
    return res.status(400).json({ error: 'Role must be hotel or retail_partner' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const SB_URL = process.env.SUPABASE_URL;
  const ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SB_URL || !ANON_KEY || !SERVICE_KEY) {
    return res.status(500).json({ error: 'Server not configured — set SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in Vercel.' });
  }

  try {
    // 1. Confirm the caller is really an admin, using THEIR OWN token — never trust the client's word for it
    const meRes = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${adminAccessToken}` }
    });
    const me = await meRes.json();
    if (!meRes.ok || !me.id) return res.status(401).json({ error: 'Invalid session — please log in again.' });

    const profRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${me.id}&select=role`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${adminAccessToken}` }
    });
    const profData = await profRes.json();
    if (!profRes.ok || !profData[0] || !['admin', 'staff'].includes(profData[0].role)) {
      return res.status(403).json({ error: 'Only admins can create partner accounts.' });
    }

    // 2. Create the actual login (service role required for this step)
    const createRes = await fetch(`${SB_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, email_confirm: true })
    });
    const created = await createRes.json();
    if (!createRes.ok) throw new Error(created.msg || created.error_description || 'Failed to create account');

    // 3. The signup trigger already made a default 'customer' profile row — upgrade it
    const updRes = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${created.id}`, {
      method: 'PATCH',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, full_name: businessName })
    });
    if (!updRes.ok) throw new Error('Account created, but setting its role failed — fix manually in Supabase (profiles table).');

    return res.status(200).json({ success: true, userId: created.id });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
