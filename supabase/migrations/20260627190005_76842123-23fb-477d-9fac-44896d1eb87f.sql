
-- Revoke EXECUTE no trigger function (lint warning)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Storage policies (cada usuário gerencia seus próprios arquivos por bucket)
-- Estrutura: arquivos salvos sob path {user_id}/...
DO $$
DECLARE b text;
BEGIN
  FOR b IN SELECT unnest(ARRAY['work-media','intro-videos','resumes','profile-photos']) LOOP
    EXECUTE format($f$
      CREATE POLICY %I ON storage.objects FOR SELECT TO authenticated
        USING (bucket_id = %L AND auth.uid()::text = (storage.foldername(name))[1]);
    $f$, b || ' read own', b);
    EXECUTE format($f$
      CREATE POLICY %I ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (bucket_id = %L AND auth.uid()::text = (storage.foldername(name))[1]);
    $f$, b || ' insert own', b);
    EXECUTE format($f$
      CREATE POLICY %I ON storage.objects FOR UPDATE TO authenticated
        USING (bucket_id = %L AND auth.uid()::text = (storage.foldername(name))[1]);
    $f$, b || ' update own', b);
    EXECUTE format($f$
      CREATE POLICY %I ON storage.objects FOR DELETE TO authenticated
        USING (bucket_id = %L AND auth.uid()::text = (storage.foldername(name))[1]);
    $f$, b || ' delete own', b);
  END LOOP;
END $$;
