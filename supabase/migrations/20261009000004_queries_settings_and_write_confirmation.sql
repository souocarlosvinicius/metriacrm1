-- ==============================================================================
-- METRIA CRM - MIGRATION INCREMENTAL (ETAPA 5)
-- Consultas, Configurações Comerciais e Confirmação Transacional de Gravações
-- ==============================================================================

-- 1. GARANTIR COLUNAS DE CONFIGURAÇÃO COMERCIAL EM PROFILES
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "defaultCommissionPercent" numeric DEFAULT 5;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "pipelineStages" text[] DEFAULT ARRAY[
  'Novo lead', 'Primeiro contato', 'Em atendimento', 'Imóvel enviado',
  'Visita agendada', 'Visita realizada', 'Proposta enviada', 'Em negociação',
  'Documentação', 'Contrato', 'Fechado', 'Perdido'
];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "leadSources" text[] DEFAULT ARRAY[
  'Indicação', 'Instagram', 'Facebook', 'OLX', 'Portal Imobiliário',
  'Placa', 'WhatsApp', 'Tráfego Pago', 'Outro'
];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "messageTemplates" jsonb DEFAULT '{}'::jsonb;

-- 2. PROTEÇÃO DE CAMPOS DE AUTORIDADE EM PROFILES CONTRA MODIFICAÇÃO ARBITRÁRIA
-- Impede que usuários alterem 'id', escalonem 'current_role' ou forjem organização padrão
CREATE OR REPLACE FUNCTION public.protect_profile_authority_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Se o comando for executado por usuário autenticado comum via PostgREST/RLS
  IF auth.uid() IS NOT NULL AND auth.role() = 'authenticated' THEN
    -- 1. O ID é estritamente imutável
    NEW.id := OLD.id;

    -- 2. O e-mail no perfil de exibição não é credencial de login
    -- Credenciais são alteradas estritamente via Supabase Auth
    IF NEW.email IS DISTINCT FROM OLD.email AND NEW.email IS NOT NULL THEN
      -- Preserva o e-mail oficial confirmado do auth.users
      SELECT email INTO NEW.email FROM auth.users WHERE id = OLD.id;
    END IF;

    -- 3. "current_role" e role só podem ser alterados por RPCs/triggers autorizados (SECURITY DEFINER)
    IF NEW."current_role" IS DISTINCT FROM OLD."current_role" THEN
      NEW."current_role" := OLD."current_role";
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      NEW.role := OLD.role;
    END IF;

    -- 4. default_organization_id não pode ser alterado arbitrariamente sem ser membro ativo
    IF NEW.default_organization_id IS DISTINCT FROM OLD.default_organization_id AND NEW.default_organization_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = NEW.default_organization_id
          AND user_id = OLD.id
          AND status = 'active'
      ) THEN
        NEW.default_organization_id := OLD.default_organization_id;
      END IF;
    END IF;
  END IF;

  NEW."updatedAt" := timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_authority ON public.profiles;
CREATE TRIGGER trg_protect_profile_authority
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_authority_fields();

