# Guia simples de publicação — Pamonha Net Fidelidade

## O que já foi verificado

O projeto tem um frontend em `client/` e uma API em `server/`. A API usa MongoDB, JWT e Express. O comando de produção é `npm start`.

Há um detalhe importante: o arquivo `server/server.js` serve o frontend a partir de `../client`. Portanto, o repositório precisa conter **as duas pastas**, `client/` e `server/`. Não publique somente `server/`, pois a API iniciaria, mas a página poderia não abrir.

Também foi criado um `.gitignore` para não enviar `node_modules` nem arquivos `.env` com senhas.

## 1. MongoDB Atlas

1. Acesse <https://www.mongodb.com/cloud/atlas> e crie uma conta ou entre.
2. Crie um projeto, se o Atlas pedir.
3. Escolha **Build a Database** e o plano **Free / M0**.
4. Escolha um nome para o cluster e uma região próxima dos usuários. Pode aceitar as demais opções padrão.
5. Crie um usuário do banco. Anote o nome e a senha em um local seguro; essa senha não é a senha do Atlas.
6. Em **Network Access**, adicione `0.0.0.0/0` para permitir que o Render conecte. Isso é necessário neste modelo simples; use uma senha longa e exclusiva para reduzir o risco.
7. No cluster, clique em **Connect → Drivers** e copie a URI que começa com `mongodb+srv://`.
8. Substitua `<password>` pela senha do usuário do banco e acrescente o nome do banco, por exemplo `pamonha_net` antes de `?retryWrites...`.

A URI ficará parecida com esta, mas a sua será diferente:

```text
mongodb+srv://USUARIO:SENHA@cluster.xxxxx.mongodb.net/pamonha_net?retryWrites=true&w=majority
```

Não envie essa URI em mensagens públicas, commits ou screenshots.

## 2. Criar o repositório no GitHub

A conta GitHub conectada nesta sessão não tem permissão para criar repositórios automaticamente. Faça assim:

1. Acesse <https://github.com/new>.
2. Nome: `pamonha-net-fidelidade`.
3. Escolha **Private**.
4. Não marque as opções de README, `.gitignore` ou licença, pois o projeto já possui esses arquivos.
5. Clique em **Create repository**.
6. Na página seguinte, copie a URL HTTPS do repositório.
7. Envie o conteúdo da pasta do projeto, mantendo esta estrutura:

```text
client/
server/
README.md
.gitignore
```

Se usar o GitHub Desktop, escolha **Add existing repository** e selecione a pasta do projeto. Depois clique em **Publish repository**.

Se preferir o terminal, dentro da pasta do projeto execute:

```bash
git remote add origin https://github.com/SEU_USUARIO/pamonha-net-fidelidade.git
git push -u origin main
```

## 3. Criar o serviço no Render

1. Acesse <https://dashboard.render.com> e entre com GitHub.
2. Clique em **New → Web Service**.
3. Selecione o repositório `pamonha-net-fidelidade`.
4. Use estas configurações:

| Campo | Valor |
|---|---|
| Language | Node |
| Root Directory | deixe vazio — o repositório contém `client/` e `server/` |
| Build Command | `npm install --prefix server` |
| Start Command | `npm start --prefix server` |
| Instance Type | Free, se disponível |

5. Clique em **Advanced → Environment Variables** e adicione:

| Nome | Valor |
|---|---|
| `MONGODB_URI` | a URI copiada do Atlas |
| `JWT_SECRET` | uma frase aleatória forte, com pelo menos 32 caracteres |
| `CLIENT_URL` | deixe inicialmente como `*` ou use a URL do Render depois do primeiro deploy |
| `PORT` | `10000` |

O servidor já usa a porta fornecida pelo Render. Depois que o primeiro deploy terminar, copie a URL `https://...onrender.com` e troque `CLIENT_URL` por essa URL. Salve e faça um novo deploy.

