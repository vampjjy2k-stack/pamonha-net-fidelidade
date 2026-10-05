# 🌽 Pamonha Net Fidelidade — v10.7.1

Sistema de cartão fidelidade digital da Pamonha Net, com frontend mobile-first e backend Node.js/Express/MongoDB.

> **Versão publicada:** v10.7.1 — e-mail de recuperação de senha com Brevo, avisos rápidos e segurança de sessões.
> **Branch de produção:** `main`

## O que está publicado

- Cartão fidelidade com carimbos e histórico;
- QR Code para registrar vendas;
- Notificações no celular via Web Push;
- Rastreamento do **Carro da Pamonha**;
- Relatórios e gráficos em SVG;
- Raspadinhas com cancelamento, resgate e exclusão protegida;
- Busca de locais por nome e mapa para o administrador;
- Landing page pública e compartilhamento do cartão;
- Recuperação de senha por e-mail via **Brevo HTTP API**;
- Diagnóstico administrativo para testar o envio de e-mail;
- Troca de senha com confirmação da senha atual;
- Confirmação dupla ao redefinir a senha;
- Desconexão automática de outros aparelhos após troca ou redefinição de senha;
- Endereço da Feira: `Estr. Velha do Pilar, 408 - Chácaras Rio-Petrópolis, Duque de Caxias - RJ, 25230-610`.

## Estrutura

```text
pamonha-net-fidelidade/
├── client/
│   └── index.html          # SPA Vanilla JS, CSS e interface mobile
├── server/
│   ├── server.js           # Express, MongoDB e servidor do frontend
│   ├── package.json        # Dependências e versão do servidor
│   ├── .env.example        # Exemplo de configuração
│   ├── middleware/         # Autenticação e permissões administrativas
│   ├── models/             # Modelos MongoDB
│   ├── routes/             # Rotas de autenticação, cliente, admin e carro
│   └── utils/              # E-mail Brevo, Web Push e eventos em tempo real
└── README.md
```

## Deploy no Render

O serviço usa a raiz do repositório e executa:

```bash
npm install --prefix server
npm start --prefix server
```

O serviço deve apontar para a branch `main`.

## Variáveis obrigatórias

Configure no Render:

```text
MONGODB_URI=...
JWT_SECRET=...
CLIENT_URL=https://SEU-ENDERECO.onrender.com
```

Para recuperação de senha por e-mail via Brevo:

```text
BREVO_API_KEY=...
EMAIL_FROM=seu-remetente-verificado@dominio.com
EMAIL_FROM_NAME=Pamonha Net
```

O endereço de `EMAIL_FROM` precisa estar autorizado no Brevo. As antigas variáveis SMTP do Gmail (`EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER` e `EMAIL_PASS`) não são mais usadas pelo sistema atual.

Para notificações push, mantenha as três variáveis VAPID já configuradas:

```text
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:...
```

## Desenvolvimento local

```bash
cd server
cp .env.example .env
npm install
npm start
```

O servidor fica disponível em `http://localhost:5000` e serve o frontend automaticamente.

## Testes principais

1. **Diagnóstico de e-mail:** Administração → Mais opções → Diagnóstico.
2. **Recuperação:** solicitar link, abrir o e-mail e confirmar a nova senha duas vezes.
3. **Segurança:** trocar a senha no Perfil e confirmar que outros tokens deixam de funcionar.
4. **Raspadinhas:** uma raspadinha ativa só pode ser cancelada; usadas/canceladas podem ser excluídas após confirmação dupla.

## Histórico e backups

Backups não ficam dentro da árvore de produção. As versões anteriores estão preservadas no histórico do Git e nas branches de backup do repositório, incluindo:

- `versao-antes-v10-2026-10-04`
- `versao-antes-v9-carro-2026-10-04`
- outras branches `versao-*` existentes no GitHub.

## Tecnologias

- **Backend:** Node.js, Express, Mongoose, MongoDB Atlas, JWT, bcryptjs, Helmet;
- **Frontend:** Vanilla JavaScript, HTML e CSS, sem etapa de build;
- **E-mail:** Brevo HTTP API;
- **Notificações:** Web Push/VAPID;
- **Tempo real:** Server-Sent Events (SSE);
- **Mapas:** OpenStreetMap/Leaflet e links diretos do Google Maps.
