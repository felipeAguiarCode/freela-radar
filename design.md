# Design spec — Freela Radar

Documento para recriar a tela do dashboard **Freela Radar** no Claude Code.

## Objetivo

Construir uma interface web responsiva, estilo SaaS moderno, para um radar de oportunidades freelancer com monitoramento ativo, agentes de IA, oportunidades recentes, sites monitorados, atividade recente e resumo do dia.

A tela deve parecer um painel de produto real: limpa, clara, com cartões brancos, bordas sutis, sombras leves, espaçamento generoso e acentos em roxo, verde e azul.

---

## Stack sugerida

Use uma implementação simples em **React + TypeScript + Tailwind CSS**.

Se estiver usando Next.js, crie a tela em `app/page.tsx`. Se estiver usando Vite, crie em `src/App.tsx`.

Bibliotecas recomendadas:

- `lucide-react` para ícones.
- Tailwind CSS para layout e estilos.
- Não use biblioteca de componentes pronta; recrie os componentes visualmente.

---

## Layout geral

A tela tem resolução visual aproximada de desktop widescreen, com fundo quase branco e uma barra lateral fixa.

Estrutura principal:

```txt
┌───────────────────────────────────────────────────────────────┐
│ Sidebar │ Header superior                                     │
│         ├───────────────────────────────┬─────────────────────┤
│         │ Conteúdo principal             │ Painel lateral      │
│         │                               │                     │
└───────────────────────────────────────────────────────────────┘
```

Dimensões recomendadas:

- Altura mínima: `100vh`.
- Sidebar: `248px` de largura.
- Área principal: `flex-1`.
- Padding geral do conteúdo: `28px 32px`.
- Grid do conteúdo: coluna principal `minmax(0, 1fr)` e coluna lateral `360px`.
- Gap entre colunas: `28px`.

Cores base:

```css
--bg-page: #fbfbfd;
--bg-card: #ffffff;
--border: #e8e8ef;
--text-primary: #171827;
--text-secondary: #667085;
--text-muted: #98a2b3;
--purple: #6d4aff;
--purple-soft: #f1edff;
--green: #22c55e;
--green-soft: #eaf8ef;
--blue: #2388ff;
--blue-soft: #eaf4ff;
--amber: #d98b00;
--amber-soft: #fff7e6;
```

Use fonte sans-serif moderna. Sugestão: `Inter`, `Geist` ou `system-ui`.

---

## Sidebar

A sidebar ocupa toda a altura, com fundo branco e borda direita sutil.

### Topo

Logo no topo, alinhado à esquerda:

- Ícone circular em roxo, com alvo/radar.
- Texto: **Freela Radar**.
- Espaçamento superior: `32px`.
- Padding horizontal: `28px`.

### Navegação

Itens de navegação em coluna, com gap de `12px`:

1. `Radar` ativo.
2. `Agentes`.
3. `Settings`.

O item ativo tem:

- Fundo roxo suave `#f1edff`.
- Texto roxo.
- Ícone roxo.
- Border radius `12px`.
- Altura aproximada `52px`.

Itens inativos:

- Texto cinza escuro.
- Ícones cinza.
- Hover com fundo levemente cinza.

### Rodapé da sidebar

Fixo no final:

- Avatar circular com foto ou placeholder.
- Nome: **André Silva**.
- Badge pequeno: **Pro** em roxo suave.
- Indicador verde com texto:
  - **Dados locais**
  - `SQLite`

---

## Header superior

Fica no topo da área principal, com altura aproximada de `88px`, fundo branco e borda inferior sutil.

### Lado esquerdo

Indicador de status:

- Ícone pequeno verde circular.
- Título: **Sistema ativo**.
- Subtexto: `Varredura automática · a cada 5 min`.

### Lado direito

Em linha, alinhado à direita:

1. Botão com ícone play:
   - Texto: **Executar varredura agora**.
   - Fundo branco.
   - Borda cinza.
   - Border radius `12px`.
   - Altura `44px`.

2. Campo de busca:
   - Placeholder: `Buscar oportunidades...`
   - Ícone de lupa à esquerda.
   - Atalho `⌘K` à direita.
   - Largura aproximada `360px`.

