# Resultados reproduzidos — 06/10/2026

Medições do benchmark no commit-base `46a464c` versus o workspace corrigido. Contagens de camadas diferentes são identificadas abaixo.

| Caso | Volume | Contagem antes → depois | Mediana antes → depois | Unidade da contagem / do tempo |
| --- | ---: | ---: | ---: | --- |
| Metadados no navegador | 1 | 4 → 3 | 67.461 → 51.997 ms | Chamadas de dados incluindo acesso; SQL real local + atraso controlado de 15 ms/chamada |
| Metadados no navegador | 10 | 40 → 3 | 333.660 → 55.062 ms | Chamadas de dados incluindo acesso; SQL real local + atraso controlado de 15 ms/chamada |
| Metadados no navegador | 42 | 168 → 3 | 1438.488 → 62.377 ms | Chamadas de dados incluindo acesso; SQL real local + atraso controlado de 15 ms/chamada |
| Server Action de fotos | 1 | 4 → 3 | 79.849 → 59.114 ms | Chamadas de dados incluindo acesso; SQL real local + atraso controlado de 15 ms/chamada |
| Server Action de fotos | 10 | 22 → 3 | 263.907 → 61.863 ms | Chamadas de dados incluindo acesso; SQL real local + atraso controlado de 15 ms/chamada |
| Server Action de fotos | 42 | 86 → 3 | 908.366 → 63.528 ms | Chamadas de dados incluindo acesso; SQL real local + atraso controlado de 15 ms/chamada |
| Salvar relatório avulso | 1 | 2 → 2 | 0.999 → 1.127 ms | Statements de itens/fotos; tempo da função completa no PostgreSQL local |
| Salvar relatório avulso | 10 | 20 → 2 | 0.998 → 0.772 ms | Statements de itens/fotos; tempo da função completa no PostgreSQL local |
| Salvar relatório avulso | 30 | 60 → 2 | 2.030 → 1.647 ms | Statements de itens/fotos; tempo da função completa no PostgreSQL local |
| Verificar arquivos de auditoria | 1 | 2 → 1 | 0.189 → 0.277 ms | Statements de arquivos; tempo do bloco de validação no PostgreSQL local |
| Verificar arquivos de auditoria | 42 | 43 → 1 | 0.453 → 0.241 ms | Statements de arquivos; tempo do bloco de validação no PostgreSQL local |
| Verificar arquivos de auditoria | 200 | 201 → 1 | 1.590 → 0.456 ms | Statements de arquivos; tempo do bloco de validação no PostgreSQL local |
| Assinar exportação legada (sem tela chamadora) | 1 | 1 → 1 | 34.381 → 34.291 ms | Chamadas ao Storage; SDK simulado com 15 ms/chamada, duas RPCs constantes |
| Assinar exportação legada (sem tela chamadora) | 42 | 42 → 1 | 133.940 → 35.244 ms | Chamadas ao Storage; SDK simulado com 15 ms/chamada, duas RPCs constantes |
| Assinar exportação legada (sem tela chamadora) | 150 | 150 → 2 | 440.718 → 56.155 ms | Chamadas ao Storage; SDK simulado com 15 ms/chamada, duas RPCs constantes |

A contagem dos statements internos não inclui os passos comuns de autorização/gravação. Não some essas contagens às chamadas do SDK como se fossem a mesma medida. As latências não são de produção.

Os casos com um apontamento no relatório avulso ou uma foto na validação de publicação ficaram ligeiramente mais lentos; não há alegação de ganho universal.

## Evidência adicional

- Chrome: 42 linhas observadas por `IntersectionObserver`, uma requisição de metadados; API simulada com atraso de 500 ms.
- EXPLAIN ANALYZE: um nó de leitura de `storage.objects`, executado uma vez para o lote de 42 visitas.
- Amostras individuais, min/max, contagens por RPC e versões: `benchmark.json`.
- Snapshots, idempotência, revogação, caminhos ausentes e falhas: assertions PostgreSQL aprovadas.
