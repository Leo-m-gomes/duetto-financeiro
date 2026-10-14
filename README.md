# Duetto Financeiro

Sistema financeiro familiar de Leo e Pri: contas a pagar, receitas, salários, relatórios, notas e importação de faturas de cartão. Aplicação web estática (sem build) com Firebase (Google Login + Firestore) e dados sincronizados em tempo real entre os dois usuários.

---

## ⚠️ Regra de manutenção deste documento (obrigatória)

**Este README é a fonte de verdade das regras, dados, restrições e cálculos do sistema. Ele DEVE ser atualizado sempre que o sistema for alterado.**

* Toda mudança que altere comportamento, cálculo, campo de dado, coleção do Firestore, permissão, tela, filtro, atalho, dependência externa ou restrição **atualiza este arquivo no mesmo commit (ou no mesmo pull request)**.
* Pull request que muda regra de negócio sem atualizar o README **não deve ser aprovado**.
* Vale para pessoas e para assistentes de IA (Claude, Copilot etc.): antes de concluir qualquer tarefa no código, revise as seções afetadas abaixo e registre a mudança no [Histórico de alterações](#16-histórico-de-alterações).
* Se o código e o README divergirem, trate como bug: corrija o que estiver errado e alinhe os dois.

**Checklist antes de commitar**

* [ ] A regra ou cálculo alterado está descrito na seção correspondente?
* [ ] Campos novos ou removidos estão no [Modelo de dados](#6-modelo-de-dados-firestore)?
* [ ] Permissões e restrições continuam corretas?
* [ ] O [Histórico de alterações](#16-histórico-de-alterações) tem uma linha nova com data e resumo?

---

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Como rodar e publicar](#2-como-rodar-e-publicar)
3. [Arquitetura](#3-arquitetura)
4. [Interface: shell, temas e atalhos](#4-interface-shell-temas-e-atalhos)
5. [Usuários, acesso e permissões](#5-usuários-acesso-e-permissões)
6. [Modelo de dados (Firestore)](#6-modelo-de-dados-firestore)
7. [Convenções: datas, dinheiro, responsáveis](#7-convenções-datas-dinheiro-responsáveis)
8. [Regras e cálculos de contas](#8-regras-e-cálculos-de-contas)
9. [Receitas, salários, INSS e IR](#9-receitas-salários-inss-e-ir)
10. [Telas e seus cálculos](#10-telas-e-seus-cálculos)
11. [Importação de planilhas (Upload Cards)](#11-importação-de-planilhas-upload-cards)
12. [Notas e Ações](#12-notas-e-ações)
13. [Exclusão, auditoria e backup](#13-exclusão-auditoria-e-backup)
14. [Preferências e armazenamento local](#14-preferências-e-armazenamento-local)
15. [Restrições e limitações conhecidas](#15-restrições-e-limitações-conhecidas)
16. [Histórico de alterações](#16-histórico-de-alterações)

---

## 1. Visão geral

| Item | Valor |
|---|---|
| Usuários | Leo (administrador) e Pri |
| Tipo | SPA estática (HTML + CSS + JavaScript puro, sem framework e sem build) |
| Backend | Firebase Authentication (Google) e Cloud Firestore, projeto `duetto-financeiro` |
| Hospedagem | GitHub Pages, caminho `/duetto-financeiro/` (`manifest.json` → `start_url`) |
| PWA | `manifest.json` instalável; **sem service worker** (não funciona offline) |
| Idioma e moeda | Português do Brasil; moeda padrão BRL |

**Bibliotecas externas (CDN, versões fixas)**

| Biblioteca | Versão | Uso |
|---|---|---|
| Firebase compat (app, auth, firestore) | 9.23.0 | Login e banco |
| Chart.js | 4.4.1 | Gráficos |
| SheetJS (xlsx) | 0.18.5 | Planilha modelo, importação e backup Excel |
| jsPDF + AutoTable | 2.5.1 + 3.8.2 | PDF do Relatório |
| Google Fonts | Playfair Display, DM Sans | Tipografia |

---

## 2. Como rodar e publicar

* **Local:** sirva a pasta por HTTP (as telas são carregadas via `fetch`, então `file://` não funciona):
  `python3 -m http.server 8000` e abra `http://localhost:8000`.
  O login Google exige que o domínio esteja autorizado no Firebase Console (Authentication → Settings → Authorized domains).
* **Publicação:** push na branch publicada pelo GitHub Pages. Não há etapa de build.
* **Cache do navegador:** arquivos CSS/JS não têm hash de versão. Após publicar, pode ser preciso recarregar sem cache (Ctrl+Shift+R).

---

## 3. Arquitetura

### 3.1 Estrutura de pastas

```
index.html            Shell: telas de loading/login/negado, trilho, topbar, bottom nav, ordem dos scripts
app.js                Objeto APP: boot, navegação, filtros, topbar, renderPage, filtro global de responsável
style.css             Estilos legados (componentes, páginas, dark mode, temas Leo/Pri, mobile)
manifest.json         PWA
css/
  theme.css           Tokens globais (cores, espaçamento, z-index), reset, tokens do modo escuro
  tables.css          Tabelas, badges, botões de ação, paginação, padrão mob-card
  notes.css           Tela Notas e Ações
  shell.css           Trilho de navegação, topbar e busca rápida (Ctrl K)
js/
  firebase-config.js  Inicializa Firebase (fbAuth, fbDb)
  fin-state.js        Constantes, formatação, REGRAS DE NEGÓCIO CENTRAIS, STATE
  fin-cache.js        CACHE: espelho local do Firestore + consultas + cálculo INSS/IR
  security.js         Login Google, e-mails permitidos, papéis (SEC / AUTH)
  fin-db.js           FS: único ponto de escrita de contas/receitas/cadastros + logs; listeners
  router.js           ROUTER: carrega views/*.html em #appMain, rotas e restrição de admin
  notes.js            Módulo Notas e Ações (isolado, namespace NT)
  ui-*.js             Toast/tema/privacidade, modais, tabelas/ordenação, gráficos, período, máscara monetária
  dashboard.js        Dashboard (KPIs, insights, gráficos, pendentes)
  contas.js           Contas (lista, pagamento, parcelas, cadastro)
  receitas.js         Receitas (lista unificada, gráfico, outras receitas)
  salarios.js         Salários, cálculo detalhado, tabelas fiscais
  relatorios.js       Relatório (filtros, busca, CSV) e helpers de texto
  pareto.js           Pareto 80/20
  duplicatas.js       Detecção de contas repetidas (DUP)
  recorrentes.js      Geração de recorrentes para outro ano
  pagamento-massa.js  Pagamento de várias contas
  acoes-extra.js      Desfazer pagamento e PDF do Relatório
  upload.js           Upload Cards (modelo Excel, importação)
  backup.js           Backup JSON/Excel
  configuracoes.js    Configurações (usuários, backup, tabelas, logs, lixeira, preferências)
  lixeira.js          Lixeira de contas
  gerenciar.js        Categorias e formas de pagamento
  command-palette.js  Busca rápida e ações (Ctrl K / ⌘K / "/")
views/                Fragmentos HTML de cada tela + modals.html (todos os modais)
```

`views/salario.html` e `views/backup.html` existem: a rota `backup` está registrada (admin), `salario` não tem rota (legado; salários são geridos pelo modal "Gerenciar salários").

### 3.2 Inicialização

1. `index.html` carrega os scripts **em ordem** (a ordem importa: módulos usam globais dos anteriores): firebase-config → fin-state → fin-cache → security → fin-db → router → notes → app → ui-* → features → command-palette.
2. `security.js` observa o login. E-mail fora da lista → tela "Acesso negado". E-mail permitido → grava acesso em `logs_acesso`, roda `seedIfEmpty()` e liga os listeners.
3. Os listeners (`onSnapshot`) preenchem o `CACHE`. Quando 5 coleções ficam prontas (contas, salarios, outras, cats, formas), `APP.onCacheReady()` mostra o app e roda `APP.boot()`.
4. `boot()` injeta `views/modals.html`, liga navegação/topbar/filtros e abre o Dashboard.

### 3.3 Dados em tempo real

* Toda leitura de tela é síncrona sobre o `CACHE` (sem consulta ao Firestore por render).
* Qualquer alteração no Firestore (por qualquer um dos dois usuários) dispara o listener, atualiza o `CACHE` e redesenha a tela atual (`APP.renderPage`).
* Exceções que leem direto do Firestore sob demanda: logs, logs de acesso, lixeira, importações, cartões e backup.

### 3.4 Roteamento

* `ROUTER.navigate(page)` busca `views/<page>.html` (com cache em memória), injeta em `#appMain`, marca o item ativo na navegação (`.active` + `aria-current`), atualiza o título e chama `APP.renderPage(page)`.
* Rotas: `dashboard`, `contas`, `receitas`, `relatorio`, `notas`, `upload` (admin), `backup` (admin), `config` (admin).

---

## 4. Interface: shell, temas e atalhos

### 4.1 Trilho de navegação (desktop, acima de 768px)

* Coluna fixa de **76px** (`--sw` em `theme.css`) com ícone e rótulo curto. Ordem e grupos: **Dashboard, Contas, Receitas** · **Relatório, Notas** · **Upload, Config** (o último grupo e seu divisor só aparecem para o admin).
* O item ativo tem fundo na cor do tema e indicador luminoso na borda esquerda.
* Base do trilho: botão de modo claro/escuro (lua/sol) e avatar do usuário logado (inicial; verde para Leo, rosa para Pri).
* A largura é fixa (não existe mais "recolher menu"). A chave antiga `dt_sb_collapsed` é apagada no boot.

### 4.2 Topbar

`[Duetto / Tela  selo de período] · [busca Ctrl K] · [filtro de responsável | ações da tela | privacidade | sair]`

* **Selo de período:** mostra o período da tela atual, lido dos filtros da própria tela (período personalizado tem prioridade sobre ano/mês):
  `Out 2026`, `2026 inteiro`, `Out · todos os anos`, `Todo o histórico`, `Jan → Mar 2026`. Vale para Dashboard, Contas, Relatório e Receitas (ano e mês da tela). Some em Notas, Upload, Backup e Config.
* **Filtro global de responsável:** avatares Todos · L (Leo) · P (Pri) · L+P (Leo & Pri, só compartilhadas). O ativo mostra o nome. Vale para Dashboard, Contas, Receitas, Relatório e logs da Config; fica desativado em Notas, Upload e Backup; não afeta modais; **não é salvo** (volta para Todos ao recarregar).
* **Ações por tela** (`APP.updateTopbarBtns`): Contas → Nova conta, Gerar recorrentes, Exportar CSV. Receitas → Nova receita, Gerenciar salários. Ações secundárias aparecem só como ícone (com dica e `aria-label`).

### 4.3 Busca rápida (Ctrl K / ⌘K / "/")

Módulo `js/command-palette.js`. **Somente leitura:** não grava nada, toda ação chama funções do `APP` (que já validam e registram log).

* **Abrir:** Ctrl K (Windows/Linux), ⌘K (Mac), tecla `/` fora de campos de texto, ou clique na barra de busca. Não abre fora do app (login) nem com um modal aberto.
* **Contas:** busca em **todo o histórico**, com a mesma regra de texto do Relatório (descrição, nota, responsável, categoria, forma, parcela, autores, data em ISO e dd/mm/aaaa, valores em `1.234,56` e `1234,56`), sem acento, sem diferença de maiúsculas, vários termos combinados com E. Mostra até 7, mais "Ver resultados em Contas".
  Ordem: em aberto antes de pagas → descrição que começa com o termo → contém o termo → outros campos → atrasadas antes de pendentes → vencimento mais próximo de hoje.
  Valor exibido: pendente mostra o que falta pagar (`vPendente`); paga mostra o valor pago (`vEfetivo`).
* **Outras receitas:** até 3 por descrição, responsável ou ano (as de ano mais recente primeiro); o ano aparece na linha; Enter abre a edição.
* **Ações rápidas:** Nova conta, Nova receita, Ver contas em atraso (abre Contas com status atrasado e todo o histórico), Gerar recorrentes, Gerenciar salários, Exportar CSV (só na tela Contas), modo claro/escuro, ocultar/mostrar valores.
* **Ir para:** telas do app (Upload e Config só para o admin).
* **Teclado:** ↑/↓ ou Tab navegam, Enter abre, **Shift+Enter abre o pagamento** da conta selecionada, Esc fecha e devolve o foco.

### 4.4 Temas

* **Claro/escuro:** classe `dark` em `<html>`, salvo em `localStorage.dt_dark`. Gráficos são redesenhados ao trocar (Canvas não lê variáveis CSS sozinho).
* **Tema Pri (rosa):** classe `theme-pri` aplicada **quando o filtro de responsável é "Pri"**; `theme-leo` quando é "Leo". É só visual (troca `--palm` e derivados).
* Cores de identidade (avatares L/P) não mudam com o tema.
* **Texto sobre a cor do tema** usa o token `--on-palm` (branco no claro; verde quase preto no escuro; roxo escuro no escuro com tema Pri). Vale para botão primário, barra de seleção de contas, cabeçalho do Pareto, abas e paginação ativas, cartão de salário e contadores. No escuro com tema Pri o botão primário é magenta escuro com texto branco.
* **Hierarquia de texto no escuro:** `--t3` = 62% e `--t4` = 48% de opacidade (antes 40% e 24%, que davam 3:1 e 2:1). Meta: nenhum texto abaixo de 3:1.
* **Modo privacidade** (ícone de olho): borra valores monetários (`.money`, KPIs, totais). **Não é salvo**: sempre começa desligado.

### 4.5 Modais

* Fecham no **X**, nos botões de cancelar ou com clique no fundo escuro. O clique no fundo só fecha quando o botão do mouse é **pressionado e solto no fundo** (`ligarFecharNoFundo`, em `js/ui-modals.js`). Selecionar texto arrastando de dentro da caixa para fora (ou o contrário) não fecha o modal nem perde o que foi digitado. Vale para todos os modais do app e de Notas.
* Modal que espera uma decisão (Duplicatas) trata o clique no fundo como "não cadastrar" (`ov._aoFecharNoFundo`), liberando o botão Salvar.

### 4.6 Responsivo

| Largura | Comportamento |
|---|---|
| > 1100px | Topbar completo, filtro de responsável em avatares |
| ≤ 1100px | Filtro de responsável vira select compacto |
| ≤ 900px | Busca vira só o ícone de lupa |
| ≤ 768px | Trilho some; navegação pela **bottom nav** flutuante (esconde ao rolar para baixo) |
| ≤ 640px | Topbar compacto (botões só ícone, 40px de toque), filtros recolhíveis, tabelas viram cartões |

A coluna principal tem `min-width:0`: conteúdo largo (tabela de Contas) rola dentro do próprio contêiner, sem rolagem horizontal da página.

---

## 5. Usuários, acesso e permissões

| Regra | Onde |
|---|---|
| Só entram os e-mails `leonardo.phn7@gmail.com` (Leo) e `pri.alverim@gmail.com` (Pri) | `security.js` → `ALLOWED_EMAILS` |
| Mapeamento e-mail → usuário | `EMAIL_TO_USUARIO` |
| Admin: **Leo** | `ADMIN_USERS` |
| Telas só do admin: Upload Cards, Backup, Configurações | `router.js` (`adminOnly`) e `APP.renderPage` |
| Itens Upload/Config da navegação só aparecem para Leo | `APP.boot` |
| Notas: admin edita/exclui qualquer nota; autor edita a própria; nota com responsável "Leo & Pri" libera os dois | `notes.js` → `ntCanEdit` |
| Todo acesso (abertura do app) é registrado | coleção `logs_acesso` |

* Login por popup Google; se o navegador bloquear o popup, cai para redirect.
* Sair pede confirmação.
* Usuários extras cadastrados em Configurações (`config/usuarios`) **não ganham acesso** por isso: o acesso depende de `ALLOWED_EMAILS` no código e das regras do Firestore (ver [Restrições](#15-restrições-e-limitações-conhecidas)).

---

## 6. Modelo de dados (Firestore)

### 6.1 `contas` (despesas)

| Campo | Tipo | Regra |
|---|---|---|
| `conta` | string | Descrição. Obrigatório |
| `nota` | string | Opcional |
| `resp` | `'Leo'` \| `'Pri'` \| `'Leo & Pri'` | Obrigatório. `Leo & Pri` = compartilhada |
| `catId` | string | ID em `categorias`. Obrigatório. Legado: campo `cat` com o nome |
| `formaId` | string | ID em `formas`. Obrigatório. Legado: campo `forma` com o nome |
| `data` | `YYYY-MM-DD` | **Vencimento.** Obrigatório. Define o mês da conta |
| `dataCompra` | `YYYY-MM-DD` \| null | Opcional (cartão). Não pode ser depois do vencimento. Usado na detecção de duplicatas |
| `vPagar` | number (reais) | Valor previsto da parcela. Obrigatório, > 0. **Nunca é sobrescrito pelo pagamento** |
| `vPago` | number \| null | Valor efetivamente pago (pode ter juros/desconto). `null` = não pago. Em compartilhada com pagamento individual guarda a soma das partes |
| `pagamentos` | `{Leo?:{valor,paidBy,paidAt}, Pri?:{...}}` | Só em compartilhadas pagas por parte |
| `paidBy`, `paidAt` | string, `YYYY-MM-DD` | Quem registrou e quando |
| `parcela` | string `"i de n"` | Padrão `"1 de 1"` |
| `grupo` | string `grp-<timestamp>[-sufixo]` | Liga as parcelas do mesmo parcelamento |
| `recorrente` | boolean | Marca para "Gerar recorrentes" |
| `createdBy`, `updatedBy` | `'Leo'` \| `'Pri'` | Auditoria |
| `createdAt`, `updatedAt` | timestamp do servidor | |
| `origem`, `planilhaId` | string | Só em contas importadas (`origem:'importacao'`) |
| `restauradoPor`, `restauradoEm` | string | Só em contas restauradas da lixeira |

### 6.2 Demais coleções

| Coleção / doc | Conteúdo |
|---|---|
| `salarios` | `{nome, pessoa:'Leo'\|'Pri', historico:[{anoInicio, mesInicio:0-11, deps, salario, bonificacao, inss, ir, liquido, updatedBy, updatedAt}], createdBy}`. Entradas antigas podem não ter `anoInicio` (ver 9.3) |
| `outras_receitas` | `{desc, resp:''\|'Leo'\|'Pri', ano, valores:[12 números, Jan..Dez do ano], createdBy, createdAt, updatedBy, updatedAt}`. `resp:''` = **Ambos**. Receitas antigas podem não ter `ano` (ver 9.1) |
| `categorias` | `{nome}` (nome único, sem diferenciar maiúsculas) |
| `formas` | `{nome}` (formas de pagamento; nome único) |
| `config/tabelas` | `{ir:[{de,ate,al,ded}], inss:[{de,ate,al,ded}], dedDep, tetoINSS, vigencia}` |
| `config/usuarios` | `{lista:[{nome,email,role,adicionadoPor,em}]}` (informativo) |
| `cartoes` | `{nome, bandeira, createdBy, createdAt}` (usados no nome da planilha modelo) |
| `importacoes` | `{planilhaId, nome, qtdContas, qtdDocs, importadoPor, data, hora, createdAt}` |
| `lixeira` | Conta excluída + `{origemId, origemColecao, excluidoPor, excluidoEm, motivo, excluidoAt}` |
| `logs` | Auditoria de contas: `{evento, contaId, conta, usuario, timestamp, detalhes, valor, resp, parcela, alteracoes, tipoPagamento}` |
| `logs_acesso` | `{usuario, email, timestamp, tipo:'login', userAgent}` |
| `notes` | `{titulo, descricao, tipo:'anotacao'\|'acao', status:'ativa'\|'concluida', prazo, responsavel, autor, criadaEm, atualizadaEm, itens:[{id, descricao, data, nota, vPrevistoCent, vRealizadoCent}]}` |
| `notes_trash` | Nota excluída + `{origemId, excluidoPor, excluidoEm, excluidoAt}` |
| `notes_log` | `{evento, noteId, detalhes, usuario, timestamp, serverTimestamp}` |
| `activity_log` | Legado: incluído no backup, não é mais gravado |

### 6.3 Carga inicial (`seedIfEmpty`)

Só quando a coleção está vazia: 30 categorias padrão (`SEED_CATS`), 12 formas (`SEED_FORMAS`) e `config/tabelas` com `DEFAULT_TABELAS` (ver 9.3).

---

## 7. Convenções: datas, dinheiro, responsáveis

* **Datas** sempre `YYYY-MM-DD` no **fuso local** (`isoLocal`/`today()`), nunca `toISOString()` (em UTC-3 virava o dia seguinte após as 21h e marcava contas de hoje como atrasadas). Datas são lidas com `T12:00` para não escorregar de dia.
* **Somar meses** (`addMeses`): preserva o dia e limita ao último dia do mês (31/01 + 1 mês = 28 ou 29/02, nunca 03/03).
* **Anos aceitos:** 2019 a 2035 (selects, período personalizado, importação).
* **Dinheiro:**
  * Contas e receitas são gravadas em **reais (float)**. Notas guardam itens em **centavos inteiros**.
  * Somas do Dashboard (receita, despesas, pendente, saldo, categorias) são feitas em **centavos inteiros** (`centavos(v) = round(v*100)`) e divididas por 100 só na exibição.
  * Campos monetários usam máscara por centavos: o usuário digita só dígitos (`1050` → `10,50`); `parseMoney` aceita `1.500,00`, `1,500.00` e `1500`.
  * Moeda (BRL, USD, EUR) muda **só símbolo e formatação**; não converte valores.
* **Responsáveis:** `Leo`, `Pri` e `Leo & Pri` (compartilhada). Em receitas, "Ambos" é `resp:''`.

---

## 8. Regras e cálculos de contas

Fonte única em `js/fin-state.js`. Nenhuma tela deve reimplementar essas regras.

### 8.1 Status da conta

```
temPgIndividual(c) = c.resp == 'Leo & Pri' e não é metade ÷2 e (pagamentos.Leo ou pagamentos.Pri)
isQuitada(c)       = temPgIndividual(c) ? (pagamentos.Leo E pagamentos.Pri) : vPago > 0
isOverdue(c)       = c.data < hoje E não isQuitada(c)          → "Atrasada"
pendente           = não isQuitada(c) e não atrasada
```

* Compartilhada com só uma parte paga **continua pendente/atrasada**.

### 8.2 Valor efetivo e valor pendente

```
vEfetivo(c)  = (vPago > 0 e não (temPgIndividual e não quitada)) ? vPago : vPagar
vPendente(c) = quitada ? 0
             : temPgIndividual ? max(0, vPagar − (pagamentos.Leo.valor + pagamentos.Pri.valor))
             : vPagar
```

* `vEfetivo` é o valor que a conta **pesa nas despesas**: o pago quando quitada (com juros ou desconto), o previsto quando não.
* Compartilhada parcialmente paga pesa o valor cheio (`vPagar`) até as duas partes pagarem.

### 8.3 Filtro de responsável e divisão ÷2 (`filtrarPorResp`)

| Filtro | Contas incluídas | Valor |
|---|---|---|
| Todos | todas | cheio |
| Leo & Pri | só `resp == 'Leo & Pri'` | cheio |
| Leo (ou Pri) | as da pessoa + as compartilhadas | compartilhada vira **metade** (`_split`, selo ÷2) |

Na metade ÷2 de uma compartilhada:
* se a pessoa pagou sua parte: `vPagar = metade`, `vPago = valor pago por ela`;
* se só a outra pessoa pagou: `vPagar = metade`, `vPago = null` (a parte desta pessoa segue pendente);
* se foi paga integralmente (sem pagamentos individuais): `vPago = vPago / 2`.

Resultado: Leo + Pri soma exatamente o total da casa.

### 8.4 Pagamento

* **Conta individual** (`FS.pagarConta`): grava `vPago`, `paidBy`, `paidAt`. O valor pago pode diferir do previsto; o modal mostra "acréscimo" ou "desconto".
* **Compartilhada:** escolha Leo, Pri ou "Ambos de uma vez".
  * Por parte (`FS.pagarContaIndividual`, transação): grava `pagamentos.<resp>`, e `vPago` = soma das partes. Uma pessoa não paga duas vezes. Quitada quando as duas partes existem (log `pagamento_complementar`).
  * Ambos: pagamento integral normal.
  * **Blindagem:** compartilhada com só uma parte paga **não aceita** pagamento integral (erro); a parte faltante vai pelo pagamento individual. Baixas automáticas (parcelas, massa) completam a parte que falta (`_pagarContaAuto`).
* **Desfazer pagamento:** limpa `vPago`, `paidBy`, `paidAt`; **`vPagar` original é preservado**. Em compartilhada, desfaz a parte de Leo, de Pri ou ambas.
* **Pagamento em massa** (Contas, desktop): seleciona várias contas em aberto; valores editáveis por linha. Com filtro "Leo"/"Pri", compartilhadas recebem baixa só da parte filtrada; sem filtro (ou "Leo & Pri"), baixa integral. Executa uma por uma e informa erros.
* **Parcelas** (modal de parcelamento): pagar uma, pagar todas (valor pendente de cada), **pagamento antecipado** (valor total dividido igualmente; o resto de arredondamento vai para a última parcela), editar descrição/responsável/data/valor/parcela, aplicar categoria, forma ou nota a todas, excluir uma ou todas.

### 8.5 Cadastro e parcelamento

* Obrigatórios: descrição, responsável, categoria, forma, vencimento, valor.
* `dataCompra` não pode ser posterior ao vencimento.
* **Qtd. de parcelas > 1:** cria N documentos com o mesmo `grupo`, vencimentos mês a mês (`addMeses`), `parcela = "i de N"`, todos com o valor da parcela. "Valor total" = parcela × quantidade (só exibição).
* Edição altera uma conta só; o log registra cada campo alterado (`de → para`).
* Antes de cadastrar, roda a detecção de duplicatas (8.6).

### 8.6 Duplicatas (`js/duplicatas.js`)

O sistema **avisa e o usuário decide**; nunca bloqueia sozinho. Usado no cadastro manual, na importação e em "Gerar recorrentes".

* **Chave:** descrição normalizada (sem acento, minúsculas, espaços únicos) + responsável + forma de pagamento.
* **Valor semelhante:** diferença de até **10%** do maior valor (comparado em centavos).
* Entre contas de mesma chave:

| Situação | Resultado |
|---|---|
| As duas com `dataCompra`, compras diferentes | não é duplicata |
| Mesma compra, parcela diferente | não é duplicata |
| Mesma compra e parcela, valor semelhante | **provável** |
| Mesma compra e parcela, valor diferente | possível |
| Sem `dataCompra`, mês de vencimento diferente | não é duplicata |
| Mesmo vencimento, valor semelhante | **provável** |
| Mesmo vencimento, valor diferente | possível (ex.: reajuste) |
| Mesmo mês, outro dia | possível |

### 8.7 Recorrentes

* Contas com `recorrente = true` no **ano de origem** são agrupadas pela chave de duplicata, ficando a mais recente de cada grupo.
* Data sugerida: mesmo dia e mês no ano de destino (padrão: ano atual + 1; opções: atual, +1, +2). Data e valor são editáveis antes de gerar.
* Itens com duplicata **provável** no destino já vêm desmarcados; se o usuário marcar, precisa confirmar.
* Cada conta gerada é um documento novo, `parcela "1 de 1"`, `recorrente: true`, `vPago: null`, grupo próprio.

---

## 9. Receitas, salários, INSS e IR

### 9.1 Receita por ano: outras receitas têm ano, salário vale para todos

* **Outras receitas pertencem a um ano** (campo `ano`). Os 12 valores (`valores[0..11]`) valem só para os meses daquele ano. Uma receita de 2025 não aparece em 2026.
* **Salário vale para todos os anos.** Cada entrada do histórico tem início em mês e ano (`mesInicio`, `anoInicio`). O valor vigente em um mês é o da entrada mais recente que começou até ele, e repete nos anos seguintes. Antes da primeira entrada repete a primeira (ver 9.3).
* **Receitas cadastradas antes do controle por ano (sem `ano`):** continuam valendo, no ano da última alteração (`updatedAt`), senão do cadastro (`createdAt`), senão no ano atual (`CACHE.anoReceita`). Nada é gravado automaticamente. A tela Receitas e o Dashboard avisam; o modal "Ano das receitas antigas" grava **somente** o `ano` (os valores não mudam).
* **"Todos os anos":** como o salário vale para qualquer ano, a soma usa os **anos com movimento** (`CACHE.anosComDados()`: anos de vencimento das contas + anos das outras receitas).

### 9.2 Receita do mês (`CACHE.getReceitaMes(ano, m, resp)`)

```
receita(ano, m, resp) = Σ salário líquido vigente em (ano, m) (só da pessoa, se resp = Leo/Pri)
                      + Σ outras_receitas DO ANO: valores[m] × fatiaReceita(r, resp)

fatiaReceita(r, resp):
  sem filtro ou r.resp == resp            → 1
  receita de uma pessoa, filtro da outra  → 0
  receita "Ambos" e filtro "Leo & Pri"    → 1
  receita "Ambos" e filtro Leo ou Pri     → 0,5
```

* Salário vigente em (ano, m): a entrada com maior `anoInicio×12 + mesInicio` que seja ≤ `ano×12 + m`; se nenhuma, a primeira entrada (`CACHE.getSalarioMes`).
* Com filtro "Leo & Pri", salários (individuais) não entram e só receitas "Ambos" entram.

### 9.3 Salário líquido

```
base    = salário bruto + bonificação
INSS    = Σ por faixa: (min(base, faixa.ate) − faixa.de) × faixa.al     (progressivo), limitado a tetoINSS
baseIR  = base − INSS − dependentes × dedDep
IR      = baseIR ≤ 0 ? 0 : max(0, baseIR × al − ded) da maior faixa com baseIR > faixa.de
líquido = base − INSS − IR          (arredondado a 2 casas)
```

* INSS, IR e líquido são calculados **no momento em que o salário é salvo** e gravados no histórico. Alterar as tabelas fiscais **não recalcula** salários já salvos: é preciso salvar o salário de novo.
* "Atualizar salário" grava uma entrada nova a partir do **mês e ano** escolhidos (substitui a entrada do mesmo mês/ano de início). Nessa gravação, entradas antigas sem `anoInicio` recebem o ano que o sistema já usava para elas, sem mudar valores. É obrigatório manter ao menos uma entrada.
* Entradas antigas sem `anoInicio` usam o ano em que foram salvas (`updatedAt`), senão o ano atual (`CACHE.anoInicioSalario`).
* O cartão do salário, a edição e o cálculo detalhado mostram o **salário vigente hoje**; o histórico lista "A partir de Mês/Ano" do mais recente para o mais antigo.
* O "cálculo detalhado" mostra INSS pela fórmula da parcela a deduzir (`base × al − ded`); coincide com o progressivo quando as deduções da tabela estão coerentes.

**Tabelas padrão** (`DEFAULT_TABELAS`, vigência 2024/2025; os valores ativos ficam em `config/tabelas` e são editáveis pelo admin):

| IR: base de | até | alíquota | dedução |
|---|---|---|---|
| 0,00 | 2.259,20 | isento | 0,00 |
| 2.259,21 | 2.826,65 | 7,5% | 169,44 |
| 2.826,66 | 3.751,06 | 15% | 381,44 |
| 3.751,07 | 4.664,68 | 22,5% | 662,77 |
| 4.664,69 | acima | 27,5% | 896,00 |

| INSS: de | até | alíquota | dedução |
|---|---|---|---|
| 0,00 | 1.518,00 | 7,5% | 0,00 |
| 1.518,01 | 2.793,88 | 9% | 22,77 |
| 2.793,89 | 4.190,83 | 12% | 106,59 |
| 4.190,84 | 8.157,41 | 14% | 190,40 |

Dedução por dependente: R$ 189,59. Teto INSS: R$ 908,86.

### 9.4 Outras receitas

* Descrição e **ano** obrigatórios (2019 a 2035); responsável Leo, Pri ou Ambos. Nova receita vem com o ano filtrado na tela Receitas.
* Período dentro do ano: "Todos os meses" aplica o valor de Jan a Dez; mês inicial + final aplica no intervalo; só mês inicial aplica em um mês. Mês final não pode ser anterior ao inicial.
* **Edição preserva os valores mês a mês:** se valor e meses não forem alterados (ex.: só trocar o ano ou a descrição), os 12 valores originais são mantidos. Se a receita tem valores diferentes por mês e o usuário muda valor ou meses, o sistema pede confirmação antes de aplicar o mesmo valor a todo o período.
* Receitas não se repetem entre anos: para o ano seguinte, cadastre de novo.
* Salários aparecem na lista de Receitas como linhas automáticas (somente leitura).

---

## 10. Telas e seus cálculos

### 10.1 Dashboard

**Seleção:** ano + mês, ou período personalizado (ano, mês inicial, mês final; tem prioridade). "Todos os meses" = ano completo.

| KPI | Cálculo (centavos inteiros) |
|---|---|
| Receita | Σ `getReceitaMes(ano, m, resp)` para cada ano e mês da seleção (período: mesIni..mesFim do ano do período; ano completo: 12 meses; mês: 1; "Todos os anos": cada ano com movimento) |
| Total Despesas | Σ `vEfetivo` das contas com vencimento na seleção (÷2 quando filtrado) |
| Pendente | Σ `vPendente` do período **+ atrasadas de meses anteriores** |
| Saldo | Receita − Total Despesas. Linha extra "Após atrasadas anteriores" = Saldo − pendente das atrasadas anteriores |

* **Atrasadas de meses anteriores:** contas atrasadas com vencimento antes do 1º dia do mês de referência (mês selecionado ou mês inicial do período). Só existem com mês específico ou período. Entram em Pendente e na tabela de pendentes; **não** entram em Total Despesas nem no Saldo principal (já pesaram no mês delas).
* **Banner de atraso:** todas as atrasadas de qualquer mês (com filtro de responsável e ÷2), quantidade e soma do que falta pagar. O clique abre Contas só com as atrasadas (`APP.filtrarAtrasadas`).
* **Pendentes do mês:** atrasadas anteriores primeiro (mais antigas no topo), depois as do período; mostra até 8 com link "Ver todas".
* **Insights automáticos:**
  1. Variação das despesas contra o mês anterior (só com mês específico): acima de +5% "acima", abaixo de −5% "abaixo", senão "estáveis". Usa o mesmo ÷2.
  2. Categoria com maior gasto no período.
  3. Saldo negativo: "Despesas superam a receita em X".
  4. Contas em aberto que vencem de hoje até 3 dias (qualquer mês; compartilhadas contam para os dois).
  5. Recorrentes sem registro no mês (chave: descrição em minúsculas + responsável).
  6. Receitas antigas sem ano confirmado (clique leva a Receitas).
* **Despesas por categoria:** donut + tabela. Até 6 categorias, uma fatia cada; acima disso, as 5 maiores + "Demais (n)" expansível. Percentual sobre o total de todas as categorias. Cores fixas `--cat-1..6` (paleta validada para daltonismo).
* **Receita × Despesa:** sempre os 12 meses do ano selecionado, ou do ano do período personalizado quando ativo (ignora o mês); receita do ano ("Todos os anos" soma cada mês nos anos com movimento); despesas por `vEfetivo` com filtro de responsável; mês atual destacado.
* **Pareto 80/20:** ver 10.3.

### 10.2 Contas

* Ao abrir: status "Pendente" e ordenação por **vencimento crescente**.
* **Aviso de atraso:** atrasadas de qualquer mês, **com o filtro global de responsável** (÷2 nas compartilhadas; a metade já paga pela pessoa filtrada não conta), mostrando quantidade e soma do que falta pagar (`vPendente`, em centavos). Mesma regra do banner do Dashboard. O clique (`APP.filtrarAtrasadas`) aplica status "atrasado" com todos os anos e meses e limpa busca, categoria, forma, recorrente e período (o responsável continua): a lista bate com a contagem.
* Filtros: busca (descrição, nota, responsável, categoria, forma, parcela, data, autores), ano, mês, período, categoria, forma, recorrente (sim/não), status (pago, pendente, atrasado: vencida e não quitada) e responsável global.
* Com mês específico ou período, as **atrasadas de meses anteriores** entram na lista.
* Totais: Total = Σ `vEfetivo`; Pago = Σ `vPago`; Pendente = Σ `vPendente`.
* Paginação: 20 por página (configurável em Preferências).
* Exportar CSV: todas as contas do ano/mês filtrados, **ignorando** busca, status, categoria, forma, período e responsável (separador `;`, UTF-8 com BOM). Colunas: #, Descrição, Responsável, Forma, Categoria, A Pagar (`vEfetivo`), Pago, Pendente, Vencimento, Parcela, Por, Nota. Para exportar um recorte filtrado, use o CSV do Relatório.

### 10.3 Relatório

* Filtros: ano, mês, período, categoria, forma, status, responsável global e **busca** (sem acento; vários termos com E; inclui valores e datas). A busca vale só dentro do período escolhido.
* Atrasadas de meses anteriores entram quando há mês específico ou período.
* KPIs: quantidade, Total a pagar (Σ `vEfetivo`), Total pago (Σ `vPago`), Pendente (Σ `vPendente`).
* Tabela, CSV e PDF usam **o mesmo recorte** (`_filtrarRelatorio`). PDF em A4 paisagem com cabeçalho, KPIs, tabela, totais e paginação.
* **Pareto:** soma `vEfetivo` por categoria, ordena do maior para o menor, calcula % e % acumulado; destaca as categorias até atingir 80% do total.

### 10.4 Receitas

* Lista unificada: salários (uma linha por pessoa por mês do ano, com o salário vigente) + outras receitas **do ano** (uma linha por mês com valor).
* Filtros: busca (inclui mês e ano), **ano** (padrão: ano atual; "Todos os anos" = anos com movimento, e a coluna Mês mostra o ano), mês, tipo (salário/outra) e responsável global (receitas "Ambos" entram pela metade com selo ÷2 quando o filtro é Leo ou Pri).
* Ordenar por "Mês" ordena por ano e mês.
* Totais: total, salários, outras. Gráfico anual empilhado (salários + outras) dos anos filtrados.
* Receitas sem ano confirmado aparecem com o selo "ano?" e um aviso no topo que abre a revisão (9.1).

### 10.5 Período personalizado

Ano entre 2019 e 2035, mês final ≥ mês inicial, sempre dentro de um único ano. Cada tela (Dashboard, Contas, Relatório) guarda o seu; mudar ano/mês limpa o período daquela tela.

---

## 11. Importação de planilhas (Upload Cards)

Somente admin.

* **Modelo:** gerado pelo sistema (cartão + ano + mês → nome `AAAA.MM_Cartão.xlsx`). Abas: "Importação" (cabeçalho), "Referência" (instruções e listas válidas) e `_meta` oculta com `planilha_id` único.
* **Colunas:** Status, Descrição, Responsável, Forma de Pagamento, Categoria, Data Vencimento, Data Compra (opcional), Valor Parcela, Total Parcelas, Parcela Atual, Nota.
* **Bloqueios:**
  * Planilha sem `_meta.planilha_id` (não gerada pelo sistema) é recusada.
  * **Mesma planilha não importa duas vezes** (bloqueio pelo ID, renomear o arquivo não contorna).
  * Colunas obrigatórias ausentes.
* **Por linha:** Status "Nova" importa, "Existente" ignora, vazio com dados é erro. Responsável, forma e categoria precisam existir no sistema. Data em dd/mm/aaaa entre 2019 e 2035. Data Compra válida e não posterior ao vencimento. Valor > 0. Total e Parcela Atual inteiros > 0, com Parcela Atual ≤ Total. **Qualquer erro bloqueia o lote inteiro.**
* **Geração:** cada linha vira as parcelas de Parcela Atual até Total, mês a mês a partir do vencimento informado, todas com o valor da parcela e um grupo por linha.
* Duplicatas são verificadas contra o banco e entre linhas da própria planilha; o usuário decide.
* Gravação em lotes de 400 e registro em `importacoes`.

---

## 12. Notas e Ações

* **Tipos:** Anotação ou Ação. **Ação exige prazo e responsável**; anotação nunca grava prazo/responsável.
* **Status:** Ativa ou Concluída. "Em atraso" **não é gravado**: é calculado (ação ativa com prazo antes de hoje).
* **Itens:** descrição (obrigatória), data, nota, valor previsto e valor realizado em **centavos inteiros**. Em nota já salva, o item é gravado na hora.
* **Permissões:** ver seção 5 (admin, autor, responsável "Leo & Pri").
* **Filtros:** autor, tipo, status efetivo, busca (título, descrição e itens, sem acento) e período (aplica só a ações; ação sem prazo some com período ativo).
* Visualização em grade (Kanban) ou lista com colunas configuráveis por usuário.
* Exclusão vai para `notes_trash` (restaurável por quem pode editar); eventos em `notes_log`.
* O filtro global de responsável não se aplica a Notas.

---

## 13. Exclusão, auditoria e backup

### 13.1 Lixeira de contas

* Excluir conta move para `lixeira` em transação (com quem, quando e motivo) e registra log.
* Restaurar (Configurações → Excluídos) recria com o **mesmo ID** original e registra log `restauracao`.
* Exclusão permanente e "esvaziar lixeira" pedem **dupla confirmação** e são irreversíveis.

### 13.2 Categorias e formas

* Nome obrigatório e único (sem diferenciar maiúsculas).
* **Não exclui** categoria/forma em uso por alguma conta (`catId`/`formaId`).

### 13.3 Logs

* `logs` (contas): `cadastro`, `edicao` (com a lista de campos alterados), `exclusao`, `pagamento`, `pagamento_individual`, `pagamento_complementar`, `desfazer_pagamento`, `desfazer_pagamento_individual`, `restauracao`.
* Tela de log: sem período mostra os 50 mais recentes (de até 500 lidos); com período lê até 10.000. Filtros de pessoa (filtro global), evento e datas aplicados no navegador (evita índices compostos).
* `logs_acesso`: uma linha a cada abertura do app (usuário, e-mail, data, navegador; exibe Mobile/Desktop).
* Falha ao gravar log nunca bloqueia a operação principal.

### 13.4 Backup (admin)

* Coleções incluídas: `contas, salarios, outras_receitas, categorias, formas, cartoes, importacoes, config, notes, notes_trash, lixeira, logs, notes_log, activity_log, logs_acesso`. **Coleção nova no sistema deve ser adicionada em `_BK_COLECOES` (`backup.js`).**
* **JSON** (versão 2): timestamps serializados como `{__tipo:'timestamp', iso, seconds, nanoseconds}`; `meta` com data, autor, contagem e falhas.
* **Excel:** uma aba por coleção, com nomes de categoria/forma resolvidos, salários por período (mês e ano de início) e outras receitas com Ano e "Ano confirmado" (Não = ano ainda inferido).
* Coleção que falhar não derruba o backup: entra em `meta.falhas` e o usuário é avisado.
* Não existe restauração automática a partir do backup.

---

## 14. Preferências e armazenamento local

| Chave `localStorage` | Conteúdo |
|---|---|
| `dt_dark` | `'1'` modo escuro |
| `dt_prefs` | `{pgSz, parcPadrao, alertaDias, moeda}` |
| `nt_columns_<usuário>` | Colunas da lista de Notas |
| `nt_prefs_<usuário>` | Preferências de Notas |

* `pgSz` (itens por página) e `moeda` têm efeito. `parcPadrao` e `alertaDias` são salvos mas **ainda não são usados** por nenhuma tela.
* Não são salvos: filtro de responsável, modo privacidade, filtros das telas.

---

## 15. Restrições e limitações conhecidas

* **Segurança no servidor:** o controle de acesso no código é só do lado do cliente. A proteção real depende das **Regras do Firestore**, configuradas no Firebase Console e **não versionadas neste repositório**. Elas devem refletir: só os dois e-mails, logs imutáveis e permissões de Notas.
* **Receitas antigas sem `ano`** usam um ano inferido (9.1) até a confirmação. Se alguma foi cadastrada num ano para valer em outro, confira na revisão antes de comparar anos.
* **Novos campos no Firestore** (`outras_receitas.ano`, `historico[].anoInicio`): se as Regras do Firestore validarem campos, precisam aceitá-los.
* **Dinheiro em float** nas contas e receitas gravadas. Contas, Relatório e Receitas somam em reais (float); o Dashboard soma em centavos. Diferença de 1 centavo é possível em casos raros. Migrar para centavos inteiros exige migração de dados.
* **Salários não recalculam** ao mudar as tabelas fiscais (9.3).
* **Moeda** só muda a formatação, sem conversão.
* **Usuários extras** em Configurações não recebem acesso sem mudar `ALLOWED_EMAILS` e as regras do Firestore.
* **Sem modo offline** (não há service worker) e **sem restauração** a partir do backup.
* Categoria/forma em uso detectada só por ID: contas legadas com nome (`cat`/`forma`) não bloqueiam a exclusão.
* A busca rápida (Ctrl K) não pesquisa Notas e não abre com modal aberto.
* Arquivos estáticos sem hash de versão: após deploy pode ser preciso recarregar sem cache.

---

## 16. Histórico de alterações

Registre aqui toda mudança de regra, dado, tela ou restrição (mais recente no topo).

| Data | Mudança |
|---|---|
| 2026-10-14 | **Modo escuro legível e modais estáveis:** novo token `--on-palm` para texto sobre a cor do tema (botão primário, barra de seleção, Pareto, abas, paginação, cartão de salário); "Limpar seleção" deixa de ficar ilegível (1,1:1). `--t3`/`--t4` do escuro sobem para 62%/48%. Modais deixam de fechar ao selecionar texto arrastando para fora (clique no fundo só fecha se começar e terminar no fundo); clique no fundo do modal de Duplicatas não trava mais o Salvar. |
| 2026-10-14 | **Receita por ano:** outras receitas passam a ter `ano` (cadastro com ano obrigatório, filtro de ano na tela Receitas, edição que preserva os valores mês a mês). Salário vale para todos os anos com vigência por mês e ano (`anoInicio`): o valor atual segue nos anos seguintes. Dashboard (KPI Receita, gráfico Receita × Despesa, insight), Receitas (lista, totais, gráfico), busca rápida, backup Excel e selo do topbar usam o ano. Receitas antigas sem ano continuam valendo no ano da última alteração, com aviso e modal para confirmar (grava só o `ano`). |
| 2026-10-13 | **Atrasadas:** o aviso "N contas em atraso" de Contas passa a respeitar o filtro de responsável (antes contava sempre todas) e mostra o valor pendente, igual ao Dashboard. Corrigido o clique no aviso, que recarregava a tela e perdia o filtro "atrasado"; agora o aviso de Contas, o banner do Dashboard e a busca rápida abrem a mesma lista de atrasadas. |
| 2026-10-12 | **Novo shell (proposta "Trilho"):** trilho de navegação fixo de 76px substitui a sidebar de 230px (sem recolher); topbar com trilha da tela, selo de período, busca rápida Ctrl K / ⌘K / "/" (`js/command-palette.js`), filtro de responsável em avatares e ações secundárias só com ícone; novo `css/shell.css`; tema Pri derivado de tokens no trilho e na bottom nav; `.main` com `min-width:0` (fim da rolagem horizontal entre 769 e ~1200px na tela Contas). Criado este README com a regra de atualização obrigatória. |
