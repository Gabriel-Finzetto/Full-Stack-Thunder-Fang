# Plano de validação e evolução do Thunder Fang

**Revisão de 5 de novembro de 2026.** Este plano completa o [escopo do projeto](ESCOPO.md). Ele separa evidências já disponíveis, verificações que precisam ser executadas e melhorias que só devem entrar depois que a jornada atual estiver estabilizada. A existência de um teste, script ou integração não é, por si, uma evidência de que o teste passou em determinado ambiente.

## Ponto de partida e evidência existente

O repositório contém catálogo, carrinho sincronizado, autenticação, checkout fictício, pedidos e infraestrutura de validação. O GitHub Actions [registrou sucesso para o commit `853ebb4`](https://github.com/Gabriel-Finzetto/Full-Stack-Thunder-Fang/actions/runs/41964719487), com checks de tipos, testes, build e regressão Firefox isolada, conforme o workflow. A documentação [de operação](OPERACAO.md) registra 11 etapas da jornada pública validadas em prévia conectada ao Supabase de testes, mas ressalva que os links de autenticação foram obtidos pela API administrativa e **não foram entregues por SMTP**. Portanto, a aceitação técnica parcial está documentada; a experiência integral com recebimento de mensagens e dispositivos reais continua pendente de evidência.

A revisão encontrou também uma divergência de requisitos: o mapa FigJam de 1º de outubro ainda fala de cancelamento de pedido em até uma hora e de idempotência por chave de tentativa, enquanto a versão de novembro permite excluir pedidos e não repete automaticamente confirmações. Essas diferenças são decisões de produto a resolver antes de se declarar o mapa atualizado.

## Primeira prioridade — comprovar o caminho que uma pessoa percorre

Comece pela experiência pública no domínio publicado. Verifique navegação pela página inicial, acesso direto ao catálogo e ao produto, visualização de modelos e alternativas estáticas, escolha de quantidades, inclusão e remoção de itens e atualização entre duas guias. Faça o carrinho passar por expiração real e confira se itens vencidos não retornam após recarga, login ou sincronização tardia. Valide a mesma jornada em português, inglês, espanhol e chinês simplificado, preservando BRL e destino de entrega independentemente do idioma.

Depois, execute a compra demonstrativa em um ambiente isolado, com dados fictícios. Registre cadastro, chegada real do e-mail, confirmação, login, recuperação de senha, escolha de país e região, cotação do frete, revisão de desconto e total, criação de pedido, exibição e exclusão. Teste também entrada por URL privada, retorno ao checkout depois de autenticar, expiração de sessão, revisão vencida e troca de conta com a página aberta. A aprovação exige que um usuário entenda o que aconteceu e saiba como se recuperar sem criar involuntariamente outro pedido.

**Evidência mínima:** URL/commit e ambiente, roteiro executado, navegador e dispositivo, data, comportamento esperado, resultado observado e capturas sem credenciais ou dados pessoais. Não use produção para scripts que criam contas e pedidos temporários: siga as instruções de [operação](OPERACAO.md).

## Segunda prioridade — segurança, consistência e integridade do domínio

Os testes atuais de autenticação, RLS, isolamento A/B, entradas inesperadas e revisão assinada são a base, mas merecem confirmação em ambiente dedicado. Uma conta não pode ler, criar, alterar ou excluir os pedidos de outra. A interface não pode confiar no preço enviado pelo navegador; subtotal, desconto e frete devem vir do lado autorizado. Quantidade inválida, preço alterado durante o checkout, entrega incompatível com país, revisão de dez minutos expirada e limite concorrente de cinco pedidos precisam resultar em respostas previsíveis.

A interrupção de rede entre persistir um pedido e responder ao navegador merece atenção especial. O comportamento presente impede repetição automática e orienta consultar o histórico; isso precisa ficar claro na interface e ser testado. Uma evolução de idempotência exigiria contrato novo, chave de tentativa, retenção, tratamento de concorrência e testes de repetição. Não declare que a API já possui esse mecanismo apenas porque o mapa antigo o prevê.

Avalie também limites de requisição, configuração dos cookies, políticas de acesso, escopo de segredos, regras de origem, dependências, erros públicos e logs. Registre risco, impacto e correção dos problemas identificados; a ausência de alertas em uma única execução não equivale a auditoria de segurança.

## Terceira prioridade — usabilidade, acessibilidade e desempenho

Revise o fluxo com uma pessoa que não participou do desenvolvimento. A tarefa proposta deve ser simples: escolher seis latas de sabores diferentes, conferir o desconto de 10%, selecionar um destino, criar conta se necessário e registrar uma compra fictícia. Observe onde há dúvidas sem explicar antecipadamente a interface. Repita em celular, desktop, teclado e com ampliação de texto.

Conduza uma avaliação pelas dez heurísticas de Nielsen, focando visibilidade de estado, consistência, prevenção de erro, reconhecimento em vez de memorização e recuperação. Use WCAG 2.2 AA como referência de verificação, sem alegar conformidade por inspeção superficial. Valide foco visível, sequência de tabulação, abertura e fechamento de diálogos, rótulos, mensagens de erro, leitor de tela, contraste, redução de movimento e alternativas ao 3D. Teste em Chromium, Firefox e WebKit, além de ao menos um dispositivo físico representativo. Nenhum teste emulando WebKit substitui a verificação no Safari real.

Meça as principais páginas com Lighthouse ou ferramenta equivalente e acompanhe Core Web Vitals, em particular LCP, INP e CLS, distinguindo laboratório de dados de campo. As imagens das latas e seus recursos 3D devem manter boa apresentação sem impedir a interação em hardware modesto ou rede lenta. Registre resultados reais e limites definidos antes de afirmar que uma meta foi atingida.

## Quarta prioridade — operação, CI/CD e serviços externos

Confirme os dois jobs da pipeline para o commit efetivamente publicado e repita os comandos locais de tipos, testes e build. Verifique a separação dos ambientes Preview e Production, a validade dos callbacks, a configuração de SMTP e Brevo, e se as chaves usadas pelo navegador são apenas publicáveis. Monitore falhas de API, status de deploy, limites e consumo do banco, agendamento de expiração, retenção de contas/logs e uma estratégia viável de backup e recuperação.

O recebimento real de cadastro, recuperação de senha e formulário de contato deve ser testado com caixas sob seu controle. A resposta 202 da Brevo não é prova de entrega na caixa, e uma confirmação obtida por API administrativa não comprova que o usuário recebeu o e-mail. Registre a evidência sem copiar links temporários, tokens ou informações pessoais.

Por se tratar de demonstração pública, a observabilidade deve privilegiar métricas de falhas e identificadores de requisição, sem armazenar senhas, endereços completos ou cookies. Alertas complexos não são um requisito imediato; o essencial é conseguir identificar, reproduzir e corrigir falhas reais.

## Quinta prioridade — transformar a aplicação em um case de portfólio

Concluída a validação, prepare um relato breve que explique o problema, a jornada escolhida, a arquitetura, o papel do Supabase, a defesa dos preços no servidor, as decisões sobre carrinho e identidade, o tratamento de falhas e os resultados obtidos. O case deve conter capturas ou vídeo da home, catálogo, carrinho, checkout, conta, fluxo de exceção e pipeline. Inclua um diagrama simples mostrando navegador, API, banco, autenticação, Realtime e Brevo.

A apresentação será mais convincente se explicar *por que* a compra permanece fictícia, *como* o backend é real e *o que* precisaria mudar antes de operar comercialmente. O README deve oferecer demonstração e reprodução, com links para este plano, o escopo e a documentação técnica, sem exigir exposição de segredos do projeto publicado.

## Decisões que precisam de aceite

| Decisão | Proposta para a versão de portfólio | Critério para reabrir |
| --- | --- | --- |
| Exclusão versus cancelamento | Manter a exclusão permanente demonstrativa implementada e corrigir o mapa antigo | Nova necessidade de demonstrar lifecycle de pedido, estados e auditoria |
| Reenvio após resposta interrompida | Manter consulta ao histórico, sem retry automático | Introduzir idempotência de API como melhoria deliberada com testes concorrentes |
| Aviso conceitual inicial | Conservar o aviso presente e validar sua frequência e acessibilidade | Evidência de que bloqueia ou confunde a exploração |
| Promoções | Manter desconto de atacado; não inventar cupons reais | Regra comercial adicional com contrato e testes |
| Pagamento e logística | Fora do escopo de portfólio atual | Projeto separado de sandbox, sem dados bancários reais |
| Visual 3D | Manter experiência otimizada com alternativa estática | Resultados de performance ou usabilidade exigirem simplificação |

## Critérios de aceite e registro

A conclusão exige **zero falhas críticas abertas** de autenticação, isolamento de dados, integridade de pedido, perda de carrinho ou divulgação enganosa de cobrança. Deve haver registro de testes da jornada principal e dos casos de falha, pipeline verde no commit avaliado, recebimento de e-mails validado ou limitação explicitamente documentada, revisão de acessibilidade, avaliação de desempenho e README/case atualizados. Aprovações devem apontar para evidências datadas; não marcar um item como concluído com base somente na presença de código.

Use a tabela seguinte como registro vivo. O estado **Pendente de evidência** indica que não foi possível conferir o resultado nesta revisão, e não significa que a funcionalidade esteja ausente.

| Verificação | Situação nesta revisão | Evidência necessária |
| --- | --- | --- |
| Código, integrações e documentação básica | Presente no repositório | Caminhos e contratos versionados |
| Pipeline do commit `853ebb4` | Sucesso verificado no GitHub Actions | [Execução](https://github.com/Gabriel-Finzetto/Full-Stack-Thunder-Fang/actions/runs/41964719487) |
| Jornada pública isolada, sem SMTP | 11 verificações aprovadas conforme registro operacional | Relatório da execução, sem segredos |
| Confirmação e recuperação entregues por e-mail | Pendente de evidência | Caixa autorizada e registro de chegada |
| Mensagem de contato entregue à caixa | Pendente de evidência | Aceite do provedor e recebimento confirmado |
| Exploração real com teclado e leitor de tela | Pendente de evidência | Roteiro WCAG, problemas e correções |
| Navegadores e aparelho físico | Pendente de evidência | Matriz de ambiente e comportamento |
| Performance no domínio público | Pendente de evidência | Relatório LCP, INP e CLS com contexto |
| Segurança integrada, permissões e recuperação | Pendente de evidência atual | Testes SQL, scripts dedicados e revisão manual |
| Coerência do mapa FigJam com o produto | Divergências identificadas | Nova versão do mapa e decisões de aceite |
| Case profissional com imagens e arquitetura | Pendente | README, diagrama, vídeo e relato técnico |

## Sequência sugerida

**Ciclo 1 — Fechamento funcional.** Reexecutar a jornada do visitante e a jornada autenticada, validar recebimento dos e-mails, documentar os erros e resolver inconsistências do mapa.

**Ciclo 2 — Qualidade.** Corrigir falhas críticas, expandir os testes de navegador e isolamento, aplicar auditoria de acessibilidade e medir desempenho real.

**Ciclo 3 — Operação e narrativa.** Conferir serviços, logs, limites, CI, licença de materiais, reprodução limpa e documentação. Publicar o case com capturas, resultados e limitações.

Não atribua prazos de conclusão antes de levantar a gravidade dos problemas encontrados. Cada melhoria deve ter uma razão observável, um responsável e um teste que demonstre quando está pronta.
