# Escopo do Thunder Fang Energy

**Revisão de escopo — 5 de novembro de 2026.** Este documento descreve a aplicação que existe no repositório, o que ainda depende de validação e as decisões necessárias para apresentar o Thunder Fang como um trabalho consistente de engenharia de software. O [plano de validação](PLANO_DE_VALIDACAO.md) traduz essas decisões em evidências e critérios de aceite. Os contratos e comandos técnicos permanecem nos documentos especializados.

## Por que o projeto existe

Thunder Fang Energy é uma marca conceitual de bebidas energéticas, desenvolvida como contexto para um e-commerce de portfólio. O desafio não é apenas apresentar um produto em uma página atraente: é fazer com que uma pessoa descubra os sabores, compreenda a oferta, monte uma combinação, revise valores, crie uma conta quando necessário e conclua uma compra simulada sem perder o controle sobre seus dados ou sobre a própria jornada.

O projeto procura demonstrar a relação entre experiência de usuário e engenharia. Uma interface envolvente perde valor quando o carrinho não acompanha a troca de guias, os preços podem ser manipulados pelo navegador ou um pedido fica visível para outra conta. Por isso, as decisões de interface foram acompanhadas de contratos de API, persistência transacional, isolamento de identidade e testes. A experiência é demonstrativa do ponto de vista comercial, mas suas integrações de autenticação e persistência são implementações reais nos ambientes configurados.

**Thunder Fang não vende nem envia bebidas.** Frete, prazos, compras e informações dos produtos pertencem ao cenário fictício. Não há captura de dados bancários, cobrança, processamento por gateway, emissão fiscal, vínculo com transportadoras ou atendimento comercial efetivo. O aviso deve continuar compreensível em todos os idiomas, inclusive para quem chega diretamente a uma página interna.

## Público e resultado esperado

O público de navegação é uma pessoa que deseja experimentar um fluxo de compra simples, em celular ou desktop, com linguagem clara e possibilidade de explorar sem fornecer dados pessoais. O público de avaliação inclui recrutadores, engenheiros, designers e profissionais que examinam as escolhas técnicas do desenvolvedor. Para esse segundo grupo, não basta enxergar uma interface funcionando: o repositório precisa permitir entender as decisões, reproduzir a aplicação, verificar seus limites e localizar as evidências dos testes.

O resultado esperado é um **case full-stack reproduzível e auditável**, capaz de demonstrar front-end, back-end, banco de dados, autenticação, segurança, responsividade, testes automatizados e entrega contínua. O objetivo não é maximizar o número de integrações, mas concluir bem uma jornada definida, tornando explícitas as hipóteses, concessões e decisões de arquitetura.

## Experiência e identidade já definidas

A proposta visual usa um urso polar guerreiro, armadura escura, raios e uma linguagem de marca orientada à ideia de evolução e escolha. Essa identidade aparece na página inicial e nas apresentações dos quatro sabores — Original, Cítricos, Tropicais e Frutas Vermelhas —, cada um representado por uma lata conceitual de 500 ml. As fichas têm imagens, descrições e apresentação 3D com alternativa estática para situações em que movimento, WebGL ou condições do dispositivo não sejam adequados.

A experiência usa português brasileiro como referência editorial e oferece inglês, espanhol e chinês simplificado. A mudança de idioma não deve ser confundida com país de entrega nem com moeda: a cotação permanece em reais e os destinos demonstrativos disponíveis são Brasil, Estados Unidos, Espanha e China. O preço registrado no catálogo-base é de **R$ 12,79 por lata**; a condição de atacado concede **10% sobre os produtos a partir de seis unidades combinadas**, sem descontar o frete. Em ambiente integrado, os preços e a disponibilidade válidos são consultados no servidor, e a confirmação precisa considerar o catálogo vigente.

## O que foi implementado e o que isso comprova