3. Botão de notificação:
   - Ícone sino.
   - Badge vermelho pequeno no canto superior direito.

---

## Área principal

Abaixo do header, use grid com duas colunas.

### Coluna principal

Contém:

1. Cabeçalho do radar.
2. Card de tags monitoradas.
3. Seção de agentes IA.
4. Card de oportunidades recentes.

### Painel lateral direito

Contém:

1. Sites monitorados.
2. Atividade recente.
3. Resumo do dia.
4. Barra inferior de status do banco e backup.

---

## Cabeçalho do radar

No topo da coluna principal:

- Ícone de radar/alvo à esquerda.
- Título: **Radar ativo**.
- Subtexto: `Monitorando oportunidades que combinam com o que você procura.`

Estilo:

- Título: `20px`, peso `700`.
- Subtexto: `14px`, cinza.
- Margem inferior: `20px`.

---

## Card: Tags monitoradas

Card branco com borda sutil e radius `16px`.

Conteúdo:

- Título pequeno: **Tags monitoradas**.
- Link no canto direito: `Editar tags` com ícone de lápis.
- Lista de chips:
  - `React`
  - `Node.js`
  - `TypeScript`
  - `API`
  - `SaaS`
  - `IA`
  - `PostgreSQL`
  - `Integração`
  - `Dashboard`
  - botão `+`

Chips:

- Fundo branco ou roxo muito claro.
- Borda `#e5ddff`.
- Texto roxo.
- Radius `999px`.
- Padding `7px 12px`.
- Fonte `13px`.

---

## Seção: Agentes IA

Cabeçalho:

- Título: **Agentes IA**.
- Subtexto: `3 agentes trabalhando para transformar oportunidades em propostas vencedoras.`
- Link à direita: `Ver detalhes →`.

Abaixo, três cards lado a lado.

### Card de agente — estrutura comum

Cada card tem:

- Fundo branco.
- Borda `#e8e8ef`.
- Radius `16px`.
- Padding `20px`.
- Altura aproximada `300px`.
- Layout vertical.

Topo:

- Ícone dentro de quadrado arredondado suave.
- Nome do agente em negrito.
- Descrição curta.
- Badge **Ativo** no canto direito.

Miolo:

- Label: `Trabalhando em`.
- Nome do projeto em destaque.
- Fonte/origem e tempo.
- Label: `Etapa atual`.
- Descrição da etapa.
- Barra de progresso.
- Percentual à direita da barra.
- Label: `Próxima etapa`.
- Descrição da próxima etapa.

Rodapé:

- Botão contornado de largura total.

### Dados dos cards

#### 1. PRD Agent

- Ícone: clipboard/documento.
- Cor do ícone: roxo.
- Subtítulo: `Documento de Requisitos`.
- Trabalhando em: **Plataforma de gestão financeira**.
- Origem: `Workana · há 2 min`.
- Etapa atual: `Estruturando requisitos funcionais`.
- Progresso: `68%`.
- Próxima etapa: `Definir critérios de aceite`.
- Botão: `Abrir documento`.

#### 2. ADR Agent

- Ícone: arquitetura/cloud/servidor.
- Cor do ícone: azul.
- Subtítulo: `Arquitetura de Solução`.
- Trabalhando em: **API REST para integração com ERP**.
- Origem: `99Freelas · há 1 min`.
- Etapa atual: `Definindo arquitetura e stack`.
- Progresso: `82%`.
- Próxima etapa: `Modelar fluxos e integrações`.
- Botão: `Abrir documento`.

#### 3. Pitch Agent

- Ícone: megafone/proposta.
- Cor do ícone: verde.
- Subtítulo: `Proposta de Vendas`.
- Trabalhando em: **Dashboard administrativo com IA**.
- Origem: `Freelancer.com · há 30 seg`.
- Etapa atual: `Escrevendo proposta personalizada`.
- Progresso: `84%`.
- Próxima etapa: `Ajustar tom e argumentos`.
- Botão: `Abrir proposta`.

### Barras de progresso

Use uma trilha cinza clara com altura `5px` e radius total.

Cores:

- PRD: roxo.
- ADR: azul.
- Pitch: verde.

---

## Card: Oportunidades recentes

Card branco com borda e radius `16px`.

Cabeçalho:

