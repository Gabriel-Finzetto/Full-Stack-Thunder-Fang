# Configuração

Este guia descreve a exploração local e a configuração das integrações. Use um projeto Supabase próprio e isolado para reprodução. O repositório não fornece credenciais nem acesso ao banco da demonstração publicada.

## Ambiente local

Instale Node.js 24, execute `npm ci` e copie `.env.example` para `.env.local`, conforme o [README](../README.md#como-reproduzir-o-projeto). Reinicie o processo após alterar as variáveis; valores `NEXT_PUBLIC_*` também precisam estar corretos no momento do build.

Use `http://127.0.0.1:3000` durante toda a sessão. `localhost` e `127.0.0.1` são hosts diferentes para cookies e retornos de autenticação.

## Variáveis

| Variável | Uso | Visibilidade |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Origem da aplicação, incluindo porta local | Pública |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do seu projeto Supabase | Pública |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave publicável do mesmo projeto | Pública |
| `BACKEND_LOCAL_MODE` | Habilita exploração e cotações locais restritas a loopback | Servidor |
| `BACKEND_REVIEW_SECRET` | Segredo estável para assinar revisões e marcadores de recuperação | Segredo de servidor |
| `SUPABASE_SECRET_KEY` | Chave secreta do projeto, usada pelas operações transacionais | Segredo de servidor |
| `SUPABASE_SERVICE_ROLE_KEY` | Alternativa legada à chave secreta | Segredo de servidor |
| `SUPABASE_PRODUCTION_PROJECT_REF` | Referência do projeto Supabase de produção; obrigatória nos builds hospedados | Servidor |
| `SUPABASE_PREVIEW_PROJECT_REF` | Referência do projeto Supabase de testes; obrigatória nos builds hospedados | Servidor |
| `BREVO_API_KEY` | Transporte do formulário de contato | Segredo de servidor |
| `BREVO_SENDER_EMAIL` | Remetente validado na Brevo | Servidor |
| `BREVO_SENDER_NAME` | Nome de apresentação do remetente | Servidor |

Configure apenas uma das duas chaves administrativas Supabase; `SUPABASE_SECRET_KEY` tem prioridade. Chaves administrativas e de e-mail nunca recebem prefixo `NEXT_PUBLIC_`.

Na Vercel, configure as duas referências em Preview e Production, sempre com projetos diferentes. Em cada escopo, a URL e as chaves Supabase devem corresponder ao projeto daquele ambiente. O build verifica essa correspondência e recusa o modo local. Veja [ambientes e separação de dados](OPERACAO.md#ambientes-e-separação-de-dados).

Gere `BACKEND_REVIEW_SECRET` com pelo menos 32 bytes aleatórios:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Mantenha o segredo estável entre instâncias do mesmo ambiente. Sua alteração invalida revisões e marcadores anteriores.

## Exploração sem serviços externos

Em `.env.local`, configure:

```dotenv
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
BACKEND_LOCAL_MODE=true
```

Esse modo utiliza o catálogo de desenvolvimento e permite explorar a interface, o carrinho e as cotações. Autenticação, perfil, persistência de pedidos e envio de contato continuam exigindo os serviços reais. O modo local é recusado na Vercel e em origens fora de loopback.

## Supabase para integração completa

### 1. Criar o ambiente isolado

Crie um projeto Supabase dedicado a esta instalação. Em seguida, obtenha a URL, a chave publicável e a chave secreta do projeto no painel. Preencha as variáveis correspondentes e defina `BACKEND_LOCAL_MODE=false`.

### 2. Aplicar o banco

Os arquivos em `supabase/migrations/` são a fonte de instalação. Em um projeto novo, execute cada arquivo uma única vez, na ordem do nome:

1. `20261028200951_thunderfang_shop_data.sql`
2. `20261028204707_thunderfang_realtime_probe_policy.sql`
3. `20261028211312_remove_unused_integration_tables.sql`
4. `20261103200002_account_default_delivery.sql`
5. `20261103200439_validate_saved_delivery_fields.sql`
6. `20261104013107_harden_legacy_rpc_and_vector_schema.sql`

Uma opção para a instalação inicial é abrir os arquivos pelo SQL Editor do painel Supabase e registrar quais foram executados. As migrações criam tabelas, catálogo de demonstração, regiões, permissões, políticas de proprietário, funções transacionais e limpeza agendada.

A instalação exige um ambiente Supabase com Auth, Realtime e a extensão `pg_cron` disponíveis. Um PostgreSQL genérico, sem os esquemas e papéis do Supabase, não é suficiente.

Use as migrações apenas em um ambiente dedicado. A migração de remoção legada se refere a tabelas de integrações antigas; não a aplique sobre um banco que contenha outras aplicações. Em instalações administradas por ferramenta de migração, mantenha o histórico registrado e não reaplique os mesmos arquivos pelo SQL Editor.

### 3. Configurar autenticação

Habilite acesso por e-mail e senha, com confirmação de e-mail. Em URL Configuration do Auth:

- Site URL local: `http://127.0.0.1:3000`.
- Redirect URL local: `http://127.0.0.1:3000/api/auth/callback**`.
- O callback da aplicação é `/api/auth/callback`, com parâmetros de idioma, retorno, fluxo e identificador PKCE.

A configuração local permite os parâmetros variáveis do retorno. Para ambiente público, configure a origem HTTPS real e restrinja a lista aos callbacks necessários, sem aceitar origens arbitrárias. Consulte [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

A confirmação válida retorna ao carrinho no idioma escolhido. Links com token exigem uma confirmação explícita antes da troca de sessão. Recuperação de senha usa fluxo e marcador próprios; alterar um parâmetro da URL não autoriza redefinir a senha.

### 4. Configurar e-mails de autenticação

Configure o SMTP personalizado no painel do Supabase com os dados fornecidos pela Brevo. A senha SMTP fica no provedor de autenticação; ela não é uma variável da aplicação.

Verifique remetente, limites de envio, validade dos links e o conteúdo dos templates. Desative mecanismos de rastreamento que alterem os links de confirmação e recuperação. A entrega depende da configuração do remetente e do provedor. Veja [SMTP personalizado](https://supabase.com/docs/guides/auth/auth-smtp).

## Contato pela Brevo

Preencha `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` e, opcionalmente, `BREVO_SENDER_NAME`. Esse transporte é separado do SMTP de autenticação.

O destinatário do contato está fixado no servidor em `src/server/contact.ts`. Para uma instalação própria, revise esse endereço antes de habilitar envios; o navegador não pode escolher o destinatário. Use somente uma caixa autorizada nas verificações de entrega.

O retorno HTTP 202 confirma que a Brevo aceitou a mensagem. A chegada à caixa de entrada é uma verificação separada.

## Verificação da configuração

1. Abra o catálogo e confira os quatro sabores.
2. Cadastre uma conta de teste e confirme o e-mail.
3. Confira perfil, endereço padrão e atualização da sessão.
4. Faça uma compra demonstrativa com dados fictícios.
5. Consulte e exclua o pedido.
6. Valide isolamento usando duas contas distintas.
7. Execute os comandos descritos em [operação e validação](OPERACAO.md).

Credenciais ausentes, inválidas ou de projetos diferentes produzem erro explícito. Não desabilite RLS nem exponha uma chave secreta para contornar problemas de configuração.
