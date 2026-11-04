# Licenças de materiais e dependências

Thunder Fang é um projeto de Gabriel Finzetto. As licenças abaixo identificam os direitos sobre materiais e bibliotecas utilizados; seus titulares não são apresentados como coautores do projeto.

## Onde os avisos aparecem

Os avisos ficam nos arquivos de distribuição e nesta documentação. A interface apresenta a autoria de Gabriel Finzetto. Não foi acrescentada uma lista de fornecedores, créditos de ferramentas ou coautores à navegação, às páginas ou ao rodapé.

Arquivos de `public/` são acessíveis diretamente pelo servidor, inclusive os textos de licença. Exemplo local: `http://127.0.0.1:3000/images/flags/LICENSE.txt`. Os arquivos instalados em `node_modules/` ficam somente no ambiente de desenvolvimento e não são enviados ao GitHub.

| Material | Onde é usado | Aviso preservado |
| --- | --- | --- |
| Bandeiras Brasil, Estados Unidos, Espanha e China | Seletores de idioma e país, em `src/components/flag-select.tsx` | [MIT e origem das bandeiras](../public/images/flags/LICENSE.txt) |
| Inter | Textos e controles; importada em `src/app/layout.tsx` | [SIL OFL 1.1 — Inter](../public/licenses/font-inter-OFL.txt) |
| Archivo Black | Títulos e identidade tipográfica; importada em `src/app/layout.tsx` | [SIL OFL 1.1 — Archivo Black](../public/licenses/font-archivo-black-OFL.txt) |
| Noto Sans SC | Texto em chinês; importada em `src/app/layout.tsx` | [SIL OFL 1.1 — Noto Sans SC](../public/licenses/font-noto-sans-sc-OFL.txt) |
| Subdivisões internacionais | Estados, províncias e cidades de seleção do endereço, em `src/domain/regions.ts` e nos dados iniciais das migrações | [Licença upstream LGPL 2.1](../public/licenses/regions-LGPL-2.1.txt) e fonte fixada no cabeçalho do arquivo |
| Dependências npm e componentes incluídos pelo Next.js | Interface, servidor, imagens e ferramentas de desenvolvimento | [Inventário e textos originais de licença](../public/licenses/dependencies.txt) |

Os nomes dos titulares aparecem dentro dos respectivos avisos originais. Por exemplo, a licença das bandeiras contém o aviso de copyright de seu fornecedor; as fontes contêm seus próprios avisos de copyright. Esses textos se referem a esses materiais, sem alterar a autoria do Thunder Fang.

## Dependências diretas

As versões exatas são fixadas em `package.json` e `package-lock.json`. O inventário consolidado também registra dependências transitivas instaladas e avisos de bibliotecas incluídas no pacote Next.js.

| Licença declarada | Pacotes diretos |
| --- | --- |
| MIT | `next`, `react`, `react-dom`, `motion`, `three`, `zod`, `server-only`, `@supabase/ssr`, `@supabase/supabase-js`, `@next/env`, `vitest`, `@types/node`, `@types/react`, `@types/react-dom`, `@types/three` |
| Apache 2.0 | `sharp`, `typescript`, `fake-indexeddb`, `@playwright/test` |
| SIL OFL 1.1 | `@fontsource-variable/inter`, `@fontsource/archivo-black`, `@fontsource/noto-sans-sc` |

Os arquivos originais ficam em `node_modules/<pacote>/LICENSE`, `LICENSE.md`, `license.md` ou `NOTICE.txt`, conforme o pacote. `server-only` declara MIT em seu `package.json`, sem arquivo separado de licença na distribuição instalada. O TypeScript também inclui `NOTICE.txt`; os avisos incluídos pelo Next ficam em `node_modules/next/dist/compiled/`.

Para atualizar as cópias após uma alteração de dependências:

```sh
npm ci
npm run licenses
```

O script `scripts/prepare-licenses.mjs` copia os textos existentes sem reescrever os avisos. Pacotes nativos opcionais variam por sistema operacional; suas licenças acompanham a instalação correspondente. Os arquivos de `public/licenses/` acompanham a entrega e ficam disponíveis em `/licenses/`.

## Dados de subdivisões

A lista de endereço usa um subconjunto de dados ISO 3166-2 distribuídos pelo pycountry, revisão [`395b601858d44e410172c990bd132151bd145e5b`](https://github.com/pycountry/pycountry/tree/395b601858d44e410172c990bd132151bd145e5b), que declara `LGPL-2.1-only`. A origem dos dados é o projeto Debian iso-codes. A adaptação para o Thunder Fang seleciona as entradas dos Estados Unidos, Espanha e China e as organiza como dados TypeScript; não inclui a biblioteca Python. A referência upstream permanece em `src/domain/regions.ts`, e a cópia da licença acompanha os dados. O arquivo-fonte da seleção é distribuído no repositório.

## Autoria e condições de uso

A autoria e a direção do projeto pertencem a Gabriel Finzetto. Não foi escolhida uma licença de código aberto para o código e as artes próprios nesta etapa. As licenças dos componentes de terceiros continuam aplicáveis aos respectivos componentes.

A licença MIT exige preservar seu aviso e texto de permissão nas cópias abrangidas. A OFL exige que a fonte redistribuída acompanhe seu copyright e sua licença. Por isso, esses avisos são mantidos nos arquivos, sem tratá-los como créditos de desenvolvimento do Thunder Fang.

Referências: [texto oficial MIT](https://opensource.org/license/mit), [texto oficial SIL OFL 1.1](https://openfontlicense.org/open-font-license-official-text/) e [licença da revisão upstream dos dados](https://github.com/pycountry/pycountry/blob/395b601858d44e410172c990bd132151bd145e5b/LICENSE.txt).
