# Segurança e privacidade

O projeto é uma demonstração de e-commerce sem pagamentos. Ainda assim, sessões, perfis, entregas e pedidos são dados privados e recebem controles de isolamento no servidor e no banco.

## Fronteiras de confiança

| Fronteira | Autoridade |
| --- | --- |
| Navegador → API | Entrada não confiável; esquema, origem, tamanho e sessão são verificados |
| API → Supabase Auth | A identidade é obtida pela verificação do usuário |
| Consulta privada → PostgreSQL | Cliente do usuário, RLS e filtro adicional de proprietário/expiração |
| Escrita de pedido → PostgreSQL | Função transacional restrita ao servidor |
| PostgreSQL → Realtime | Sinal privado por conta, sem conteúdo do pedido ou endereço |
| Aplicação → Brevo | Remetente e destinatário definidos no servidor; conteúdo em texto simples |

Nome editável e outros metadados fornecidos pelo usuário não concedem permissões. Campos de proprietário, preço e totais enviados pelo navegador são recusados quando não fazem parte do contrato.

## Controles implementados

### Identidade e isolamento

- Rotas privadas verificam a identidade no servidor e exigem e-mail confirmado.
- RLS restringe perfis, pedidos, itens e eventos ao proprietário.
- Criação e exclusão de pedidos passam por funções com execução exclusiva do papel de servidor.
- Funções internas ficam em esquema privado; privilégios e `search_path` são explícitos.
- Pedidos inexistentes e pedidos alheios recebem a mesma resposta de ausência.
- Canais Realtime comparam proprietário, tópico real e tópico solicitado; clientes não publicam eventos da loja.

### Sessões e navegação

- O cliente vincula operações pendentes à conta e à versão de invalidação.
- Troca de sessão, logout, expiração e restauração pelo histórico limpam o estado privado antes de revalidar.
- Formulários enviam a identidade esperada; divergência da sessão atual retorna `SESSION_CHANGED` antes da mutação.
- Retornos de autenticação aceitam apenas destinos internos permitidos.
- Links PKCE mantêm o vínculo com o verificador da tentativa. Links com token apresentam confirmação explícita antes da troca de sessão.
- Recuperação exige marcador assinado, vinculado ao usuário e à sessão e com validade de dez minutos.
- Cookies de intenção e recuperação são HttpOnly. Cookies de sessão seguem a integração SSR do Supabase e precisam ser acessíveis ao SDK; não se presume que sejam HttpOnly.
- Em HTTPS, os cookies usam Secure. A execução local HTTP é tratada separadamente.

### Integridade e abuso

- Contratos estritos recusam propriedades extras e valores fora das faixas aceitas.
- Preços, atacado e frete são recalculados no servidor e no caminho transacional do pedido.
- Revisões assinadas expiram e ficam vinculadas ao conteúdo aceito.
- Escritas verificam origem; corpos têm limite de tamanho e tipos aceitos.
- As cotas da demonstração usam contadores compartilhados e atômicos no banco.
- Uma credencial inválida não consome a cota das operações privadas.
- Conteúdo de contato é texto simples; o cliente não escolhe destinatário nem cabeçalhos de e-mail.
- Respostas privadas não entram em cache compartilhado.

### Navegador e segredos

As respostas incluem proteção contra enquadramento, `nosniff`, política de referência e restrições de recursos não utilizados. A CSP atual protege bases, objetos, formulários e enquadramento; ela não implementa uma política completa de scripts com nonce.

Segredos reais ficam fora do Git. Apenas URL e chave publicável Supabase podem estar no navegador. O script de limites de segredo compara os valores configurados com o código e os arquivos públicos do build sem exibir esses valores.

## Matriz de ameaças e verificação

| Tentativa | Controle principal | Verificação |
| --- | --- | --- |
| Acessar pedido de outra conta por ID | Proprietário + RLS | Serviço, API e teste SQL A/B |
| Alterar o proprietário ou preços no corpo | Esquema estrito + recálculo | Entradas adulteradas e propriedades geradas |
| Enviar formulário de A com sessão B | Identidade esperada | Recusa 409 e preservação de B |
| Repovoar a interface com resposta antiga | Identidade + invalidação | Teste de navegador com respostas atrasadas |
| Restaurar dados privados pelo histórico | Invalidação em `pageshow` | Teste de restauração e revalidação |
| Forçar troca de sessão por link | Intenção de confirmação + PKCE | Nonce alterado, expirado ou reutilizado |
| Autorizar recuperação por parâmetro | Marcador assinado de sessão | Rotas e testes de autenticação |
| Ultrapassar cinco pedidos em concorrência | Bloqueio por proprietário | Integração transacional |
| Receber eventos de outra conta | Autorização de tópico privado | Realtime A/B |
| Expor chave administrativa no build | Fronteira servidor/cliente | Varredura dos segredos configurados |

Os testes incluem controles positivos: operações legítimas precisam continuar funcionando. A cobertura é uma matriz finita de riscos e estados, não uma prova de ausência de todos os defeitos possíveis.

## Retenção

Pedidos expiram após 24 horas da criação no servidor. RLS e API ocultam os vencidos; a rotina de limpeza remove pedidos, itens e eventos a cada minuto. O endereço do pedido é removido com o pedido. Nome e entrega padrão do perfil permanecem.

O carrinho e o rascunho de checkout expiram após 30 minutos sem atividade, conforme suas regras de armazenamento. Perfil, pedidos e revisões não são gravados como cache privado em localStorage. Rascunhos de contato ficam temporariamente em memória.

Retenção de contas inativas, histórico do agendador e dados mantidos por provedores exige uma política operacional própria. Veja [operação](OPERACAO.md).

## Configuração externa e limites

A proteção contra senhas vazadas depende do plano do Supabase; a documentação do provedor a disponibiliza no Pro ou superior. Conferir a [política de senhas](https://supabase.com/docs/guides/auth/password-security) no ambiente utilizado.

MFA dos administradores, CAPTCHA, política de senha, disponibilidade do provedor, origem pública, SMTP, backups e recuperação devem ser configurados e verificados para cada ambiente. As cotas globais atuais atendem à demonstração e precisam ser revistas diante de uso maior.

A validação local não certifica o domínio público, a entrega de e-mail futura ou todos os dispositivos físicos. Os comandos e o processo de aceitação estão em [operação e validação](OPERACAO.md).
