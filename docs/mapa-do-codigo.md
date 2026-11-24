# Mapa do código

Este guia explica **cada parte do código**, na ordem em que aparece. Para achar uma parte, abra o arquivo num editor (VS Code, por exemplo) e procure (Ctrl/Cmd+F) pelo título entre `/* ========== ... ========== */` ou pelo nome da função.

## Visão geral

```
fonte/sistema.html   → o sistema inteiro (telas, regras e cálculos) — também roda sozinho, guardando no navegador
fonte/config.exemplo.js → modelo do config.js (endereço e chave do Supabase de cada loja)
fonte/online.js      → a camada online: login, banco Supabase, tempo real, usuários, comprovantes, IA
fonte/icone.b64      → ícone do site (imagem PNG em texto)
ferramentas/montar_site.py → junta sistema.html + online.js e gera site-pronto/index.html e o .zip
supabase-funcao/assistente.ts → função do Supabase que conversa com a IA (Claude)
banco/instalar-do-zero.sql    → cria o banco inteiro (comentado linha a linha)
```

**Tecnologia:** HTML, CSS e JavaScript puros, sem framework e sem etapa de compilação. Um único arquivo de site. O banco é PostgreSQL (Supabase). A IA é o Claude, da Anthropic.

**Como as telas funcionam:** cada tela é uma função `vNome()` que devolve o HTML da tela. A função `route()` olha o endereço (ex.: `#os`) e desenha a tela certa. Os botões têm `data-act="nomeDaAcao"`, e o objeto `ACT` (no fim do código) diz o que cada ação faz. Formulários usam `data-f="campo"` para gravar o que é digitado no objeto `FORM`.

**Onde ficam os dados:** tudo fica no objeto `DB` (clientes, OS, vendas, estoque...). A função `save()` grava: na versão do claude.ai, no próprio navegador; na versão online, envia ao Supabase só o que mudou.

---

## `fonte/sistema.html`, de cima para baixo

### Estilos (CSS, dentro de `<style>`)
- **Cores e temas:** variáveis no `:root` (`--bg`, `--accent` etc.), tema escuro e cores de destaque (azul, marinho, ardósia, grafite, petróleo).
- **Estrutura:** `.app` (menu + área de trabalho), `.side` (menu), `.top` (barra de busca), `.view` (tela).
- **Componentes:** botões `.btn`, etiquetas `.chip`, tabelas, indicadores `.kpi`, formulários `.fld`, gavetas `.drawer`, janelas `.modal`, documentos em papel `.paper` (comprovantes e notas).
- **Partes específicas:** balcão (`.pdv`), assistente (`.ai`), personalizar (`.pz`), informações originais (`.orig`), metas, comissões, procedência (`.interno`), reparos, gastos, cliente rápido (`.cp`), CRM, comprovantes (`.ax`), consulta do aparelho (`.cons-l`).
- **Adaptação à tela:** blocos `@container` e `@media` no fim, para celular e tablet.

### Estrutura da página (HTML)
Menu lateral (`#side`), barra do topo com a busca (`#gsInput`) e botões Assistente / Nova venda / Nova OS, área das telas (`#view`), gaveta (`#drawer`), janela (`#modal`), painel do assistente (`#ai`), painel Personalizar (`#pz`) e o aviso rápido (`#toast`).

### Utilidades
Funções pequenas usadas em todo lugar: `ICONS`/`ic()` (ícones), `brl()` (dinheiro), datas (`ymd`, `ymdBR`, `daysAgo`), `imeiOk` (confere o dígito do IMEI), máscaras de CPF e telefone, `batChip` (bateria colorida), `LOGO_SVG` (símbolo "iD").

### Domínio (regras da loja)
- `STATUS`: etapas da OS (Orçamento › Aprovada › Em reparo › Aguardando peça › Pronta › Entregue · Cancelada).
- `MODELOS` (sugestões de iPhone, iPad, Mac, Watch, AirPods, iPod…), `CAPS`, `CORES`, `CHECK` (checklist de entrada), `ACESS` (o que o cliente deixou), `RAPIDOS` (atalhos de orçamento: tela, bateria, conector…).
- Dados da empresa: `LOJA_NOVA` e migrações `migrarLoja`, `migrarDono`, `migrarVendaAp` (atualizam dados antigos sem perder nada).
- Aparência e menu: `ACCENTS`, `FUNDOS`, `TEMAS`, `NAV_DEF` (itens do menu e seus grupos), `BLOCOS`/`LAY_DEF` (blocos do Painel), `applyLayout`.
- `UI`: estado da tela (filtros, abas, buscas).
- `seed()`: dados de exemplo (só na versão de demonstração).
- `load()` / `save()`: carregar e salvar.

