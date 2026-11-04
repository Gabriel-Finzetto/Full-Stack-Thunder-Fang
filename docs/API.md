# Contratos da API

As rotas HTTP ficam sob `/api`, sem prefixo de idioma. Os contratos TypeScript estão em `src/contracts`; a validação HTTP está em `src/server/schemas.ts`.

## Convenções

- JSON com propriedades em camelCase.
- Datas ISO 8601 em UTC; formatação localizada no navegador.
- Valores monetários inteiros em centavos, sempre BRL.
- Idiomas: `pt-BR`, `en`, `es` e `zh-Hans`, fornecidos por `locale`; padrão `pt-BR`.
- Produtos: `original`, `citricos`, `tropicais` e `frutas-vermelhas`.
- Sessão verificada pelo servidor; nenhum `userId` do corpo autoriza acesso.
- Corpos JSON de até 32 KiB, com recusa de propriedades não previstas.
- Respostas da API usam `private, no-store`, variam por Cookie/Authorization e incluem `X-Request-Id`.

As escritas feitas por navegador precisam de origem compatível com `NEXT_PUBLIC_SITE_URL`. A interface envia `X-TF-Account` nas mutações privadas para detectar formulário de uma conta utilizado depois de uma troca de sessão. Esse cabeçalho é uma verificação de consistência; ele não autentica a chamada.

## Endpoints

| Método | Rota | Acesso | Resposta |
| --- | --- | --- | --- |
| GET | `/api/products` | Público | 200, `{ products }` |
| GET | `/api/products/[slug]` | Público | 200, `{ product }` |
| POST | `/api/shipping/quote` | Público | 200, `{ quote }` |
| POST | `/api/checkout/quote` | Público | 200, `{ quote }` com revisão assinada |
| GET | `/api/profile` | Conta autenticada e confirmada | 200, `{ profile }` |
| PATCH | `/api/profile` | Conta autenticada e confirmada | 200, `{ profile }` |
| GET | `/api/orders` | Conta autenticada e confirmada | 200, `{ orders, nextCursor }` |
| POST | `/api/orders` | Conta autenticada e confirmada | 201, `{ order }` |
| GET | `/api/orders/[id]` | Proprietário | 200, `{ order }` |
| DELETE | `/api/orders/[id]` | Proprietário | 204, sem corpo |
| GET | `/api/data` | Conta autenticada e confirmada | 200, catálogo e pedidos próprios |
| POST | `/api/contact` | Público | 202, aceitação pelo provedor e `messageId` |

Cadastro, login e logout usam o SDK Supabase Auth. `/api/auth/callback` trata a confirmação e a recuperação; `/api/auth/recovery` consulta a autorização de recuperação e `/api/auth/password` conclui a troca de senha.

## Catálogo e entrega

Um item solicitado tem a forma `{ slug, quantity }`. A quantidade é um inteiro positivo dentro da faixa segura. Entradas repetidas são agrupadas antes dos cálculos; a API aceita até 256 entradas técnicas antes desse agrupamento.

A entrega utiliza `country`, `region`, `postal`, `street`, `number`, `noNumber`, `complement`, `district`, `city`, `province`, `reference` e `instructions`. Os países são `BR`, `US`, `ES` e `CN`; a região precisa pertencer ao país. Pelo menos um campo livre deve ter conteúdo significativo.

`method` é `standard` ou `express`. A cotação resolve destino, modalidade, valor e prazo em dias úteis. A demonstração não calcula tributos de importação nem representa uma entrega física.

Exemplo de revisão:

```http
POST /api/checkout/quote
Content-Type: application/json

{
  "items": [{ "slug": "original", "quantity": 6 }],
  "delivery": {
    "country": "BR",
    "region": "SP-CAPITAL",
    "street": "Endereço fictício"
  },
  "method": "standard"
}
```

O servidor fornece itens resolvidos, subtotal, desconto, total dos produtos, frete, total final, entrega e `reviewToken`/`reviewExpiresAt`. O token tem validade de dez minutos. Nome, preço, proprietário, desconto e total fornecidos pelo navegador não substituem os valores autorizados.

## Perfil

A resposta contém `id`, `name`, `email` e `defaultDelivery`. A edição aceita:

```json
{
  "name": "Cliente",
  "defaultDelivery": null
}
```

Omitir `defaultDelivery` preserva a preferência existente; enviar `null` a remove. Para salvar uma entrega, o campo recebe `{ delivery, method }`, com o mesmo formato validado no checkout. Identidade e e-mail permanecem sob o serviço de autenticação.

## Pedidos

A criação recebe os mesmos itens, entrega e modalidade da cotação, acrescidos de `reviewToken`. O servidor recalcula os valores, confere a revisão e grava pedido, itens e evento em uma transação.

A resposta contém identificação, número, datas de criação e expiração, estado `simulation_completed`, moeda, totais, itens históricos e entrega completa. Os registros expiram 24 horas após a criação. No máximo cinco pedidos existentes são permitidos por conta; a conferência é atômica.

Listagem aceita `limit` entre 1 e 5 e `cursor` opcional. Pedidos de conteúdo igual são permitidos. A exclusão é permanente e remove os dados relacionados. Um pedido inexistente ou de outra conta retorna 404 sem revelar seu proprietário.

Se a conexão for interrompida após a confirmação, consulte os pedidos antes de reenviar. O sistema não repete a criação automaticamente.

## Contato

Entrada: `{ name, email, reason, message }`.

- `name`: obrigatório, até 120 caracteres.
- `email`: endereço válido, até 254 caracteres.
- `reason`: `products`, `order`, `partnerships` ou `other`.
- `message`: obrigatória, até 3.000 caracteres.

O destinatário é definido exclusivamente no servidor. A Brevo recebe texto simples e `replyTo` do visitante. O retorno 202 comprova aceitação pelo provedor; não comprova entrega à caixa de entrada. Não há repetição automática em caso de resposta interrompida.

## Erros

```json
{
  "code": "INVALID_INPUT",
  "message": "Confira os dados informados.",
  "fieldErrors": { "delivery.region": ["Região inválida."] }
}
```

`fieldErrors` é opcional. A interface se orienta pelos códigos estáveis, sem apresentar detalhes internos dos provedores.

| HTTP | Código | Tratamento esperado |
| --- | --- | --- |
| 400 | `INVALID_INPUT` | Corrigir os campos e preservar o restante |
| 401 | `AUTH_REQUIRED` / `SESSION_EXPIRED` | Revalidar a sessão e solicitar acesso |
| 403 | `FORBIDDEN` | Recusar a origem/operação |
| 404 | `NOT_FOUND` | Voltar ao catálogo ou aos próprios pedidos |
| 409 | `SESSION_CHANGED` | Invalidar o formulário e carregar a conta atual |
| 409 | `QUOTE_CHANGED` | Obter revisão atualizada |
| 409 | `ORDER_LIMIT_REACHED` | Consultar ou excluir pedidos existentes |
| 409 | `PRODUCT_UNAVAILABLE` | Atualizar a seleção/revisão |
| 413 | `PAYLOAD_TOO_LARGE` | Reduzir o corpo da solicitação |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Usar o formato aceito pela rota |
| 429 | `RATE_LIMITED` | Aguardar o prazo de `Retry-After` |
| 503 | `SERVICE_UNAVAILABLE` | Preservar a entrada e permitir nova tentativa consciente |
| 500 | `INTERNAL_ERROR` | Exibir mensagem genérica e referência da solicitação |
