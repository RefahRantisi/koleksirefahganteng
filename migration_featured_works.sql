-- ========================================================================
-- MIGRATION: Tambah kolom description dan is_featured ke tabel works
-- Jalankan di: Supabase Dashboard → SQL Editor
-- ========================================================================

ALTER TABLE public.works ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE public.works ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'works' AND policyname = 'Public can update works'
  ) THEN
    EXECUTE 'CREATE POLICY "Public can update works" ON public.works FOR UPDATE USING (true) WITH CHECK (true)';
  END IF;
END $$;