### Fiscal (simulação)
`chaveAcesso` (monta a chave de 44 dígitos no formato oficial), `emitirNota` (NFC-e, NF-e, NFS-e em simulação), `qrSVG` (QR code ilustrativo). **Não envia à SEFAZ**; para nota real é preciso um emissor pago.

### Shell (moldura do sistema)
`VIEWS` (lista de telas), `renderNav` (desenha o menu com contadores), `route` (troca de tela), `marcaHTML` (logo ou símbolo), `openDrawer`/`openModal` (gaveta e janela), `toast` (aviso rápido), `copy` (copiar texto).

### Painel
`vPainel`: indicadores do dia (OS abertas, prontas, vendas, faturamento, estoque), fluxo da bancada, gráfico dos últimos 7 dias (`chart7`), metas da semana, prontas para retirada, pontos de atenção, últimas OS. Os blocos são personalizáveis.

### Ordens de serviço
- `vOS`: lista com filtros por etapa e busca.
- `openOSForm` / `salvarOS`: abrir e editar OS (cliente rápido, aparelho, checklist, defeito, orçamento, técnico, prioridade, "dono participou", garantia).
- `openOS`: ver a OS (etapas, histórico, informações originais, comissão, botões Avisar, Via do cliente, Entregar e receber).
- `viaOS`: via do cliente para imprimir. `receberOS`/`confirmaReceber`: entrega e pagamento (gera a venda do serviço).
- `msgWa`: mensagem pronta de aviso ao cliente.

### Vendas / balcão (PDV)
`vVendas` (balcão e histórico), `renderCatalog` (iPhones e acessórios), `renderCart` (carrinho com brinde, vendedor, troca), `cartCalc` (totais), `finalizar` (baixa estoque, registra movimentos, coloca a troca no estoque com procedência), `openRecibo` (comprovante; a procedência aparece só para o dono e não sai no comprovante).

### Notas fiscais
`vNotas` (lista), `modalEmitir` (escolher NFC-e / NF-e / NFS-e), `verNota` (DANFE simulado), `cancelarNota`, `notaAvulsa`.

### Estoque (Aparelhos à venda e Acessórios)
`vEstoque` (tabelas), `formIph` (receber aparelho: procedência, aparelho, condição na chegada, reparos, custo e preço, informações originais, consulta), `formAcess` (acessório: categoria, finalidade venda/brinde, preço tabelado, movimentações, dar brinde).

### Clientes
`vClientes` (lista) e `openCli` (cadastro: dados, "não quer mensagens", aparelhos e OS, compras, mensagens enviadas; botões Nova OS e Nova venda).

### Configurações
`vConfig`: logo da loja, dados da empresa (razão, CNPJ, IE, endereço, contatos, e-mail, Instagram, site), garantias e termos, margem padrão, emissão fiscal (simulação), cópia de segurança.

### Busca geral
`buscaGlobal`: procura OS, clientes, aparelhos (IMEI e série), notas; abre o histórico completo de um aparelho; oferece perguntar à IA.

### Assistente IA
`aiSnapshot` (junta os dados que o usuário pode ver, sem senhas de desbloqueio), `aiRegras` (instruções para a IA responder em português, citando OS/clientes com botões), `askAI` (envia a pergunta e mostra a resposta aos poucos), `AI_SUG` (perguntas sugeridas), `AI_ERR` (mensagens de erro em português).

### Informações originais do aparelho
`LINKS` (Apple, iUnlocker, Anatel), `fabSerial` (estima a fabricação pelo nº de série antigo), `origHTML` (quadro com botões de consulta e campo de colar), `origLer`/`origLocal`/`origPrompt` (lê o resultado colado, pela IA ou por regras), `origAviso` (aviso vermelho de bloqueio), `origResumoHTML` (resumo na OS), `reciboOrig` (no comprovante do seminovo).

### Equipe, comissões, metas, planilha, procedência e avisos
- Funcionários: `vFuncionarios`, `formFunc`, `regraTxt` (texto da regra de comissão).
- Comissões: `comissoes(per)` calcula por pessoa (serviço sem o dono; venda por aparelho), `vComissoes`, `openExtrato`, pagamento com confirmação.
- Metas: `META_TIPOS`, `realizado`, `metaStatus` (no ritmo / abaixo / batida), `vMetas`, `formMeta`, `metasPadrao`.
- Aparelhos na loja: `plLista`, `vPlanilha` (dias, atraso, prioridade, ordenação, filtros), `plCSV` (planilha para Excel).
- Procedência (só o dono): `procHTML`, `procBox`, `procTxt`.
- Histórico do aparelho: `eventosAparelho`, `histAparelho`.
- Avisar cliente: `waLink` (WhatsApp), `gmailLink`, `openAviso`.
- Cliente rápido: `cliPickHTML`, `cpBuscar`, `novoCliente`.
- `migrar2`: atualiza dados antigos para o modelo com equipe.

