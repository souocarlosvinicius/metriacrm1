# Metria CRM

**Metria CRM** é um sistema completo de gestão de relacionamento com o cliente (CRM) desenvolvido sob medida para corretores de imóveis autônomos e imobiliárias de médio porte. Projetado com uma interface focada na usabilidade e abordagem mobile-first, ele consolida em uma única tela todas as ferramentas cruciais para a rotina de vendas imobiliárias.

O projeto utiliza **Supabase (PostgreSQL)** como banco de dados principal de persistência durável e **Gemini AI** como assistente inteligente de vendas.

---

## 🚀 Funcionalidades Principais

- **Dashboard Comercial Inteligente**: Visão geral de comissões estimadas, taxa de conversão do pipeline, tarefas do dia, visitas agendadas e propostas em análise.
- **Gestão de Imóveis**: Cadastro detalhado de propriedades para Venda ou Locação, controle de status (Disponível, Reservado, Em Negociação) e especificações estruturais.
- **Funil de Vendas (Pipeline)**: Kanban interativo estruturado em colunas estratégicas de atendimento (Novo, Em Atendimento, Visita Agendada, Proposta, Contrato, Ganho e Perdido).
- **Clientes e Leads**: Cadastro unificado de contatos PF/PJ, histórico detalhado de interações (trilha de auditoria) e qualificações específicas.
- **Agenda de Tarefas**: Sistema de follow-up diário por prioridade com assistente de lembretes.
- **Visitas e Propostas**: Módulo para agendar vistorias/visitas físicas, colher feedbacks estruturados e controlar o fluxo financeiro de propostas de compra ou locação.
- **Gestão de Equipes (Multitenancy)**: Suporte a agências imobiliárias com criação de organizações, convite de corretores por e-mail, controle de permissões e transferência de leads entre membros da equipe.
- **Modo de Demonstração Isolado**: Permite que usuários e avaliadores conheçam todo o fluxo do sistema com dados fictícios ricos, rodando de forma 100% offline (utilizando `localStorage` local) e isolada das tabelas e do banco de dados real.
- **Motor de IA (Gemini)**: Geração automatizada de descrições persuasivas para imóveis (formatos profissional, whatsapp ou portais imobiliários) e recomendação algorítmica de próximas melhores ações comerciais (*Next Best Actions*).

---

## 🛠️ Arquitetura e Tecnologias

- **Frontend**: React (v19) com Vite, TypeScript, Tailwind CSS, Lucide React (ícones), Motion (animações). Comunica-se diretamente com o **Supabase** para dados duráveis e autenticação de usuários reais.
- **Backend (Express)**: Utilizado para prover rotas seguras de inteligência artificial (Gemini SDK) e proxy de status do sistema, sem expor chaves sensíveis ao navegador.
- **Banco de Dados & Autenticação**: **Supabase** (PostgreSQL) com suporte a múltiplos inquilinos (Multi-tenant), Políticas de Segurança em Nível de Linha (RLS) e funções em SQL (como remoção em cascata).

---

## 📋 Variáveis de Ambiente (`.env`)

Para o correto funcionamento do sistema, configure um arquivo `.env` na raiz do projeto com base no arquivo `.env.example`:

