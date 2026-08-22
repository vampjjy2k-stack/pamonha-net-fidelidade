# 🌽 Pamonha Net Fiel — Cartão Fidelidade Digital

Aplicação web completa de cartão fidelidade digital para a **Pamonha Net** (Duque de Caxias, RJ).
Compre 10 pamonhas, ganhe 1 de presente — tudo controlado por QR Code, sem cartão de papel.

## Stack

- **Backend:** Node.js + Express + Mongoose (MongoDB)
- **Frontend:** HTML, CSS e JavaScript puro (sem framework)
- **Autenticação:** JWT (login por telefone + senha)
- **QR Code:** geração no backend (pacote npm `qrcode`) e leitura pela câmera no frontend
  (biblioteca `html5-qrcode`, carregada via CDN direto no `admin.html` — por ser 100% client-side,
  não entra como dependência do `package.json` do servidor)

## Estrutura de pastas

```
pamonha-net-fidelidade/
  server/           # API Node.js + Express
    models/         # User, Redemption, Stamp (histórico de carimbos)
    routes/         # auth, client, admin, qr (helper de QR Code)
    middleware/      # auth (JWT), admin (checagem de role)
    server.js
    create-admin.js # utilitário para criar a 1ª conta de admin
    package.json
    .env.example
  client/           # Frontend estático, servido pelo próprio Express
    css/style.css
    js/ (app, auth, client-dashboard, admin-dashboard, qr-scanner)
    index.html      # landing + login/cadastro
    cliente.html    # cartão fidelidade do cliente
    admin.html      # painel administrativo
  README.md
```

## 1. Rodando localmente

### 1.1. Pré-requisitos
- [Node.js](https://nodejs.org/) 18 ou superior instalado
- Uma conta gratuita no [MongoDB Atlas](https://www.mongodb.com/atlas) (passo a passo abaixo)

### 1.2. Criar o cluster gratuito no MongoDB Atlas
1. Crie uma conta em https://www.mongodb.com/atlas e crie um **Cluster gratuito (M0)**.
2. Em **Database Access**, crie um usuário de banco de dados com usuário e senha.
3. Em **Network Access**, adicione `0.0.0.0/0` (permite acesso de qualquer IP — ok para começar; restrinja depois se quiser mais segurança).
4. Em **Database → Connect → Drivers**, copie a **connection string**, algo como:
   ```
   mongodb+srv://usuario:senha@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
5. Adicione o nome do banco depois da barra, por exemplo `.../pamonha-net?retryWrites=true...`.

### 1.3. Configurar variáveis de ambiente
```bash
cd server
cp .env.example .env
```
Edite o arquivo `.env` e preencha:
```
MONGODB_URI=<sua connection string do Atlas>
JWT_SECRET=<uma string longa e aleatória — pode gerar em https://randomkeygen.com>
PORT=5000
```

### 1.4. Instalar dependências e rodar
```bash
cd server
npm install
npm run dev      # com nodemon (recarrega automático)
# ou
node server.js   # sem nodemon
```
O servidor sobe em `http://localhost:5000` e já serve o frontend (pasta `client/`) automaticamente —
não é preciso rodar nada separado para o frontend em desenvolvimento local.

### 1.5. Criar a primeira conta de admin
Por segurança, **não existe** uma rota pública para virar admin — qualquer pessoa que se cadastra
normalmente vira `client`. Use o script incluso:
```bash
cd server
node create-admin.js "21999999999" "umaSenhaForte123" "Seu Nome"
```
- Se o telefone informado já tiver uma conta, ela é **promovida** para admin.
- Se não existir, uma **nova conta admin** é criada com a senha informada.

Depois disso, acesse `http://localhost:5000`, clique em **"Sou Admin"** e faça login.

## 2. Deploy em produção

### 2.1. Backend + frontend juntos (mais simples) — Render ou Railway
Como o Express já serve os arquivos estáticos do `client/`, dá para hospedar tudo em um único serviço:

1. Suba o projeto para um repositório no GitHub.
2. No [Render](https://render.com) ou [Railway](https://railway.app), crie um novo **Web Service** apontando para o repositório.
3. Configure:
   - **Root directory:** `server`
   - **Build command:** `npm install`
   - **Start command:** `node server.js`
4. Em **Environment Variables**, adicione `MONGODB_URI`, `JWT_SECRET` e `PORT` (o Render/Railway geralmente define `PORT` automaticamente).
5. Após o deploy, rode o `create-admin.js` — no Render/Railway isso pode ser feito abrindo um "Shell" do serviço já publicado e rodando o mesmo comando da seção 1.5.

### 2.2. Frontend e backend separados — Netlify/Vercel + Render/Railway
Se preferir hospedar o frontend separadamente (ex: Netlify):
1. Suba a pasta `client/` para o Netlify ou Vercel como um site estático.
2. Suba a pasta `server/` para o Render/Railway como API.
3. Em `client/js/app.js`, troque a constante `API_BASE_URL` de `window.location.origin + '/api'`
   para a URL fixa da sua API, por exemplo:
   ```js
   const API_BASE_URL = 'https://sua-api.onrender.com/api';
   ```
4. No backend, defina a variável `CLIENT_URL` com a URL do frontend publicado, para o CORS liberar
   corretamente as requisições.

## 3. Segurança

- Senhas são armazenadas com hash `bcrypt` (salt 10) — nunca em texto puro.
- Tokens JWT expiram em 7 dias (login) e o token do QR Code expira em **5 minutos**.
- O QR Code do cliente carrega um token assinado (não o ID "cru" do usuário), então não dá para
  forjar o QR de outra pessoa.
- Rotas `/api/admin/*` exigem duas verificações: token JWT válido **e** `role === "admin"`.
- **Nunca** suba o arquivo `.env` real para um repositório público — ele já está no `.gitignore`.

## 4. Principais rotas da API

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/auth/register` | Cadastro de cliente |
| POST | `/api/auth/login` | Login (cliente ou admin) |
| GET | `/api/auth/me` | Dados do usuário logado |
| GET | `/api/client/dashboard` | Carimbos e histórico do cliente |
| POST | `/api/client/generate-qr` | Gera QR Code temporário (5 min) |
| GET | `/api/client/history` | Histórico de resgates do cliente |
| GET | `/api/admin/clients` | Lista clientes (busca, ordenação, paginação) |
| GET | `/api/admin/clients/:id` | Detalhe de um cliente |
| POST | `/api/admin/clients/:id/stamps` | Adiciona/remove carimbo |
| POST | `/api/admin/clients/:id/reset` | Zera o cartão |
| POST | `/api/admin/clients/:id/redeem` | Confirma resgate de prêmio |
| POST | `/api/admin/scan-qr` | Lê QR Code e adiciona 1 carimbo |

## 5. Licença de uso

Projeto feito sob medida para a Pamonha Net. Sinta-se livre para adaptar cores, textos e produtos
no código conforme o negócio evoluir.