### Gastos, acessórios e preparação de aparelhos
- Movimentos de acessórios: `addMov` (compra, venda, brinde, ajuste), `movsDe`.
- Gastos: `GASTO_CATS`, `novoGasto`, `vGastos` (lista, entradas e saídas de acessórios, fornecedores), `formGasto`, `gaItensHTML` (compra de acessórios com itens).
- Preparação: `CHEGADA` (condição), `REPARO_SUG` (reparos e custos sugeridos), `custoTotal`, `precoHTML` (preço sugerido pela margem), `reparosHTML`.
- `brindeModal`: dar brinde fora de uma venda. `migrar3`: novos campos.

### CRM (Relacionamento)
`crmDados` (histórico por cliente: último atendimento, total, garantia terminando, última mensagem), `CRM_SEGS` (filtros), `CRM_MODELOS` (mensagens prontas), `crmTexto` (troca {nome}, {aparelho}…), `vCRM` (tela), `crmFila` (envio um por um), `crmRegistrar` (guarda o envio no cliente).

### Comprovantes (fotos e PDF)
`anexoPreparar` (reduz a foto), `anexoGuardar`/`anexoURL` (guardar e abrir; online usa o Supabase Storage), `anexosHTML`, `anexoAbrir`. `consultarAparelho` + `consultaAuto` (consulta do aparelho; `consultaAuto` vazio = sem serviço pago).

### Personalizar
`pzShellHTML`, `renderPZ`: tema, cores, menu (ordem, nomes, itens ocultos), blocos do Painel, tela inicial, densidade. Vale por navegador.

### Eventos (o "cérebro" dos botões)
- `ACT`: cada ação de botão (`data-act`) do sistema.
- Ouvintes de `click`, `input`, `change` e `keydown`: digitação nos formulários, máscaras, buscas, envio de arquivos, atalhos (`/` para buscar).
- Última linha: inicializa o sistema (na versão online é trocada por `onIniciar()`).

---

## `fonte/online.js`

| Parte | O que faz |
|---|---|
| `ONLINE` | lê o endereço e a chave pública do Supabase do `config.js`; domínio interno dos usuários |
| `ON_ROTAS` | telas de cada papel (técnico, vendedor); o dono vê todas |
| `onLinhas` / `onMontar` | transforma o `DB` em linhas da tabela `registros` e vice-versa (procedência fica separada) |
| `onSincronizar` | envia ao banco só o que mudou, com nova tentativa se a internet cair; mostra "Tudo salvo" |
| `onAplicar` / `onAssinar` | tempo real: aplica na tela o que outra pessoa salvou |
| `onLoginHTML` e ouvinte `submit` | tela de entrada (usuário e senha) |
| `onEntrar` / `onAplicarPapel` | carrega os dados, aplica as permissões do papel e monta o menu |
| `comissoes` (substituída) | quem não é dono vê só a própria comissão |
| `onAcessosHTML` e `ACT.on*` | usuários do sistema: criar, trocar senha, bloquear, apagar |
| `baixarArquivo`, `vConfig` (substituída) | cópia de segurança (baixar e importar) |
| `onSampleShim` | liga o Assistente de IA à função `assistente` do Supabase |
| `anexoGuardar` / `anexoURL` | comprovantes no Supabase Storage (link temporário de 1 hora) |

## `supabase-funcao/assistente.ts`
1. Confere se quem pergunta está logado e ativo (`meu_papel`).
2. Valida a pergunta (tamanho e formato).
3. Escolhe o modelo: Rápido = `claude-haiku-5-5`; Completo = `claude-opus-5-5`.
4. Chama o Claude com a chave guardada no Supabase e devolve a resposta aos poucos.
5. Traduz erros (sem chave, sem crédito, limite) para mensagens em português.

## `ferramentas/`
- `montar_site.py`: gera o site online. Acrescenta a tela de login, troca o salvamento local pelo Supabase e liga a IA.
- `mock_supabase.js` + `mock_server.js`: um Supabase de mentira, com as mesmas regras do banco, usado para testar o site sem mexer nos dados reais.

| `onBoasVindas` | (no fim do `online.js`) primeiro acesso do administrador: dados da loja |
