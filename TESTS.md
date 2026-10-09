# Metria CRM - Checklist Final de Testes Manuais

Este documento consolida o plano de testes manuais para homologação do **Metria CRM** antes do seu lançamento comercial em fase de produção. Siga cada um dos cenários descritos abaixo para garantir que todas as correções de segurança, isolamento e usabilidade estão em perfeito funcionamento.

---

## 🔐 1. Módulo de Autenticação e Sessão Real

Este teste garante o funcionamento seguro do fluxo de registro, login e persistência da sessão real através do cliente Supabase Auth integrado com validação ativa no backend.

- [ ] **Cadastro de Novo Usuário (Sign Up)**:
  - Acesse a Landing Page e clique em **"Cadastre-se"**.
  - Tente cadastrar um usuário com campos vazios (deve falhar com avisos amigáveis).
  - Preencha dados válidos e registre uma conta.
  - *Resultado esperado*: Se a confirmação de e-mail estiver habilitada, o sistema notifica o usuário para confirmar sua caixa postal sem erro indevido. Se a sessão imediata for retornada, o sistema redireciona diretamente para o onboarding.

- [ ] **Validação do Fluxo de Onboarding**:
  - Responda às perguntas do Onboarding (Foco em Vendas/Locação, Cidade Primária, etc.).
  - Salve as configurações.
  - *Resultado esperado*: A criação da organização e do primeiro proprietário ocorre de forma atômica e validada (via RPC `create_organization_with_owner`), e os dados de perfil do usuário são sincronizados com precisão.

- [ ] **Persistência de Sessão e Segurança de Tokens**:
  - Com a conta real ativa, abra o console de desenvolvedor do navegador (F12) e inspecione o armazenamento do navegador.
  - *Resultado esperado*: **Tokens sensíveis não devem ser expostos em logs de telemetria ou console**. O cache de perfil não confunde a validade da sessão com dados desatualizados.
  - Pressione `F5` para recarregar a página.
  - *Resultado esperado*: O sistema revalida a sessão ativa via Supabase Auth chamando o endpoint `/api/auth/me` e mantém o usuário conectado de forma confiável.

- [ ] **Logout Seguro**:
  - Clique no menu de perfil do usuário e selecione **"Sair da Conta"**.
  - *Resultado esperado*: O sistema chama `signOut` no Supabase Auth, encerra a sessão, limpa o estado interno do React e cache local e redireciona de volta para a Landing Page. Se tentar acessar rotas protegidas sem sessão, deve receber `401 Unauthorized`.

---

## 🚀 2. Módulo de Demonstração Isolado (Modo Demo)

Este teste garante que o modo de simulação/demonstração opera de forma estritamente isolada do banco de dados real e das sessões reais.

- [ ] **Iniciando o Modo Demonstração**:
  - Na tela de login, clique no botão profissional **"Ver Demonstração"**.
  - *Resultado esperado*: O sistema inicia imediatamente, exibindo um **Banner Dourado Persistente** no topo indicando que o "Modo Demonstração" está ativo.
  - Não são solicitados e nem preenchidos campos de senha/usuário padrão previsíveis como "vega / 123".

- [ ] **Isolamento Total dos Dados de Demonstração**:
  - Com o Modo Demonstração ativo, adicione um novo imóvel (ex: "Loft de Teste Demo") e um novo lead (ex: "Cliente Teste Demo").
  - Altere a etapa de um lead no Kanban para "Contrato".
  - Abra o banco de dados real ou inspecione as requisições de rede.
  - *Resultado esperado*: Todos os dados de demonstração devem ser gravados estritamente em chaves personalizadas no `localStorage` (`demo_properties`, `demo_clients`, etc.) através do interceptor local. Nenhuma operação de gravação ou alteração é enviada para o banco real.

- [ ] **Sair da Demonstração**:
  - No banner superior ou no menu de configurações, clique em **"Sair da demonstração"**.
  - *Resultado esperado*: O estado é limpo, o banner dourado desaparece e a tela inicial de autenticação/landing page é recarregada de forma limpa.

---

## 👥 3. Teste Multiusuário e Isolamento de Dados

Este teste certifica que dados confidenciais de um corretor jamais serão vazados para outro corretor real no sistema.

- [ ] **Cadastro de Dois Usuários Diferentes**:
  - Crie a Conta **Corretor A** (ex: `corretor_a`) e cadastre o lead "Ana Maria" e o imóvel "Apartamento A".
  - Faça logout.
  - Crie a Conta **Corretor B** (ex: `corretor_b`) e cadastre o lead "Bruno Neves" e o imóvel "Cobertura B".

- [ ] **Validação de Privacidade das Listas (GET)**:
  - Logado como **Corretor B**:
  - *Resultado esperado*: Apenas o lead "Bruno Neves" e o imóvel "Cobertura B" devem constar nas telas de Clientes e Imóveis. O "Apartamento A" e o lead "Ana Maria" do Corretor A devem estar totalmente invisíveis.

- [ ] **Segurança de Updates/Deletes via Requisições Diretas**:
  - Tente enviar uma requisição PUT ou DELETE direta para o backend visando o ID do imóvel do Corretor A utilizando a sessão ativa do Corretor B.
  - *Resultado esperado*: O backend deve retornar `404 Not Found` (ou `403 Forbidden`) e recusar a alteração, garantindo isolamento absoluto de dados no nível do servidor (via cláusula `{ _id, userId }` obrigatória em todas as queries).

---

