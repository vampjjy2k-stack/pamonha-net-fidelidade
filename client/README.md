# client/

## index.html
SPA (Single Page Application) completo em um único arquivo.

### Arquitetura
- **Router hash-based:** troca de páginas via `location.hash` sem recarregar
- **State management:** `localStorage` para token JWT e dados do usuário
- **API client:** wrapper fetch com headers automáticos e tratamento de erro
- **Mobile-first:** navegação inferior fixa, botões grandes, touch-friendly

### Telas
1. **login** — Autenticação por telefone + senha
2. **register** — Cadastro com validação de telefone BR
3. **card** — Cartão de fidelidade 5×2, QR Code, histórico de selos
4. **notifications** — Central de avisos com marcação de lida
5. **feedback** — Avaliação por estrelas + comentário
6. **profile** — Edição de dados e logout
7. **admin** — Painel administrativo completo (só visível para role=admin)

### CSS
Toda a estilização usa **CSS Variables** (`:root`) para a paleta rural.
Animações puras em CSS: `stampPop`, `fadeIn`, `pulseGlow`, `confettiFall`.
Nenhuma biblioteca de animação externa.
