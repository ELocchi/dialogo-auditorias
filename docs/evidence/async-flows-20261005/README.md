# Evidências da auditoria assíncrona

- [Relatório](../../AUDITORIA-FLUXOS-ASSINCRONOS.md)
- [13 cenários de navegador aprovados](resultado.json)
- [92 testes de regressão, build, lint e TypeScript](verificacoes.json)
- [Arquivos alterados](ARQUIVOS.md)
- Capturas `.png` e árvores de acessibilidade `.aria.txt` registram os mesmos estados.

O resultado consolidado referencia a execução completa e repetições direcionadas após correções: recuperação da página, fotos com retry e a proteção contra falso timeout de fotos fora da tela. Cada resultado indica seu arquivo bruto de origem. O erro simulado desse cenário aparece nos eventos do navegador por definição; não foi suprimido dos logs. Falhas iniciais do ambiente/testes e a falha real do retry foram preservadas como diagnóstico, não contadas como resultados aprovados.

As APIs foram interceptadas no Chrome. Não houve gravação no Supabase, alteração de credenciais ou deploy.
