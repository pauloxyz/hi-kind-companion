-- Policies para o bucket privado `visa-evidence`.
-- Convenção de path: `${auth.uid()}/<item_id>/<filename>` — a primeira pasta = id do dono.
CREATE POLICY "visa-evidence read own"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'visa-evidence' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "visa-evidence insert own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'visa-evidence' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "visa-evidence update own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'visa-evidence' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'visa-evidence' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "visa-evidence delete own"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'visa-evidence' AND (storage.foldername(name))[1] = auth.uid()::text);