-- 3. RPC TRANSACIONAL APPEND-ONLY PARA HISTÓRICO DE LEADS / CLIENTES
-- Garante que histórico nunca seja perdido por read-modify-write ou substituído pelo navegador
CREATE OR REPLACE FUNCTION public.append_client_history_event(
  p_client_id uuid,
  p_type text,
  p_description text,
  p_user_name text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_client_rec record;
  v_actor_name text;
  v_new_event jsonb;
  v_now_iso text := timezone('utc'::text, now())::text;
  v_event_id text := substr(md5(random()::text), 1, 9);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autorizado: usuário não autenticado';
  END IF;

  -- 1. Busca o cliente e valida existência
  SELECT id, "userId", organization_id, assigned_to, history
  INTO v_client_rec
  FROM public.clients
  WHERE id = p_client_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado';
  END IF;

  -- 2. Valida permissão de acesso
  IF v_client_rec.organization_id IS NOT NULL THEN
    IF NOT public.is_org_member(v_client_rec.organization_id) THEN
      RAISE EXCEPTION 'Acesso negado: vínculo inativo ou ausente na organização';
    END IF;
    -- Se corretor comum, deve estar atribuído ou ser criador
    IF NOT public.is_org_manager_or_higher(v_client_rec.organization_id)
       AND v_client_rec.assigned_to != v_user_id
       AND v_client_rec."userId" != v_user_id THEN
      RAISE EXCEPTION 'Apenas o corretor responsável ou gestores podem registrar eventos neste lead';
    END IF;
  ELSE
    IF v_client_rec."userId" != v_user_id THEN
      RAISE EXCEPTION 'Acesso negado ao cliente legado';
    END IF;
  END IF;

  -- 3. Define nome do ator confiável
  IF p_user_name IS NOT NULL AND length(trim(p_user_name)) > 0 THEN
    v_actor_name := trim(p_user_name);
  ELSE
    SELECT COALESCE(name, username, 'Corretor')
    INTO v_actor_name
    FROM public.profiles
    WHERE id = v_user_id;
  END IF;

  -- 4. Cria evento padronizado
  v_new_event := jsonb_build_object(
    'id', v_event_id,
    'type', COALESCE(p_type, 'note'),
    'date', v_now_iso,
    'description', p_description,
    'userName', COALESCE(v_actor_name, 'Corretor')
  );

  -- 5. Gravação append-only na tabela history_events
  INSERT INTO public.history_events (
    id, "userId", "clientId", type, date, description, "userName",
    "createdAt", organization_id, assigned_to
  ) VALUES (
    gen_random_uuid(),
    v_user_id,
    p_client_id,
    COALESCE(p_type, 'note'),
    v_now_iso,
    p_description,
    COALESCE(v_actor_name, 'Corretor'),
    now(),
    v_client_rec.organization_id,
    v_client_rec.assigned_to
  );

  -- 6. Concatena atomicamente ao campo history do cliente (sem perda concorrente)
  UPDATE public.clients
  SET
    history = COALESCE(history, '[]'::jsonb) || jsonb_build_array(v_new_event),
    updated_at = now()
  WHERE id = p_client_id;

  RETURN json_build_object(
    'success', true,
    'event', v_new_event
  );
END;
$$;

REVOKE ALL ON FUNCTION public.append_client_history_event(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_client_history_event(uuid, text, text, text) TO authenticated, service_role;

-- 4. CONFIRMAÇÃO DO DESTINO CONSISTENTE DE TAREFAS NA EXCLUSÃO DO CLIENTE
-- Garante que delete_client_cascade sempre remove tarefas dependentes (sem órfãs)
CREATE OR REPLACE FUNCTION public.delete_client_cascade(p_client_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_client_owner uuid;
  v_client_org uuid;
  v_client_assigned_to uuid;
  v_user_role text;
  v_is_authorized boolean := FALSE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT "userId", organization_id, assigned_to
  INTO v_client_owner, v_client_org, v_client_assigned_to
  FROM public.clients
  WHERE id = p_client_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client not found';
  END IF;

  IF v_client_org IS NOT NULL THEN
    SELECT role INTO v_user_role
    FROM public.organization_members
    WHERE organization_id = v_client_org
      AND user_id = v_user_id
      AND status = 'active';

    IF v_user_role IS NULL THEN
      RAISE EXCEPTION 'Access denied: user not active in organization';
    END IF;

    IF v_user_role IN ('owner', 'admin', 'manager') OR v_client_assigned_to = v_user_id OR v_client_owner = v_user_id THEN
      v_is_authorized := TRUE;
    END IF;
  ELSE
    IF v_client_owner = v_user_id THEN
      v_is_authorized := TRUE;
    END IF;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Access denied: insufficient permissions to delete client';
  END IF;

  -- Exclusão atômica em cascata: desvincula imóveis e remove tarefas/visitas/propostas
  UPDATE public.properties
  SET "ownerId" = NULL
  WHERE "ownerId" = p_client_id;

  DELETE FROM public.tasks WHERE "clientId" = p_client_id;
  DELETE FROM public.visits WHERE "clientId" = p_client_id;
  DELETE FROM public.proposals WHERE "clientId" = p_client_id;
  DELETE FROM public.history_events WHERE "clientId" = p_client_id;
  DELETE FROM public.clients WHERE id = p_client_id;

  RETURN json_build_object(
    'success', true,
    'deletedId', p_client_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_client_cascade(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_client_cascade(uuid) TO authenticated, service_role;

-- Notificar recarregamento do schema
NOTIFY pgrst, 'reload schema';
