# Sistema de Gestão de Aluguel

Sistema completo para imobiliárias gerenciarem carteira de aluguel: imóveis, recebimentos, despesas, repasses e relatórios financeiros.

## Estrutura do Projeto

```
imobiliaria/
├── backend/      ← API Node.js + PostgreSQL
└── frontend/     ← Interface React (Vite)
```

---

## Deploy no Railway (passo a passo)

### 1. Suba o projeto no GitHub

1. Crie um repositório no GitHub (ex: `imobiliaria`)
2. Faça upload desta pasta inteira para o repositório

### 2. Crie o projeto no Railway

1. Acesse [railway.app](https://railway.app) e faça login
2. Clique em **"New Project"**
3. Selecione **"Deploy from GitHub repo"**
4. Escolha o repositório `imobiliaria`

### 3. Configure o banco de dados

1. No projeto Railway, clique em **"+ New"** → **"Database"** → **"PostgreSQL"**
2. Aguarde o banco subir (30 segundos)
3. Clique no banco → aba **"Variables"** → copie o valor de `DATABASE_URL`

### 4. Configure o serviço Backend

1. No Railway, clique em **"+ New"** → **"GitHub Repo"** → selecione o repositório novamente
2. Na tela de configuração, defina **Root Directory** como `backend`
3. Vá em **"Variables"** e adicione:
   - `DATABASE_URL` → cole o valor copiado do banco
   - `NODE_ENV` → `production`
4. Clique em **"Deploy"**
5. Após o deploy, vá em **"Settings"** → **"Networking"** → **"Generate Domain"**
6. Copie a URL gerada (ex: `https://imobiliaria-api-xxx.railway.app`)

### 5. Configure o serviço Frontend

1. No Railway, clique em **"+ New"** → **"GitHub Repo"** → mesmo repositório
2. **Root Directory**: `frontend`
3. Vá em **"Variables"** e adicione:
   - `VITE_API_URL` → cole a URL do backend (ex: `https://imobiliaria-api-xxx.railway.app`)
4. Clique em **"Deploy"**
5. Gere o domínio do frontend também em **Settings → Networking**

### 6. Pronto! 🎉

Acesse a URL do frontend — o sistema estará online com banco de dados real.

---

## Desenvolvimento local

### Backend
```bash
cd backend
npm install
# Crie um arquivo .env com:
# DATABASE_URL=postgresql://usuario:senha@localhost:5432/imobiliaria
# NODE_ENV=development
node index.js
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# Acesse http://localhost:5173
```

---

## Variáveis de ambiente

| Serviço  | Variável       | Descrição                              |
|----------|----------------|----------------------------------------|
| Backend  | `DATABASE_URL` | String de conexão PostgreSQL (Railway) |
| Backend  | `NODE_ENV`     | `production`                           |
| Frontend | `VITE_API_URL` | URL completa do backend no Railway     |
