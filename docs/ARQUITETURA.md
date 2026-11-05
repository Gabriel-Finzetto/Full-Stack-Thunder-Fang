# Arquitetura

A aplicação usa Next.js App Router como interface e camada HTTP. O domínio concentra as regras da demonstração; os serviços do servidor coordenam identidade, catálogo, revisão de compra e persistência.

## Componentes e responsabilidades

| Área | Responsabilidade |
| --- | --- |
| `src/app` | Páginas localizadas, layouts e Route Handlers |
| `src/components` | Navegação, ajuda, elementos compartilhados e apresentação 3D |
| `src/features/store` | Estado do carrinho, persistência e sincronização entre abas |
| `src/features/checkout` | Entrega, cotação, revisão e confirmação da compra |
| `src/features/account` | Sessão, perfil, entrega padrão e pedidos privados |
| `src/contracts` | Tipos compartilhados e formatos aceitos |
| `src/domain` | Regras de catálogo, preços, quantidades, regiões e frete |
| `src/server` | Validação HTTP, autenticação, serviços e adaptadores externos |
| `src/i18n` | Mensagens, preferência de idioma e metadados |
| `supabase/migrations` | Histórico ordenado do esquema, políticas e funções |

O navegador usa a chave publicável do Supabase para autenticação e canais privados. As rotas privadas verificam o usuário no servidor. As consultas ao banco usam a identidade do usuário e RLS; operações transacionais de pedidos usam um cliente de servidor cujos segredos não são expostos ao navegador.

## Fluxo de compra

1. O catálogo fornece disponibilidade e preços atuais.
2. O carrinho persiste lotes em IndexedDB e compartilha alterações entre abas.
3. O checkout envia itens, destino e modalidade ao servidor.
4. O servidor valida a entrada, recalcula os valores e devolve uma revisão assinada.
5. Ao confirmar, o servidor autentica a conta e compara novamente conteúdo e valores.
6. A função transacional grava pedido, itens e evento, respeitando o limite de cinco pedidos existentes.
7. Após sucesso confirmado, o cliente consome somente os lotes do snapshot utilizado. Adições feitas enquanto a solicitação estava em andamento permanecem no carrinho.
8. Um sinal privado do Realtime invalida a consulta da conta; os dados são lidos novamente pela API autorizada.

Uma resposta interrompida pode ocorrer depois de o pedido ter sido gravado. A interface orienta a consulta dos pedidos e não repete automaticamente a operação. Pedidos de conteúdo idêntico são permitidos; cada confirmação aceita é uma nova compra demonstrativa.

## Decisões de domínio

- **Dinheiro em centavos:** inteiros no contrato, BigInt nos cálculos e verificações de faixa segura.
- **Atacado:** a partir de seis latas combinadas, desconto de 10% sobre os produtos, com arredondamento único.
- **Frete:** país, região e modalidade são validados; os valores da revisão são recalculados no servidor.
- **Revisão assinada:** HMAC com validade de dez minutos. Mudanças de itens, preços ou entrega exigem nova revisão.
- **Persistência transacional:** criação e exclusão compartilham bloqueios por proprietário com a rotina de expiração.
- **Histórico do pedido:** nome, preço e entrega representam a confirmação original; mudanças posteriores no catálogo ou perfil não os reescrevem.
- **Falha explícita:** a ausência de uma dependência real gera indisponibilidade, sem fabricar sessão, pedido ou confirmação de e-mail.

## Dados persistidos

| Estrutura | Conteúdo |
| --- | --- |
| `auth.users` | Identidades administradas pelo Supabase Auth |
| `profiles` | Nome e preferência privada de entrega |
| `products`, `product_translations` | Catálogo e traduções |
| `delivery_regions` | Destinos, modalidades, preços e prazos |
| `orders` | Proprietário, revisão financeira, entrega, criação e expiração |
| `order_items`, `order_events` | Itens históricos e evento associado |
| `tf_private.rate_windows` | Contadores compartilhados de solicitações |

A exclusão de um pedido remove itens e eventos em cascata. A expiração dos pedidos não elimina contas nem perfis. A política de retenção está em [operação](OPERACAO.md).

## Estado no navegador

O carrinho tem versão de formato, sincronização entre abas e expiração após 30 minutos sem atividade. A entrega em edição usa memória e sessionStorage da aba por até 30 minutos, vinculada à identidade e à geração do carrinho. Perfil, pedidos e revisões não são persistidos como cache privado em localStorage.

Leituras e mutações pendentes são vinculadas à identidade e a uma versão de invalidação. Troca de conta, logout, expiração e restauração pelo histórico invalidam dados privados antes de novas consultas.

## Interface e recursos gráficos

CSS Modules preserva estilos por componente. As quatro apresentações 3D compartilham um contexto WebGL e renderizam sob demanda. As latas carregam e acompanham a rolagem automaticamente, inclusive com movimento reduzido e em telas baixas, sem controles de ativação. A apresentação estática permanece como alternativa quando WebGL está indisponível ou falha. Os demais efeitos da interface respeitam a preferência de movimento reduzido. O preparo das texturas é parte do build e usa recursos presentes no repositório.

Os idiomas disponíveis são `pt-BR`, `en`, `es` e `zh-Hans`. Idioma, país de entrega e moeda são conceitos separados; a moeda da demonstração permanece BRL.
