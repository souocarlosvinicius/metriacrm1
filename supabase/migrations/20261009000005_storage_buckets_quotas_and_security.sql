-- ==============================================================================
-- METRIA CRM - MIGRATION: CONFIGURAÇÃO DE STORAGE, BUCKETS, QUOTAS E SEGURANÇA
-- Versão: 20261009000005
-- Etapa 7: Arquivos, Isolamento Multi-Tenant e Separação de Mídias Públicas/Privadas
-- ==============================================================================

-- 1. CRIAÇÃO E CONFIGURAÇÃO DOS BUCKETS DE STORAGE
-- Bucket Público: Fotos de imóveis para portais e anúncios (max 5MB, JPG/PNG/WEBP)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'property-images',
  'property-images',
  true,
  5242880, -- 5MB em bytes
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

-- Bucket Privado: Documentos confidenciais, contratos, escrituras e comprovantes (max 10MB, PDF/JPG/PNG)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'private-documents',
  'private-documents',
  false, -- Restrito / Acesso exclusivo via URL assinada
  10485760, -- 10MB em bytes
  ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[];

-- 2. TABELA DE CONTROLE DE COTA DE ARMAZENAMENTO POR TENANT
CREATE TABLE IF NOT EXISTS public.tenant_storage_usage (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  total_bytes_used bigint DEFAULT 0 NOT NULL,
  total_files_count integer DEFAULT 0 NOT NULL,
  last_calculated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.tenant_storage_usage ENABLE ROW LEVEL SECURITY;

-- Política de leitura: membros da organização podem ver o consumo de armazenamento
DROP POLICY IF EXISTS "tenant_storage_usage_select" ON public.tenant_storage_usage;
CREATE POLICY "tenant_storage_usage_select" ON public.tenant_storage_usage
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = tenant_storage_usage.organization_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    ) OR EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = tenant_storage_usage.organization_id
        AND o.owner_id = auth.uid()
    )
  );

-- 3. POLÍTICAS DE RLS PARA O BUCKET PÚBLICO (property-images)
-- Leitura pública irrestrita para fotos de anúncios (portais e compartilhamento)
DROP POLICY IF EXISTS "Allow public read access to property-images" ON storage.objects;
DROP POLICY IF EXISTS "property_images_public_select" ON storage.objects;
CREATE POLICY "property_images_public_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'property-images');

-- Upload / Inserção: apenas membros ativos do tenant proprietário do caminho tenants/<orgId>/...
DROP POLICY IF EXISTS "Allow authenticated users to upload to property-images" ON storage.objects;
DROP POLICY IF EXISTS "property_images_tenant_insert" ON storage.objects;
CREATE POLICY "property_images_tenant_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'property-images' AND
    (
      -- Formato esperado: tenants/<orgId>/...
      ((storage.foldername(name))[1] = 'tenants' AND EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id::text = (storage.foldername(name))[2]
          AND om.user_id = auth.uid()
          AND om.status = 'active'
      )) OR
      -- Formato legado de compatibilidade: users/<userId>/...
      ((storage.foldername(name))[1] = 'users' AND (storage.foldername(name))[2] = auth.uid()::text)
    )
  );

-- Atualização e Remoção no bucket property-images restrito ao tenant
DROP POLICY IF EXISTS "Allow authenticated users to delete own property-images" ON storage.objects;
DROP POLICY IF EXISTS "property_images_tenant_delete" ON storage.objects;
CREATE POLICY "property_images_tenant_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'property-images' AND
    (
      ((storage.foldername(name))[1] = 'tenants' AND EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id::text = (storage.foldername(name))[2]
          AND om.user_id = auth.uid()
          AND om.status = 'active'
      )) OR
      ((storage.foldername(name))[1] = 'users' AND (storage.foldername(name))[2] = auth.uid()::text)
    )
  );

-- 4. POLÍTICAS DE RLS PARA O BUCKET PRIVADO (private-documents)
-- NENHUMA LEITURA PÚBLICA PERMITIDA!
DROP POLICY IF EXISTS "private_documents_public_select" ON storage.objects;

-- Leitura restrita: exclusivamente membros ativos da organização do caminho tenants/<orgId>/...
DROP POLICY IF EXISTS "private_documents_tenant_select" ON storage.objects;
CREATE POLICY "private_documents_tenant_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'private-documents' AND
    (storage.foldername(name))[1] = 'tenants' AND
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id::text = (storage.foldername(name))[2]
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

-- Upload no bucket privado restrito ao tenant
DROP POLICY IF EXISTS "private_documents_tenant_insert" ON storage.objects;
CREATE POLICY "private_documents_tenant_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'private-documents' AND
    (storage.foldername(name))[1] = 'tenants' AND
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id::text = (storage.foldername(name))[2]
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

-- Remoção no bucket privado restrito a proprietários e administradores do tenant
DROP POLICY IF EXISTS "private_documents_tenant_delete" ON storage.objects;
CREATE POLICY "private_documents_tenant_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'private-documents' AND
    (storage.foldername(name))[1] = 'tenants' AND
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id::text = (storage.foldername(name))[2]
        AND om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    )
  );

-- 5. FUNÇÃO PARA ATUALIZAR CONSUMO DE COTA DE ARMAZENAMENTO
CREATE OR REPLACE FUNCTION public.sync_tenant_storage_usage(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bytes bigint;
  v_count integer;
BEGIN
  SELECT
    COALESCE(SUM((metadata->>'size')::bigint), 0),
    COUNT(*)
  INTO v_bytes, v_count
  FROM storage.objects
  WHERE (storage.foldername(name))[1] = 'tenants'
    AND (storage.foldername(name))[2] = p_org_id::text;

  INSERT INTO public.tenant_storage_usage (organization_id, total_bytes_used, total_files_count, updated_at)
  VALUES (p_org_id, v_bytes, v_count, now())
  ON CONFLICT (organization_id) DO UPDATE SET
    total_bytes_used = EXCLUDED.total_bytes_used,
    total_files_count = EXCLUDED.total_files_count,
    updated_at = now();
END;
$$;