A aplicação emprega Next.js App Router, React e TypeScript, com componentes e recursos organizados por domínio. O catálogo, a apresentação 3D, a escolha de quantidades e o carrinho estão representados em código. O carrinho utiliza IndexedDB, acompanha alterações entre guias e tem prazo de inatividade de 30 minutos. O checkout recebe endereço, destino e modalidade, consulta cotações e produz uma revisão assinada pelo servidor; valores fornecidos pelo navegador não são tratados como fonte de autoridade.

A autenticação utiliza Supabase Auth, e a persistência emprega PostgreSQL com políticas de acesso por proprietário. A conta contempla cadastro, confirmação de e-mail, entrada, recuperação de senha, dados de perfil e entrega padrão. Os pedidos são gravados por operação transacional e consultados em rotas privadas; a aplicação limita a cinco pedidos existentes por conta e os expira após 24 horas. Canais privados do Realtime sinalizam atualizações sem distribuir os dados completos dos pedidos. A central de ajuda traz artigos e um formulário de contato integrado à Brevo quando configurado.

Há uma implantação documentada em [thunder-fang.vercel.app](https://thunder-fang.vercel.app/pt-BR), com ambientes separados para prévia e produção. O repositório inclui testes Vitest, Playwright, testes SQL de isolamento, scripts de integração e CI no GitHub Actions. Na revisão de 5 de novembro, o workflow do commit `853ebb4` constava como **concluído com sucesso**. A documentação operacional também registra **11 verificações aprovadas da jornada pública** na prévia isolada, sem envio SMTP real. Essas afirmações descrevem evidências delimitadas; não significam aprovação irrestrita de todos os navegadores, dispositivos, provedores ou cenários de falha.

Os arquivos [README](../README.md), [arquitetura](ARQUITETURA.md), [API](API.md), [segurança](SEGURANCA.md), [configuração](CONFIGURACAO.md) e [operação](OPERACAO.md) detalham o comportamento observado no código. Em caso de divergência, o contrato vigente e os testes executados devem ser conferidos antes de afirmar que um requisito está concluído.

## Como a jornada deve funcionar

A pessoa pode entrar pela página inicial, por um produto, pelo carrinho ou por um endereço interno. A navegação deve preservar o destino pretendido e explicar eventuais bloqueios sem perder silenciosamente a escolha. No catálogo, ela escolhe produtos e quantidades, verifica o desconto e adiciona a combinação ao carrinho. Antes do fechamento, o aplicativo reconcilia o conteúdo ainda válido do carrinho, identifica a região de entrega, calcula a estimativa fictícia e apresenta o total com clareza.

Quando a criação do pedido exigir autenticação, a pessoa deve conseguir retornar à compra após entrar ou confirmar o e-mail. A revisão assinada tem validade limitada: se produtos, preços ou entrega mudarem, o sistema deve solicitar nova conferência antes de registrar. Ao concluir, o pedido é armazenado no banco e a interface mostra o resultado. Uma resposta interrompida não deve provocar novas compras automaticamente; a orientação atual é consultar o histórico antes de repetir a operação. A experiência de conta permite consultar e excluir pedidos próprios. O sistema precisa explicar a natureza demonstrativa do registro antes e depois da confirmação.

Esses percursos precisam ser observados também quando o carrinho expira, a sessão muda, duas guias estão abertas, a conexão falha ou o usuário navega por teclado. A qualidade da jornada se mede tanto na transição comum quanto na recuperação de erros.

## Como usar o mapa de jornada anterior

O arquivo **“Mapa da Jornada | Thunder Fang”**, exportado do FigJam em **1º de outubro de 2026**, é um artefato histórico importante: organiza 43 diagramas de navegação e estados, entre F00 e F27 com subdivisões, incluindo idioma, catálogo, seleção, carrinho, autenticação, frete, checkout, pedidos, sincronização entre guias, ajuda e acessibilidade. Naquele momento, a etapa 2A ainda estava em revisão e várias integrações apareciam como planejadas. O mapa **não deve ser lido como retrato automático do software publicado em novembro**.

Algumas regras do mapa divergem do produto atual e exigem reconciliação deliberada:

| Tema | Mapa de outubro | Comportamento documentado ou observado no código atual | Decisão recomendada |
| --- | --- | --- | --- |
| Pedido após confirmação | Cancelamento em até uma hora, com status e motivo (F20) | Exclusão permanente de pedido próprio por `DELETE /api/orders/[id]`, sem fluxo de cancelamento comercial | Manter exclusão no escopo do portfólio e atualizar o mapa; só criar cancelamento se houver justificativa e novo contrato |
| Confirmação com resposta interrompida | Recuperar a mesma tentativa por chave identificada (F19.D) | Sem repetição automática ou deduplicação; o usuário é orientado a consultar pedidos | Validar a UX atual e decidir se idempotência de API será evolução técnica; não apresentar a recuperação antiga como entregue |
| Aviso inicial | Uma vez por guia durante a visita (F03.B/F23) | Confirmação gravada em `localStorage`, persistente entre visitas do navegador | Preferir um comportamento coerente e previsível e alterar o mapa ou a implementação após teste com usuários |
| Evolução do projeto | Backend, autenticação e deploy estavam planejados | Código, migrações, integrações e implantação já existem | Atualizar o mapa para indicar o estado atual e vincular evidências, sem preservar rótulos de progresso ultrapassados |

Há ainda decisões que não devem ser tomadas apenas porque surgem em um desenho antigo. Por exemplo, qualquer modelo 3D em Blender, código promocional real, processamento de pagamentos ou logística efetiva exigiria escopo próprio e não é necessário para a qualidade do case atual.

## O que continua fora do escopo

Uma loja comercial exigiria validação de estoque real, fornecedores, precificação operacional, regras fiscais, direito do consumidor, rotulagem e conformidade de bebidas, integração de pagamento, antifraude, transportadoras, devoluções e políticas de atendimento. Esses temas não estão implementados e não devem ser sugeridos como funcionais pela interface.

Para o portfólio, o sistema pode ser considerado comercialmente fictício e tecnicamente completo. Uma eventual etapa de comercialização exigiria um novo produto e uma revisão de conformidade. Se houver interesse em demonstrar integração com um gateway, a alternativa aceitável é uma experiência **isolada de sandbox**, sem coletar cartões reais nem confundir transações de teste com cobranças. Essa extensão é opcional, não uma condição de aceite da versão atual.

## O que falta para concluir o case profissional

Os fundamentos técnicos estão representados, mas o portfólio só estará pronto quando houver evidência reproduzível de sua qualidade. É prioritário validar o recebimento de e-mails reais em caixas autorizadas, testar os fluxos críticos em motores de navegador e dispositivos representativos, revisar acessibilidade por teclado e leitor de tela, medir desempenho e verificar a postura de segurança e a operação da implantação. A cobertura existente precisa ser associada a resultados verificáveis, especialmente nos cenários de sessão expirada, múltiplas guias, mudança de endereço e interrupção durante uma confirmação.

Também falta consolidar a narrativa do case: problema, público, evolução do mapa, arquitetura, decisões difíceis, resultados de testes, limitações e demonstração audiovisual curta. **Um projeto de portfólio não precisa esconder suas limitações**; explicá-las e justificar as escolhas mostra maturidade de engenharia.

## Critério de conclusão

A versão de portfólio será considerada pronta quando o fluxo demonstrativo completo estiver acessível em HTTPS; as funções previstas no escopo funcionarem no ambiente correto; não houver falhas críticas abertas de segurança, privacidade, confirmação ou perda de dados; as verificações automatizadas estiverem verdes; e os testes manuais e de UX tiverem registro com dispositivo, data, resultado e evidência. O README deverá permitir reproduzir o trabalho sem credenciais próprias do desenvolvedor, e o case deverá distinguir claramente simulação comercial de serviços técnicos reais.

A sequência de execução, as prioridades e as condições de aceite são mantidas em [Plano de validação e próximos passos](PLANO_DE_VALIDACAO.md). Este escopo só deve ser atualizado quando uma decisão mudar o comportamento pretendido; o avanço de testes deve ser registrado no plano, sem reescrever a história do desenvolvimento.