```env
# Define o ambiente de execução (development | production)
NODE_ENV=development

# URL base onde o frontend do projeto está rodando
APP_URL=http://localhost:3000

# Porta de rede reservada para a inicialização do servidor
PORT=3000

# Chave secreta da API do Google Gemini para recursos inteligentes de redação e Next Best Actions
GEMINI_API_KEY=your_gemini_api_key_here

# Configurações do Supabase (Acesse o painel do Supabase -> Project Settings -> API)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_public_key_here

# Chave de acesso administrativo do Supabase (Apenas backend - NUNCA expor no frontend!)
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

---

## 📦 Como Instalar e Rodar Localmente

### Pré-requisitos
- Node.js (versão 18 ou superior)
- NPM ou Yarn

### Passo a Passo

1. **Clonar e acessar o repositório**:
   ```bash
   git clone <URL_DO_REPOSITORIO>
   cd metria-crm
   ```

2. **Instalar as dependências**:
   ```bash
   npm install
   ```

3. **Configurar as variáveis de ambiente**:
   Crie um arquivo `.env` na raiz do projeto copiando as definições do `.env.example` e preencha com suas chaves reais:
   ```bash
   cp .env.example .env
   ```

4. **Rodar o Schema de Banco de Dados**:
   - Acesse o painel do seu projeto no **Supabase**.
   - Vá em **SQL Editor** -> **New Query**.
   - Cole o conteúdo integral do arquivo `supabase/schema.sql`.
   - Clique em **Run** para criar as tabelas, índices, triggers e funções necessárias.

5. **Iniciar o servidor de desenvolvimento**:
   ```bash
   npm run dev
   ```
   *O projeto estará disponível em seu navegador no endereço: [http://localhost:3000](http://localhost:3000)*

6. **Compilar para produção**:
   ```bash
   npm run build
   ```

7. **Iniciar servidor compilado em produção**:
   ```bash
   npm run start
   ```

---

## 🧪 Como Testar o Sistema

### 1. Testando o Modo de Demonstração (Sem Banco de Dados)
- Na tela inicial, clique no botão **"Ver demonstração"**.
- O sistema iniciará imediatamente no **Modo Demonstração**. Um banner dourado persistente no topo indicará esse estado.
- Sinta-se à vontade para navegar pelas abas, cadastrar tarefas, criar leads, adicionar imóveis e simular a movimentação no Kanban.
- **Isolamento**: Todas as alterações são armazenadas exclusivamente no `localStorage` do seu navegador. Nada é enviado ao Supabase real.

### 2. Criando uma Conta Real e Fazendo Onboarding
- Na tela inicial, clique em **"Cadastre-se"** ou em **"Começar Agora"** no topo da Landing Page.
- Preencha o formulário com seus dados reais para se registrar via Supabase Auth.
- Após o registro com sucesso, você será direcionado para o fluxo de **Onboarding**.
- Nele, você escolherá o tipo de atuação (Corretor Autônomo ou Agência Imobiliária):
  - **Corretor Autônomo**: Uma organização pessoal privada é criada automaticamente em segundo plano para isolar seus leads.
  - **Agência / Imobiliária**: Permite registrar o nome da imobiliária e CRECI Jurídico para dar início a um ambiente colaborativo de equipe.

### 3. Testando Clientes e Pipeline
- Vá para a aba **Clientes** e adicione um novo lead.
- Navegue para a aba **Pipeline (Funil de Vendas)** e arraste o lead de coluna em coluna para simular o ciclo de vendas (de *Novo* até *Ganho/Perdido*).
- Nas ações do lead, adicione anotações de histórico para acompanhar a trilha de auditoria e interações.

### 4. Testando o Painel de Equipe (Imobiliária)
- Se você escolheu o perfil de "Imobiliária/Agência" ou configurou uma organização ativa na aba de Configurações, você terá acesso à aba **Equipe**.
- **Convidar Corretores**: Envie um convite digitando o nome e o e-mail do seu colega corretor. O sistema gera um link e token de acesso seguro que o novo corretor pode usar para se cadastrar e se vincular instantaneamente à sua organização.
- **Transferência de Leads**: Gerentes e Proprietários da imobiliária podem transferir a responsabilidade e os leads de um corretor para outro de forma segura através da interface.

### 5. Exclusão Real e Integridade do Banco (Cascading)
- Quando você exclui um cliente do banco real no Supabase, é fundamental que as tarefas, visitas, propostas e registros de histórico vinculados a ele também sejam apagados para evitar registros órfãos e falhas de integridade.
- Para isso, o sistema implementa uma função remota do Postgres (RPC) chamada `delete_client_cascade`.
- **Como testar**: Crie um cliente real, agende tarefas e visitas para ele. Ao clicar em "Excluir" na aba de Clientes, a interface executará o método RPC `delete_client_cascade(p_client_id)` no Supabase, removendo o lead e limpando todas as tabelas relacionadas em uma transação única e segura.
