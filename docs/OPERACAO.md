# Operação e validação

Este documento reúne os comandos de verificação, a retenção dos dados e os critérios para revisar uma entrega. A execução local e as integrações estão descritas em [configuração](CONFIGURACAO.md).

## Verificações locais

Com as dependências instaladas:

```sh
npm run check
npm test
npm run build
```

A suíte Vitest utiliza até quatro workers. O build prepara as texturas e valida a aplicação de produção. Não execute esses comandos durante uma alteração incompleta dos arquivos.

### Navegadores e telas

Instale os navegadores uma vez por máquina:

```sh
npx playwright install chromium firefox webkit
```

Em Linux, o ambiente pode precisar das dependências nativas dos navegadores:

```sh
npx playwright install --with-deps chromium firefox webkit
```

Execute:

```sh
npm run test:browser
```

A configuração inicia um servidor de desenvolvimento caso a porta padrão esteja livre. Quando `PLAYWRIGHT_BASE_URL` é definido, o teste usa um servidor já ativo nessa origem; isso permite conferir uma versão de produção em outra porta.

A verificação deve cobrir telas estreitas, celular, tablet, desktop, orientação horizontal e ampliação de texto; navegação, carrinho, checkout, acesso e ajuda precisam continuar utilizáveis. Os projetos de navegador e as larguras estão definidos nos testes versionados.

Automação com Chromium, Firefox e WebKit identifica problemas relevantes entre motores. WebKit em ambiente de teste não substitui Safari em aparelho Apple; emulação não substitui toque, teclado virtual, memória e rede de um dispositivo físico. Registre o ambiente e o resultado real sem prometer suporte a todo hardware existente.

### Isolamento da interface

Com o servidor local ativo e as variáveis públicas `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` configuradas no ambiente testado:

```sh
npm run test:privacy -- http://127.0.0.1:3000
```

O teste intercepta as APIs e a autenticação para exercitar troca de conta, respostas atrasadas, sessão expirada, histórico, falha de logout e limpeza dos dados. As identidades são sintéticas; o fluxo não precisa de segredo administrativo, criação de contas reais ou envio de e-mails. O modo de exploração sem configuração pública não simula login e não atende aos requisitos deste teste.

### Banco e integrações reais

Utilize um projeto Supabase dedicado a testes, com as migrações aplicadas e as chaves preenchidas em `.env.local`. Mantenha o site local ativo.

```sh
node scripts/verify-supabase.mjs --allow-test-users
node scripts/security-live.mjs --allow-test-users
```

Esses scripts criam contas e pedidos temporários no projeto configurado. O parâmetro explícito habilita essa escrita; os registros criados são removidos no encerramento. Eles não devem rodar como rotina automática contra produção.

Os arquivos `supabase/tests/shop.sql` e `supabase/tests/security.sql` validam regras e acesso no banco. Execute-os somente no projeto isolado. Eles usam transações com rollback; isso não torna adequado misturá-los a dados de outras aplicações.