## 💼 4. Módulo de CRM e Inteligência Artificial

Este teste garante o bom funcionamento de filtros e integrações do sistema.

- [ ] **Filtros Resilientes a Valores Nulos**:
  - Importe ou cadastre um lead que possua telefone, e-mail ou observações vazias (ou nulas).
  - Tente filtrar ou buscar por termos textuais na caixa de buscas.
  - *Resultado esperado*: O aplicativo deve filtrar a lista normalmente sem quebrar a tela ou gerar erros de execução como `Cannot read properties of null (reading 'toLowerCase')`.

- [ ] **Geração de Descrição por IA (Gemini)**:
  - Abra um imóvel cadastrado e clique no botão **"Gerar Descrição com IA"**.
  - *Resultado esperado*: Se `GEMINI_API_KEY` estiver configurada, o assistente retorna 3 belas versões personalizadas de descrição (Profissional, WhatsApp e Portal de Imóveis). Caso a chave não esteja definida, exibe um modal ou aviso amigável explicando a necessidade da chave de forma limpa, sem quebrar o sistema.

- [ ] **Painel de Melhores Ações Recomendadas (Next Best Actions)**:
  - Acesse o Dashboard.
  - *Resultado esperado*: O sistema analisa os leads sem contato, propostas pendentes ou tarefas atrasadas e exibe cartões dinâmicos sugerindo a ação ideal a ser tomada. Clicar no botão correspondente deve criar uma tarefa de acompanhamento automática ou abrir o WhatsApp pré-configurado.

---

## 📁 5. Módulo de Arquivos e Upload de Fotos

Este teste valida a segurança no upload de imagens no cadastro de imóveis.

- [ ] **Upload de Imagens Válidas**:
  - Acesse o cadastro de Imóveis, selecione adicionar um novo imóvel e arraste ou selecione uma foto real (formato `.jpg`, `.png` ou `.webp`) com tamanho inferior a 10MB.
  - *Resultado esperado*: O arquivo é compactado localmente pelo canvas do frontend, enviado ao servidor e renderizado perfeitamente na listagem de fotos do imóvel.

- [ ] **Bloqueio de Arquivos Executáveis ou Muito Grandes**:
  - Tente fazer upload de um arquivo com extensão executável (ex: `.exe`, `.js`, `.sh`, `.php`) ou de uma imagem com tamanho superior a 10MB.
  - *Resultado esperado*: O sistema deve recusar o upload imediatamente no frontend ou backend, exibindo uma mensagem de validação clara (ex: `"Tipo de arquivo não permitido"` ou `"Tamanho máximo excedido"`), sem aceitar o arquivo e sem gerar erros de servidor.

---

## 🛡️ 6. Testes Automatizados da Etapa 7 (Arquivos, CSV, Logs e Sentry)

Execução completa:
```bash
npx tsx tests/step7_storage_csv_logs_sentry.test.ts
```

- [x] **Cenário 1: Upload Direto e Inválido (Magic Bytes, MIME e Tamanho)**:
  - Validação de cabeçalho binário real (JPEG, PNG, WEBP, PDF) via Magic Bytes.
  - Rejeição de arquivo com MIME falso (ex: declara `image/jpeg` mas contém HTML/script).
  - Rejeição de arquivos que excedem limites confiáveis (5MB fotos / 10MB documentos).
  - Bloqueio de upload quando a cota de armazenamento do plano do tenant é excedida.

- [x] **Cenário 2: Acesso Privado entre Tenants e Separação de Mídias**:
  - Fotos de anúncios no bucket público `property-images` sob caminho do tenant (`tenants/<orgId>/properties/...`).
  - Documentos confidenciais no bucket privado `private-documents` acessíveis apenas via URL assinada temporária.
  - Bloqueio cross-tenant: membros de outro tenant recebem `403 Forbidden` ao solicitar URL assinada.
  - Detecção e limpeza de arquivos órfãos não associados a imóveis no banco de dados.

- [x] **Cenário 3: CSV e Neutralização de Injeção de Fórmulas (Formula Injection)**:
  - Células textuais iniciadas por `=`, `+`, `-`, `@`, `\t`, `\r`, `%` neutralizadas com prefixo de apóstrofo (`'`).
  - Preservação fiel de números legítimos (ex: `350000`, `-10`, `+55`, `0`) sem apóstrofo.
  - Teste de arquivos CSV completos de clientes e imóveis com conformidade RFC 4180.

- [x] **Cenário 4: Logs Reais, Validação de Esquema, Redação e Sentry**:
  - Validação de tamanho no endpoint `/api/logs` (máx 32KB com status 413).
  - Validação de frequência (rate limit: máx 20 logs/min por IP com status 429).
  - Validação de esquema (obrigatoriedade de message, limite de caracteres e níveis válidos).
  - Redação de senhas, tokens, CPFs, e-mails, telefones e URLs de convite antes do envio.
  - Sentry `setUser` minimizado estritamente para ID pseudônimo.
  - Supressão de logs de payloads de clientes em ambiente de produção.

- [x] **Cenário 5: DSN Ausente, Healthcheck e Classificação de HTML**:
  - Sentry opcional e silencioso quando DSN está ausente.
  - Healthcheck público mínimo (`/api/health`) sem consultas pesadas de banco.
  - Diagnóstico interno detalhado (`/api/admin/diagnostic`) protegido por autenticação.
  - `apiFetch` classifica HTML estritamente por status e `Content-Type: text/html`, sem palavras genéricas de corpo JSON.