- Título: **Oportunidades recentes**.
- Link: `Ver todas`.

Lista com 5 oportunidades. Cada linha tem:

- Ícone da plataforma.
- Título da oportunidade.
- Origem e tempo.
- Chips de tags.
- Badge de match.
- Faixa de preço.

Linhas:

1. **Sistema SaaS para controle de assinaturas**
   - Workana · há 3 min
   - Tags: React, Node.js, Stripe, SaaS
   - `95% match`
   - `R$ 4.000 - 7.000`

2. **Integração de pagamentos com múltiplas gateways**
   - 99Freelas · há 8 min
   - Tags: API, Node.js, PostgreSQL, Integração
   - `92% match`
   - `R$ 2.000 - 3.500`

3. **Aplicativo desktop para automação de processos**
   - Freelancer.com · há 12 min
   - Tags: Electron, TypeScript, Automação, Desktop
   - `88% match`
   - `R$ 3.000 - 5.000`

4. **Chatbot com IA para atendimento ao cliente**
   - Upwork · há 15 min
   - Tags: IA, OpenAI, Node.js, SaaS
   - `85% match`
   - `R$ 2.500 - 4.000`

5. **Dashboard de métricas em tempo real**
   - RemoteOK · há 18 min
   - Tags: React, Charts, WebSocket, Dashboard
   - `78% match`
   - `R$ 2.000 - 3.000`

Rodapé central:

- Link: `Mostrar mais oportunidades ˅`.

### Ícones das plataformas

Recrie como quadrados arredondados de `36px`:

- Workana: letra `W`, roxo/rosa.
- 99Freelas: `99`, verde.
- Freelancer.com: símbolo ou pássaro simples, azul.
- Upwork: `UP`, verde.
- RemoteOK: círculo/zero preto.

Não precisa usar logos oficiais; placeholders tipográficos bastam.

---

## Painel lateral: Sites monitorados

Card branco com radius `16px`.

Cabeçalho:

- Título: **Sites monitorados**.
- Link: `Gerenciar →`.

Tabela/lista com 5 linhas:

| Site | Status | Última varredura | Número |
| --- | --- | --- | --- |
| Workana | Ativo | há 2 min | 12 |
| 99Freelas | Ativo | há 3 min | 18 |
| Freelancer.com | Ativo | há 4 min | 15 |
| Upwork | Ativo | há 5 min | 9 |
| RemoteOK | Pausado | — | 0 |

Status ativo:

- Badge verde suave com ponto verde.

Status pausado:

- Badge amarelo suave.

---

## Painel lateral: Atividade recente

Card branco com radius `16px`.

Cabeçalho:

- Título: **Atividade recente**.
- Link: `Ver tudo`.

Itens:

1. **PRD Agent gerou documento**
   - `Plataforma de gestão financeira`
   - `há 2 min`

2. **Nova oportunidade encontrada**
   - `API REST para integração com ERP`
   - `há 3 min`

3. **ADR Agent atualizou arquitetura**
   - `Definiu stack e padrões`
   - `há 4 min`

4. **Pitch Agent gerou proposta**
   - `Dashboard administrativo com IA`
   - `há 6 min`

5. **Varredura concluída**
   - `12 novas oportunidades encontradas`
   - `há 8 min`

Cada item deve ter:

- Ícone quadrado pequeno com fundo suave.
- Texto principal em negrito.
- Texto secundário cinza.
- Tempo alinhado à direita.

---

## Painel lateral: Resumo do dia

Card branco com radius `16px`.

Título: **Resumo do dia**.

Quatro métricas em colunas, separadas por bordas verticais sutis:

1. Encontradas
   - Valor: `24`
   - Variação: `+8 hoje`

2. Analisadas
   - Valor: `16`
   - Variação: `+5 hoje`

3. Propostas
   - Valor: `7`
   - Variação: `+2 hoje`

4. Conversão
   - Valor: `18%`
   - Variação: `+3%`

Valores em preto, grandes e fortes. Variações em verde.

---

## Barra inferior direita

No rodapé da coluna lateral, alinhe três elementos:

1. Card pequeno: `Banco de dados  OK` com ponto verde.
2. Card pequeno: `Último backup: hoje 09:15` com ícone verde.
3. Botão quadrado com reticências `...`.

