// =============================================================================
// Vercel Serverless Function: /api/get-upload-token
//
// Fungsi ini berjalan di server Vercel — TIDAK di browser.
// UPLOAD_SECRET dibaca dari Vercel Environment Variables,
// sehingga tidak pernah terekspos ke client.
//
// Cara kerja:
//   1. Admin (dari admin.html) memanggil endpoint ini untuk mendapat token upload
//   2. Token adalah HMAC-SHA256 yang ditandatangani menggunakan UPLOAD_SECRET
//   3. Token berlaku 15 menit
//   4. Cloudflare Worker memvalidasi tanda tangan HMAC — bukan membandingkan string statis
// =============================================================================

const crypto = require('crypto');

module.exports = async function handler(req, res) {
  // Hanya izinkan metode POST
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.UPLOAD_SECRET;
  if (!secret) {
    console.error('[get-upload-token] UPLOAD_SECRET env var tidak diset.');
    return res.status(500).json({ error: 'Server tidak dikonfigurasi dengan benar. Hubungi admin.' });
  }

  // Buat token HMAC yang berlaku 15 menit
  // Format: "<expiry_timestamp>.<hmac_signature>"
  const expiry = Date.now() + 15 * 60 * 1000;
  const payload = `upload:${expiry}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  const token = `${expiry}.${signature}`;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  return res.status(200).json({
    token,
    expiresAt: new Date(expiry).toISOString(),
  });
};
