# Thunder Fang Energy

E-commerce demonstrativo desenvolvido por **[Gabriel Finzetto](https://github.com/Gabriel-Finzetto)**. Reúne identidade visual própria, catálogo multilíngue, apresentação de produtos em 3D, carrinho persistente, autenticação e pedidos privados em uma aplicação full stack.

**[Acessar a demonstração](https://thunder-fang.vercel.app/pt-BR)**

O projeto simula uma loja de bebidas energéticas. **Não realiza cobranças nem envia produtos.** Use dados fictícios ao explorar o checkout.

## Funcionalidades

- Catálogo com quatro sabores, fichas de produto e apresentação 3D com alternativa estática.
- Interface em português, inglês, espanhol e chinês simplificado; valores em reais.
- Carrinho sincronizado entre abas, edição de quantidades e recuperação temporária de remoções.
- Checkout com Brasil, Estados Unidos, Espanha e China; frete e totais recalculados no servidor.
- Cadastro, confirmação de e-mail, login, recuperação de senha e encerramento de sessão.
- Área da conta com perfil, entrega padrão, compra rápida e pedidos atualizados por canal privado.
- Até cinco pedidos ativos por conta, com expiração de 24 horas e exclusão permanente.
- Central de ajuda e contato por e-mail.
- Layout adaptável, navegação por teclado e respeito à preferência de movimento reduzido.

## Tecnologias

| Camada | Tecnologias |
| --- | --- |
| Aplicação | Next.js App Router, React, TypeScript |
| Interface | CSS Modules, Motion, Three.js |
| Contratos e regras | Zod, valores monetários em centavos, revisão assinada com HMAC |
| Persistência | PostgreSQL, Supabase Auth e Realtime |
| E-mail | Brevo: SMTP de autenticação e API de contato |
| Verificação | Vitest, Playwright, testes SQL e integração HTTP |

## Como reproduzir o projeto

### Requisitos

- **Node.js 24** e npm.
- Git para clonar o repositório, ou o arquivo ZIP baixado pelo GitHub.
- Para a experiência completa: um projeto Supabase próprio e configuração de e-mail.

### 1. Obter e instalar

```sh
git clone https://github.com/Gabriel-Finzetto/Full-Stack-Thunder-Fang.git
cd Full-Stack-Thunder-Fang
npm ci
```

O `package-lock.json` faz parte da entrega e fixa a instalação. Dependências, build, credenciais e resultados de testes são gerados localmente.

### 2. Criar a configuração local

Copie `.env.example` para `.env.local`:

```sh
# macOS / Linux
cp .env.example .env.local
```

```powershell
# Windows PowerShell
Copy-Item .env.example .env.local
```

Escolha uma das formas de execução:

| Modo | Configuração | Disponível |
| --- | --- | --- |
| Exploração local | `BACKEND_LOCAL_MODE=true`; deixe `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` vazios | Interface, catálogo local, carrinho e cotações demonstrativas |
| Integração completa | `BACKEND_LOCAL_MODE=false`; configure seu Supabase, segredo de revisão e Brevo | Autenticação, perfil, persistência de pedidos, Realtime e e-mails |

Em ambos os modos, mantenha `NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000`. Para gerar o segredo de revisão:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copie o resultado para `BACKEND_REVIEW_SECRET` em `.env.local`. O modo de exploração é restrito ao computador local e não cria contas, pedidos ou mensagens fictícias. Serviços não configurados apresentam indisponibilidade explícita. Veja o [guia de configuração](docs/CONFIGURACAO.md) para habilitar as integrações.

### 3. Iniciar

```sh
npm run dev
```

Abra **[http://127.0.0.1:3000/pt-BR](http://127.0.0.1:3000/pt-BR)**. Os demais idiomas usam `/en`, `/es` e `/zh-Hans`. Use o mesmo host durante login, confirmação e recuperação para preservar os cookies.

### 4. Verificar e gerar a versão de produção

```sh
npm run check
npm test
npm run build
npm run start
```

Encerre o servidor de desenvolvimento antes de iniciar a versão de produção na mesma porta. O build prepara as texturas 3D a partir dos arquivos incluídos no projeto.

## Testes

| Comando | Finalidade |
| --- | --- |
| `npm run check` | Verificar os tipos TypeScript |
| `npm test` | Executar regras de negócio, contratos, autenticação e segurança |
| `npm run test:browser` | Conferir navegação e layout nos projetos de navegador configurados |
| `npm run test:privacy` | Exercitar isolamento da interface com serviços interceptados |
| `npm run build` | Validar a compilação de produção |
| `npm run licenses` | Atualizar os avisos de dependências e recursos distribuídos |

Os testes de navegador precisam dos executáveis do Playwright. Instale-os com `npx playwright install` e consulte [operação e validação](docs/OPERACAO.md) para os requisitos e os testes de integração que criam registros temporários.

## Estrutura

```text
src/app/          páginas, layouts e rotas HTTP
src/components/   componentes compartilhados e apresentação dos produtos
src/features/     conta, carrinho e checkout
src/domain/       regras de preço, entrega e catálogo
src/contracts/    tipos e validação dos contratos
src/server/       autenticação, serviços e acesso aos provedores
src/i18n/         idiomas e mensagens
public/           imagens e recursos estáticos
supabase/         migrações e testes SQL
tests/            testes automatizados
scripts/          preparo de recursos e verificações de integração
docs/             documentação técnica e operacional
```

## Documentação

- [Configuração e reprodução das integrações](docs/CONFIGURACAO.md)
- [Arquitetura e decisões técnicas](docs/ARQUITETURA.md)
- [Contratos da API](docs/API.md)
- [Segurança e privacidade](docs/SEGURANCA.md)
- [Operação, testes e publicação](docs/OPERACAO.md)
- [Licenças e condições dos materiais](docs/LICENCAS.md)

## Escopo e autoria

Concepção e desenvolvimento: **Gabriel Finzetto** — [GitHub](https://github.com/Gabriel-Finzetto) · [LinkedIn](https://www.linkedin.com/in/gabriel-finzetto).

A aplicação é um projeto de portfólio. Pagamentos, emissão fiscal, logística e atendimento comercial não fazem parte do escopo. Os termos dos materiais e das dependências estão descritos na documentação de licenças.