---

## Componentes reutilizáveis

Crie componentes pequenos para manter o código organizado:

```txt
AppShell
Sidebar
TopBar
StatusBadge
TagChip
AgentCard
OpportunityRow
MonitoredSitesCard
ActivityCard
DailySummaryCard
PlatformIcon
ProgressBar
```

---

## Estados visuais

### Hover

- Cards: manter sombra sutil ou aumentar levemente a borda.
- Botões: fundo `#f8f8fb`.
- Links roxos: escurecer levemente.

### Focus

Elementos interativos devem ter ring roxo suave:

```css
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300
```

---

## Responsividade

Para desktop, manter o layout de duas colunas.

Para telas menores que `1200px`:

- Sidebar pode continuar fixa.
- Grid principal vira uma coluna.
- Painel lateral vai para baixo.
- Cards dos agentes podem virar duas colunas ou uma coluna.

Para telas menores que `768px`:

- Sidebar vira topo ou drawer simples.
- Header empilha busca e ações.
- Cards dos agentes ficam em uma coluna.
- Oportunidades podem esconder algumas tags para evitar quebra.

---

## Instruções para Claude Code

1. Crie a aplicação com React, TypeScript e Tailwind.
2. Recrie a tela como uma página estática primeiro; não precisa integrar APIs reais.
3. Use arrays de dados mockados para agentes, oportunidades, sites e atividades.
4. Use `lucide-react` para ícones como `Radar`, `Bot`, `Settings`, `Bell`, `Search`, `Play`, `FileText`, `Cloud`, `Megaphone`, `Pencil`, `ExternalLink`, `Database`, `CheckCircle`, `MoreHorizontal`.
5. Dê prioridade à fidelidade visual: espaçamento, bordas, cards, hierarquia tipográfica e cores.
6. Não use imagens externas para logos. Crie ícones de plataformas com letras/símbolos em blocos coloridos.
7. Mantenha todo o conteúdo em português, exatamente como descrito neste documento.
8. Garanta que a tela tenha aparência polida em desktop antes de ajustar o responsivo.

---

## Exemplo de estrutura de dados

```ts
type Agent = {
  name: string;
  subtitle: string;
  project: string;
  source: string;
  currentStep: string;
  progress: number;
  nextStep: string;
  color: 'purple' | 'blue' | 'green';
  buttonLabel: string;
};

type Opportunity = {
  platform: 'workana' | '99freelas' | 'freelancer' | 'upwork' | 'remoteok';
  title: string;
  source: string;
  tags: string[];
  match: number;
  budget: string;
};
```

---

## Prompt recomendado para usar no Claude Code

Copie e cole este prompt no Claude Code:

```txt
Recrie a tela do dashboard Freela Radar usando React, TypeScript e Tailwind CSS.

Use o arquivo design.md como especificação visual e funcional. A tela deve ser uma página estática com dados mockados, sem backend. Priorize fidelidade visual ao screenshot: sidebar fixa, header superior, cards brancos com bordas sutis, grid principal com cards de agentes, lista de oportunidades recentes, painel lateral com sites monitorados, atividade recente e resumo do dia.

Crie componentes reutilizáveis para Sidebar, TopBar, AgentCard, OpportunityRow, MonitoredSitesCard, ActivityCard e DailySummaryCard. Use lucide-react para ícones. Não use logos externos; represente plataformas por blocos tipográficos coloridos. Mantenha todo o texto em português.

Depois de implementar, rode o projeto, corrija erros de TypeScript/lint/build e ajuste espaçamentos até a tela ficar visualmente próxima da referência.
```

---

## Checklist de aceitação

- [ ] Sidebar branca fixa com logo, navegação e usuário no rodapé.
- [ ] Header com status, botão de varredura, busca e sino.
- [ ] Card de tags monitoradas com chips roxos.
- [ ] Três cards de agentes com progresso e CTA.
- [ ] Lista de oportunidades recentes com match e orçamento.
- [ ] Painel lateral com sites monitorados, atividade recente e resumo do dia.
- [ ] Cores, espaçamentos e bordas semelhantes ao screenshot.
- [ ] Layout desktop fiel e responsivo básico funcionando.
