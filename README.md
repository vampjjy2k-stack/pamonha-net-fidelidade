# 🌽 Pamonha Net Fidelidade v2.0

Sistema de cartão fidelidade digital para a Pamonha Net.
Refatorado, enxuto e 100% funcional — pronto para produção.

## 📁 Estrutura de Arquivos

```
pamonha-net-fidelidade/
├── client/
│   ├── index.html          ← SPA completo (Vanilla JS, mobile-first, identidade rural)
│   └── assets/             ← Pasta reservada para imagens e fontes futuras
├── server/
│   ├── server.js           ← Ponto de entrada Express + MongoDB + fallback SPA
│   ├── package.json        ← Dependências Node.js
│   ├── .env.example        ← Template de variáveis de ambiente
│   ├── middleware/
│   │   ├── auth.js         ← Verificação JWT (protege rotas autenticadas)
│   │   └── admin.js        ← Verificação de role=admin (protege rotas administrativas)
│   ├── models/
│   │   ├── User.js         ← Schema de usuários (cliente/admin)
│   │   ├── StampHistory.js ← Schema de auditoria de carimbos
│   │   ├── Notification.js ← Schema de avisos/notificações
│   │   └── Feedback.js     ← Schema de avaliações dos clientes
│   └── routes/
│       ├── auth.js         ← Cadastro, login, perfil (/api/auth)
│       ├── client.js       ← Dashboard, QR Code, notificações, feedback (/api/client)
│       ├── admin.js        ← Gestão de clientes, notificações, avaliações (/api/admin)
│       └── qr.js           ← Geração e verificação segura de QR Code (módulo utilitário)
```

## 🚀 Como rodar

### 1. Configurar ambiente
```bash
cd server
cp .env.example .env
# Edite .env com suas credenciais MongoDB e JWT_SECRET
```

### 2. Instalar dependências
```bash
npm install
```

### 3. Criar o primeiro admin
No MongoDB, altere o role de um usuário existente para `"admin"`:
```js
db.users.updateOne({ phone: "21999999999" }, { $set: { role: "admin" } })
```

### 4. Iniciar
```bash
npm start        # produção
npm run dev      # desenvolvimento (nodemon)
```

O servidor sobe em `http://localhost:5000` e serve o frontend automaticamente.

## 🔧 Tecnologias
- **Backend:** Node.js 18+, Express 4, Mongoose 8, JWT, bcryptjs, QRCode
- **Frontend:** SPA Vanilla JS (zero build tools), CSS3 com variáveis, mobile-first
- **Banco:** MongoDB (Atlas ou local)

## 🎨 Identidade Visual
- **Amarelo Vivo:** `#FFD700` (primária — botões, selos, header)
- **Marrom Rústico:** `#5D4037` (texto, cards, QR Code)
- **Verde Palha:** `#7CB342` (sucesso, selo completo)
- **Creme:** `#FFFDE7` (fundo do cartão)

## ✅ Funcionalidades
| Módulo | Descrição |
|--------|-----------|
| Cartão Fidelidade | Grid 5×2 de selos com animação e confetti ao completar 10 |
| QR Code | Geração de token JWT temporário (5 min) para acúmulo na loja |
| Notificações | Avisos individuais ou broadcast, com marcação de lida |
| Feedback | Avaliação 1-5 estrelas + comentário opcional |
| Perfil | Edição de nome, telefone e senha |
| Painel Admin | Scan QR, +/- selos, zerar cartão, excluir histórico de selos, enviar notificações, limpar notificações em massa, gerenciar avaliações |

## 📝 Notas Técnicas
- O middleware `admin.js` foi **criado do zero** para corrigir importação quebrada no projeto original.
- O sistema de reservas e catálogo de produtos pós-compra foi **completamente removido**.
- O fallback SPA (`app.get('*')`) está no final do pipeline, após `express.static` e rotas `/api`.
- O frontend é um único arquivo HTML autocontido — sem Webpack, Vite ou dependências de build.
