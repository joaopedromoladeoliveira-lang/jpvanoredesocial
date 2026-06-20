
-- media bucket: authenticated read+write own folder; read all (signed urls needed since private)
CREATE POLICY "media authenticated read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'media');
CREATE POLICY "media owner insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "media owner update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'media' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "media owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'media' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(),'admin')));

-- verification-docs: owner can upload to own folder, admins can read, no public
CREATE POLICY "verif owner insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'verification-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "verif owner read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'verification-docs' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(),'admin')));