6. Clique em **Create Web Service**.
7. Aguarde os logs mostrarem que o MongoDB foi conectado e que o servidor está escutando.
8. Teste `https://SUA-URL.onrender.com/api/health`. A resposta esperada contém `"status":"ok"`.
9. Abra `https://SUA-URL.onrender.com` para ver o sistema.

## 3.1 Ativar as notificações push (avisos no celular do cliente)

Gere um par próprio de chaves no seu computador com `npx web-push generate-vapid-keys`. A chave pública pode ser usada pelo navegador; a chave privada deve ficar somente nas variáveis de ambiente do Render e nunca deve entrar no GitHub:

| Nome | Valor |
|---|---|
| `VAPID_PUBLIC_KEY` | chave pública gerada pelo comando |
| `VAPID_PRIVATE_KEY` | chave privada gerada pelo comando |
| `VAPID_SUBJECT` | seu e-mail, no formato `mailto:voce@exemplo.com` |

Sem essas três variáveis, o app funciona normalmente — só que os avisos aparecem apenas dentro da aba "Avisos", sem chegar como notificação no celular.

**Importante sobre iPhone:** por regra da Apple, notificações push em site só funcionam depois que o cliente toca em "Adicionar à Tela de Início" no Safari e abre o app por esse atalho. No Android, funciona direto pelo Chrome, sem esse passo. O app já avisa o cliente sobre isso na tela "Perfil".

## 3.2 Ativar o envio de e-mail (recuperação de senha)

Sem essa parte configurada, o botão "Esqueci minha senha" não quebra, mas também não envia nada (fica registrado só no log do servidor). Para funcionar de verdade, de graça, com uma conta Gmail:

1. Ative a verificação em duas etapas na conta Gmail que vai enviar os e-mails (Configurações da Conta Google → Segurança).
2. Crie uma "senha de app" em https://myaccount.google.com/apppasswords (escolha "Outro" como aplicativo).
3. No Render, adicione as variáveis:

| Nome | Valor |
|---|---|
| `EMAIL_HOST` | `smtp.gmail.com` |
| `EMAIL_PORT` | `587` |
| `EMAIL_USER` | seu e-mail do Gmail |
| `EMAIL_PASS` | a senha de app de 16 letras (não a senha normal) |
| `EMAIL_FROM` | mesmo e-mail do `EMAIL_USER` |

Qualquer outro provedor SMTP (Zoho, Outlook, Brevo, Resend) funciona do mesmo jeito, só trocando `EMAIL_HOST`/`EMAIL_PORT`.

## 4. Criar o primeiro administrador

O cadastro normal cria usuários comuns. Para transformar um usuário em administrador, depois de ele se cadastrar, abra o Atlas:

1. Entre no cluster e abra **Browse Collections**.
2. Selecione o banco `pamonha_net` e a coleção `users`.
3. Encontre o usuário pelo telefone.
4. Edite o campo `role` de `client` para `admin`.
5. Faça logout e login novamente no sistema.

## Problemas comuns

- **Página em branco ou erro `Cannot GET /`**: o repositório não contém `client/`, ou o Root Directory foi definido como `server`. Deixe o Root Directory vazio e use os comandos com `--prefix server`.
- **Erro de conexão MongoDB**: confira usuário, senha, caracteres especiais na senha e o acesso de rede `0.0.0.0/0`.
- **Erro de JWT**: confira se `JWT_SECRET` foi criado no Render e tem pelo menos 32 caracteres.
- **Render dormindo**: no plano gratuito, o serviço pode entrar em repouso quando não recebe tráfego; o primeiro acesso depois disso pode demorar.

## O que posso fazer nesta sessão

Posso revisar os arquivos, preparar o repositório, gerar o `.gitignore`, testar a instalação e orientar cada tela. Também posso publicar no GitHub se a conta conectada tiver permissão para criar um repositório ou se você me fornecer um repositório já criado com acesso adequado.

Não consigo criar sua conta do Atlas/Render nem ver suas senhas; essas etapas precisam ser feitas por você. Nunca cole aqui a `MONGODB_URI` ou o `JWT_SECRET`.
