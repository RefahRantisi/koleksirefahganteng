// ==============================================================================
// KONFIGURASI PUBLIK APLIKASI PORTOFOLIO
// File ini aman dimuat di semua halaman (index, gallery, login).
// JANGAN tambahkan secret/token sensitif di sini.
// ==============================================================================
window.PDD_SUPABASE_CONFIG = {
  // Supabase URL & Anon Key (aman untuk publik frontend)
  url: 'https://mllrmhdnbdkkqzmzqrcv.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sbHJtaGRuYmRra3F6bXpxcmN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNjUyNTcsImV4cCI6MjEwNTY0MTI1N30.Ei-NozBaKTEGiakGdADkuH-Irm3Ylnd_KeyRefjHiNo',

  // Endpoint Cloudflare Worker untuk upload (URL-nya publik, tidak sensitif)
  r2WorkerUploadUrl: 'https://koleksirefahganteng.refah-rants.workers.dev/upload',
  // Base URL publik R2 untuk preview video & gambar
  r2PublicUrl: 'https://pub-b13ea9401df94ae1b5b0922102aee9ae.r2.dev',
  // Endpoint Vercel Serverless Function untuk token upload (bisa diakses dari online maupun lokal)
  tokenApiUrl: 'https://koleksirefahganteng.vercel.app/api/get-upload-token',

  // Keamanan Login Admin (Terenkripsi SHA-256):
  // Nomor HP dan PIN asli TIDAK tersimpan dalam bentuk teks biasa, sehingga aman dari Inspect Element
  adminPhoneHash: '05540bb90972a706ebf11122156e373d287f715e1039143ec351ec8c34d8c565',
  adminPinHash: '53d003e708dc0eb09a43934100aa54c1cf3f6c4fee0d0b9f8433a8386ff8a3c6'
};