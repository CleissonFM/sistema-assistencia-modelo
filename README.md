# Sistema de gestão para assistência técnica

Sistema completo para assistência técnica de celulares, tablets e computadores, com venda de aparelhos e acessórios. Funciona no computador e no celular, com usuário e senha para cada pessoa da equipe e os dados na nuvem, atualizados em tempo real.

**Para instalar na sua loja, siga o [INSTALAR.md](INSTALAR.md).**

## O que o sistema faz
- **Ordens de serviço:** entrada com checklist, orçamento com atalhos, técnico, prioridade, etapas, aviso ao cliente pelo WhatsApp ou e-mail, via do cliente, entrega e recebimento.
- **Aparelhos na loja:** planilha com dias na loja, atraso, prioridade e valor; baixar para Excel.
- **Vendas no balcão:** aparelhos e acessórios, brinde, desconto, aparelho na troca, comprovante.
- **Estoque de aparelhos:** de quem foi comprado (só o administrador vê), condição na chegada, reparos, custo e preço sugerido.
- **Acessórios:** preço tabelado, venda ou brinde, entradas e saídas.
- **Clientes e Relacionamento (CRM):** histórico, filtros (garantia terminando, clientes sumidos…) e mensagens prontas pelo WhatsApp.
- **Gastos** com foto do comprovante, **comissões** por serviço e por venda, **metas** semanais e mensais.
- **Consulta do aparelho:** atalhos para Anatel (bloqueio), Apple (garantia) e iUnlocker, com leitura automática do resultado.
- **Notas fiscais** (simulação para treino; a emissão real exige certificado digital e um emissor contratado).
- **Assistente de IA** (opcional): perguntas sobre a loja em português.

## Quem vê o quê
| Papel | Acesso |
|---|---|
| **Administrador** | tudo; cria e remove usuários; dados da loja; procedência dos aparelhos; gastos; paga comissões |
| **Técnico** | OS, aparelhos na loja, estoque, acessórios, clientes, a própria comissão e metas |
| **Vendedor(a)** | o mesmo do técnico, mais vendas, relacionamento (CRM) e gastos (sem compra de aparelho) |

As regras ficam no próprio banco de dados, e não só na tela.

## Pastas
```
INSTALAR.md       passo a passo de instalação
site-pronto/      o sistema pronto para publicar (index.html + config.js)
banco/            banco de dados completo e comentado (instalar-do-zero.sql)
supabase-funcao/  função do assistente de IA
fonte/            código-fonte (sistema.html + online.js)
ferramentas/      montador do site e testes
docs/             mapa do código e guia das telas
```

## Tecnologia
HTML, CSS e JavaScript puros (um arquivo só, sem framework), Supabase (PostgreSQL, login, tempo real e arquivos) e, opcionalmente, o Claude da Anthropic para o assistente.

Para alterar o sistema: mude `fonte/sistema.html` e/ou `fonte/online.js` e rode `python3 ferramentas/montar_site.py`. Isso gera `site-pronto/index.html`. Veja `docs/mapa-do-codigo.md`.

Para testar uma instalação do zero sem usar um banco real: `node ferramentas/teste_instalacao.js` (precisa do Playwright).