Em um projeto Supabase novo, estabeleça primeiro uma conexão WebSocket que se inscreva em um canal Realtime autorizado, pela aplicação ou pelo Inspector. O próprio serviço cria as partições diárias de `realtime.messages` nessa primeira conexão. Abrir o painel ou chamar `realtime.send()` não inicializa as partições; sem elas, os testes de broadcast não têm onde inserir os eventos. Depois da inicialização, desconecte o cliente de diagnóstico e execute as suítes completas. Não crie manualmente partições internas para contornar essa preparação. Veja o [guia oficial de inicialização do broadcast](https://supabase.com/kb/troubleshooting/realtime-warn-sending-broadcast-message).

### Jornada em uma prévia pública

O script `scripts/verify-public-release.mjs` valida uma implantação HTTPS ligada ao projeto Supabase de testes. Ele exige o host exato da prévia e referências diferentes para os bancos de teste e produção. Antes de criar um pedido, confere se a API da implantação reconhece a conta temporária do banco de testes.

Prepare `.env.release-test.local`, ignorado pelo Git e pelo envio à Vercel, com as seguintes variáveis:

| Variável | Configuração |
| --- | --- |
| `RELEASE_TEST_SITE_URL` | Origem HTTPS exata da prévia, sem caminho, consulta ou fragmento |
| `RELEASE_TEST_EXPECTED_HOST` | Host dessa origem, sem protocolo |
| `RELEASE_TEST_SUPABASE_PROJECT_REF` | Referência do projeto dedicado a testes |
| `RELEASE_PRODUCTION_SUPABASE_PROJECT_REF` | Referência distinta do projeto de produção |
| `RELEASE_TEST_SUPABASE_URL` | URL do projeto de testes |
| `RELEASE_TEST_SUPABASE_PUBLISHABLE_KEY` | Chave publicável do projeto de testes |
| `RELEASE_TEST_SUPABASE_SECRET_KEY` | Chave secreta do projeto de testes, restrita ao computador de validação |
| `RELEASE_TEST_VERCEL_BYPASS` | Opcional: credencial de automação autorizada para uma prévia protegida |

Esse script não carrega `.env.local`. Para selecionar outro arquivo de teste ignorado pelo Git, defina `RELEASE_TEST_ENV_FILE`. Não reutilize as chaves administrativas de produção nesse arquivo.

Com o Chromium do Playwright instalado, execute:

```sh
node scripts/verify-public-release.mjs --allow-test-users
```

A jornada cobre validação local do cadastro, confirmação por link real, login, carrinho, frete, revisão assinada, criação de pedido demonstrativo, consulta, exclusão, recuperação de senha e logout. Os links de confirmação e recuperação são gerados pela API administrativa do Auth sem envio SMTP. Sessão expirada, indisponibilidade do catálogo e rejeição do contato são exercitadas com falhas controladas e identificadas no relatório.

O comando acima não habilita envio real pelo formulário de contato. O recebimento de confirmação, recuperação e contato deve ser conferido manualmente em uma caixa autorizada; esta automação não comprova entrega de e-mail.

Ao encerrar, o script revoga as sessões temporárias, exclui as contas criadas e verifica a ausência dos respectivos perfis, pedidos, itens e eventos. O resultado fica em `test-results/release/public-journey-report.json`; falhas na jornada ou na limpeza produzem saída de erro. Confira o relatório e revogue uma eventual credencial temporária de acesso à prévia após a validação. A lista de opções está disponível com `node scripts/verify-public-release.mjs --help`.

### Limites de segredo

Após um build com configuração de integração:

```sh
node scripts/verify-secret-boundaries.mjs
```

O script compara segredos de servidor configurados com os arquivos examinados e o build público. Uma execução sem segredos configurados não comprova a ausência de vazamentos de credenciais reais. Esse teste complementa a revisão dos arquivos preparados para versionamento.

Resultados e relatórios locais ficam em diretórios ignorados pelo Git. Não publique tokens, cookies, links de recuperação, senhas, mensagens pessoais ou exportações do banco como evidência de teste.

## Retenção e espaço do banco

| Dados | Regra atual |
| --- | --- |
| Pedidos | Validade exata de 24 horas a partir da criação |
| Itens, eventos e entrega do pedido | Removidos junto com o pedido |
| Pedidos vencidos | Ocultos imediatamente pela API/RLS; exclusão física na rotina de minuto |
| Contadores de solicitações | Janelas antigas removidas após um dia |
| Contas e perfis | Permanecem; não usam a expiração dos pedidos |
| Nome e entrega padrão | Permanecem no perfil até edição/remoção apropriada |
| Histórico do agendador e logs externos | Dependem de retenção operacional própria |

A tarefa `thunderfang-expired-orders` executa `tf_private.cleanup_expired_orders()` a cada minuto. A criação de um pedido também remove os vencidos daquela conta antes de verificar as vagas. A limpeza não depende de o navegador estar aberto.

Antes de uma apresentação, confira:

1. Estado ativo da tarefa e resultado das execuções recentes.
2. Ausência de pedidos vencidos aguardando limpeza.
3. Uso de espaço, crescimento de contas e volume de logs.
4. Limites e disponibilidade do plano contratado.
5. Estado dos serviços de autenticação, catálogo, Realtime e e-mail.

Excluir linhas não representa redução imediata de todo espaço alocado do PostgreSQL. Monitore o espaço e o trabalho de manutenção do banco. A expiração de pedidos reduz crescimento, mas não substitui política de retenção de contas e logs.

## Ambientes e separação de dados

| Ambiente | Origem da aplicação | Projeto Supabase |
| --- | --- | --- |
| Desenvolvimento | `http://127.0.0.1:3000` | Catálogo local explícito ou projeto dedicado configurado na máquina |
| Preview | Host exato de `VERCEL_URL`; o host de `VERCEL_BRANCH_URL` também é aceito quando fornecido pela Vercel | `thunder-fang-preview` — `thubcbrhassfthtvcgwe` |
| Production | `https://thunder-fang.vercel.app` | `zgfjprmwrwzgmvbbmbjt` |

A demonstração está publicada no ambiente Production da Vercel em [thunder-fang.vercel.app](https://thunder-fang.vercel.app/pt-BR), com acesso HTTPS verificado. A prévia utiliza um projeto Supabase separado. As 11 verificações da jornada pública passaram nesse ambiente isolado, usando a mesma versão da aplicação promovida para produção. Os envios por SMTP e o recebimento de confirmação, recuperação e contato permanecem sujeitos à validação manual em uma caixa autorizada.

Cadastre variáveis separadas nos escopos Preview e Production da Vercel. URL, chave publicável e chave secreta Supabase devem pertencer ao projeto indicado para aquele ambiente. Use um segredo de revisão próprio por ambiente e `BACKEND_LOCAL_MODE=false` nos builds hospedados. As variáveis `SUPABASE_PRODUCTION_PROJECT_REF` e `SUPABASE_PREVIEW_PROJECT_REF` precisam identificar projetos diferentes em ambos os escopos.

A configuração da aplicação recusa builds hospedados com o modo local habilitado ou com a URL Supabase apontando para o projeto do ambiente errado. A origem de Preview é obtida das variáveis oficiais da Vercel; um cabeçalho da solicitação não autoriza outro domínio. Registre a URL exata de cada prévia utilizada e seus callbacks no Auth do projeto de Preview. Não amplie a lista de confiança para todos os domínios `vercel.app`.

SMTP de autenticação é configurado no respectivo projeto Supabase. O contato usa as variáveis de servidor da Brevo no escopo da Vercel. As jornadas com contas e pedidos temporários devem selecionar explicitamente o projeto de Preview, sem carregar o arquivo local de produção. Testes de e-mail usam somente caixas autorizadas; o usuário deve conferir o recebimento de confirmação, recuperação e contato. Aceitação da mensagem pela API não comprova chegada à caixa de entrada.

## Publicação

Prepare ambientes separados para desenvolvimento, preview e produção. Previews com código em revisão não devem ter chaves de escrita no banco de produção.

Antes de publicar:

- Configurar origem HTTPS, callbacks, variáveis e segredos por ambiente.
- Confirmar remetente SMTP, destino de contato e limites da Brevo.
- Conferir RLS, privilégios de funções e alertas do projeto Supabase.
- Definir backup, recuperação, retenção de contas/logs e responsáveis pela operação.
- Revisar metadados, indexação, recursos públicos e links.
- Executar tipos, testes, build e inspeção dos arquivos que serão enviados.

Após publicar, conferir o domínio real: HTTPS, idiomas, mídia, cadastro, confirmação, recuperação, compra demonstrativa, consulta/exclusão de pedidos e contato. O recebimento de e-mail deve ser testado apenas com caixa autorizada.

## Verificações automáticas no GitHub

A rotina versionada em [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) executa em push, pull request e acionamento manual. Em uma máquina Ubuntu 24.04 com Node 24, o primeiro job executa `npm ci` → tipos → testes → build. Após esse job passar, outro job instala o Firefox e suas dependências nativas com `npx playwright install --with-deps firefox` e executa `npm run test:browser -- --project=firefox`. O resultado de ambos aparece no commit e na aba Actions do repositório.

O ambiente usa apenas a origem local de teste e o catálogo de exploração, sem credenciais reais Supabase ou Brevo. O job Firefox fornece uma URL pública no domínio reservado `.invalid` e uma chave pública sintética fixa para inicializar o cliente do navegador; os testes interceptam os provedores e bloqueiam solicitações externas. Assim, uma proposta de alteração não recebe acesso ao banco, aos e-mails ou aos segredos de produção. As nove verificações responsivas usam respostas sintéticas e bloqueiam escritas; a regressão do formulário de confirmação envia um formulário nativo com token sintético e verifica a recusa de um nonce inválido antes da chamada ao Auth. Os testes de integração com escrita remota continuam separados e exigem o ambiente dedicado descrito acima.

O token tem somente leitura do conteúdo; o checkout não persiste credenciais e as ações são fixadas por commit completo verificado na origem. O job de tipos, testes e build tem limite de 15 minutos; o de Firefox tem limite de 20 minutos. A rotina cancela uma execução anterior da mesma referência quando chega uma alteração nova. Não utiliza gatilhos privilegiados para executar código de propostas externas.

Essa rotina detecta regressões de instalação, contratos, compilação e navegação no Firefox. Ela não publica o site nem altera a autoria dos commits. A disponibilidade e os limites de execução seguem as configurações da conta GitHub. Confirme a conclusão dos dois jobs na execução correspondente ao commit enviado ao repositório.

## Revisão do primeiro commit

Confira o destino do repositório, a autoria Git e a branch. Revise a lista exata de arquivos, tamanho, licenças, caminhos locais, links da documentação e ausência de credenciais.

O commit deve conter código, recursos usados, testes reproduzíveis, dependências fixadas, migrações e documentação útil. Builds, dependências instaladas, backups, capturas descartáveis e relatórios de execução pertencem ao ambiente local.
