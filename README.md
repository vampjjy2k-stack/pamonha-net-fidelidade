# 🌽 Pamonha Net Fiel — Cartão Fidelidade + Painel Admin Completo

Aplicação web da **Pamonha Net** (Duque de Caxias, RJ): cartão fidelidade digital para o cliente
e um painel administrativo completo (CRM, catálogo, notificações, pesquisa de satisfação e reservas).

## O que mudou nesta versão

Esta versão estende o app original com 5 módulos novos, todos **de verdade** (ligados ao MongoDB,
não maquete):

1. **CRM avançado** — frequência de visita, total gasto e produto preferido calculados a partir do
   histórico real de carimbos (não são números fixos). Segmentação automática do cliente
   (Premium / Regular / Risco de Churn / Novo).
2. **Catálogo de produtos** — preço e estoque editáveis pelo admin.
3. **Notificações** — para todos os clientes ou um específico, com prazo de validade opcional
   (promoção "relâmpago").
4. **Pesquisa de satisfação** — 3 perguntas fixas por estrelas, com médias e histórico no admin.
5. **Reservas de produto** — cliente reserva no app, admin gerencia status e forma de pagamento.

O frontend também foi redesenhado do zero (tipografia, paleta de cores e componentes), saindo de
um visual "carimbo de festa infantil" para um visual mais editorial e contido — mantendo o carimbo
de milho como assinatura, só que com execução mais fina.

## Como o CRM fica preciso (e por que isso importa)

Antes, o sistema só sabia "o cliente ganhou um carimbo", sem saber qual produto ou quanto ele gastou.
Agora, ao adicionar um carimbo manualmente, o admin pode (opcionalmente) informar o produto e o valor
da compra — isso é o que alimenta "total gasto" e "produto preferido" de forma real, não estimada.
Carimbos via QR Code continuam simples (1 clique, sem esses campos) — o admin usa o campo manual
quando quiser esse nível de detalhe.

## Stack

- **Backend:** Node.js + Express + Mongoose (MongoDB) + `node-cron` (job diário de segmentação)
- **Frontend:** HTML, CSS e JavaScript puro — tipografia Fraunces (títulos) + Manrope (interface) + IBM Plex Mono (dados)
- **Autenticação:** JWT (login por telefone + senha)
- **QR Code:** geração no backend (`qrcode`) e leitura pela câmera no admin (`html5-qrcode`, via CDN)

## Estrutura de pastas

```
pamonha-net-fidelidade/
  server/
    models/        User, Redemption, Stamp (histórico), Product, Notification, SurveyResponse, Reservation
    routes/        auth, client, admin, admin-products, admin-notifications, survey, reservations, qr
    middleware/     auth (JWT), admin (checagem de role)
    utils/          segmentation.js (cálculo Premium/Regular/Risco de Churn)
    jobs/           recalcularSegmentos.js (roda 1x/dia às 3h)
    server.js
    create-admin.js
    package.json / .env.example
  client/
    css/style.css
    js/ (app, auth, client-dashboard, admin-dashboard, qr-scanner)
    index.html      landing + login/cadastro
    cliente.html    cartão + notificações + reservas + pesquisa
    admin.html      painel completo (6 abas)
  README.md
```

## 1. Rodando localmente

```bash
cd server
cp .env.example .env
# edite o .env com sua MONGODB_URI e JWT_SECRET (veja instruções no arquivo)
npm install
npm run dev
```
Acesse `http://localhost:5000`. O Express já serve o frontend automaticamente.

### Criar a primeira conta de admin
```bash
node create-admin.js "21999999999" "umaSenhaForte123" "Seu Nome"
```

## 2. Redeploy no Render (atualizando o site que já está no ar)

Como você já tem o serviço publicado, atualizar é simples:

1. Substitua os arquivos do seu repositório pelos desta pasta (mantendo a mesma estrutura).
2. Faça commit e `git push` para o branch conectado ao Render — o deploy acontece automaticamente.
3. **Nenhuma variável de ambiente nova é obrigatória** — `MONGODB_URI`, `JWT_SECRET` e `PORT` continuam
   sendo as únicas. O `node-cron` já vem embutido no `npm install`, não precisa configurar nada extra.
4. Depois do deploy, os campos novos do banco (totalSpentCents, segment etc.) são preenchidos aos
   poucos, conforme os clientes usam o sistema — não precisa rodar nenhuma migração manual.

Se preferir, no painel do Render dá para forçar o recálculo de segmentação na hora (sem esperar o job
das 3h) fazendo uma chamada `POST /api/admin/recalcular-segmentos` autenticada como admin.

## 3. Sobre o upload de imagem nas notificações

Para manter o lançamento simples, o campo de imagem da notificação aceita uma **URL** (você hospeda a
imagem em qualquer lugar — Google Drive, Imgur, etc. — e cola o link), em vez de upload direto de
arquivo. Upload direto exigiria contratar um serviço de armazenamento (Cloudinary tem plano gratuito
generoso) e configurar credenciais novas — fica documentado como próximo passo abaixo.

## 4. Roadmap (pesquisado, não implementado ainda)

Baseado em como apps de fidelidade maiores resolvem isso hoje:

- **Carteira digital (Apple Wallet / Google Wallet):** em vez de só um site, o cartão vira um "passe"
  que fica na carteira do celular do cliente, com atualização automática do número de carimbos. É a
  tendência mais forte do setor, mas exige conta de desenvolvedor Apple/Google e certificados —
  vale considerar quando o número de clientes justificar o investimento.
- **Upload de imagem real** nas notificações (Cloudinary/S3), em vez de URL colada manualmente.
- **SMS/e-mail** além da notificação in-app, para clientes que não abrem o app com frequência.
- **Cupom de aniversário automático** — exigiria coletar data de nascimento no cadastro (hoje não é
  pedido, de propósito, para manter o cadastro rápido).

## 5. Segurança (sem mudanças em relação à versão anterior)

- Senhas com hash `bcrypt`. Tokens JWT expiram em 7 dias; o QR Code do cliente expira em 5 minutos.
- Rotas `/api/admin/*` exigem token JWT válido **e** `role === "admin"`.
- Excluir histórico de um cliente não apaga os carimbos atuais do cartão, só o histórico de
  resgates/carimbos — o modal de confirmação existe justamente para evitar clique acidental.

## 6. Rotas da API (resumo)

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/auth/register` \| `/login` | Cadastro / login |
| GET | `/api/client/dashboard` \| `/history` \| `/notifications` \| `/products` \| `/reservations` | Área do cliente |
| POST | `/api/client/generate-qr` \| `/reservations` \| `/survey` | Ações do cliente |
| GET | `/api/admin/stats` | KPIs da Visão Geral |
| GET/PATCH/DELETE | `/api/admin/clients/:id` \| `/clients/:id/historico` | CRM |
| POST | `/api/admin/clients/:id/stamps` \| `/reset` \| `/redeem` \| `/scan-qr` | Ações de carimbo |
| GET/POST/PATCH/DELETE | `/api/admin/products` | Catálogo |
| GET/POST | `/api/admin/notifications` | Notificações |
| GET | `/api/admin/surveys` | Respostas da pesquisa |
| GET/PATCH | `/api/admin/reservations` | Reservas |
| POST | `/api/admin/recalcular-segmentos` | Gatilho manual da segmentação |

Documentação de arquitetura mais detalhada (modelo de dados, decisões de design) em
`arquitetura-painel-admin.md`, entregue junto com o mockup anterior.
