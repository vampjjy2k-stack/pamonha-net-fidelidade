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

## 2. Repositório no GitHub

O repositório `vampjjy2k-stack/pamonha-net-fidelidade` já existe. O conteúdo antigo será substituído pelo projeto desta pasta, mantendo esta estrutura:

```text
client/
server/
README.md
.gitignore
```

Não coloque arquivos `.env` nem a URI do MongoDB no repositório. O arquivo `.gitignore` já bloqueia esses segredos.

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

## O que foi feito e o que falta

O projeto foi revisado, o repositório antigo foi substituído e a instalação do backend foi validada. A criação da conta e do cluster no MongoDB Atlas, bem como a criação do serviço no Render, exigem que você faça login nessas plataformas. Durante essas etapas, não envie a `MONGODB_URI` nem o `JWT_SECRET` em mensagens, commits ou screenshots.
