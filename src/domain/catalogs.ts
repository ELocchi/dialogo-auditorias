export type Discipline = "Segurança" | "Qualidade simplificada" | "Qualidade completa";
export type CollectionState = "Não respondido" | "Não verificado" | "Respondido";
export type SecurityAnswer = 0 | 5 | 10 | "N/A";

export interface Criterion {
  id: string;
  code: string;
  title: string;
  text: string;
  group: string;
  subgroup: string;
  source: string;
  locator: string;
  documentedWeight: number | null;
  /** Configuração da plataforma, independente do peso transcrito da fonte. */
  configuredWeight?: number;
  weightConfigurationId?: string;
  orientations: CatalogOrientation[];
  verificationRule?: string;
  sourceNote?: string;
  interpretation?: string;
}

export interface CatalogOrientation {
  id: string;
  scope: string;
  text: string;
  pages: number[];
  highlighted: boolean;
}

export const getCriterionWeight = (criterion: Criterion): number | null => criterion.configuredWeight ?? criterion.documentedWeight;

interface SecuritySourceOrientation {
  id_tecnico: string;
  escopo: string;
  alvo?: string;
  grupos_codigos?: string[];
  paginas_fonte: number[];
  destacado_em_vermelho_no_original?: boolean;
  texto_original: string;
}

interface SecuritySourceGeneralOrientation {
  id_tecnico: string;
  aplicacao: string;
  grupos_codigos?: string[];
  paginas_fonte: number[];
  texto_original: string;
}

interface SecuritySourceGroup {
  codigo: string;
  nome_original: string;
}

interface SecuritySourceSubgroup {
  id_tecnico: string;
  grupo_codigo: string;
  nome_original: string;
  orientacoes_ids: string[];
}

interface SecuritySourceItem {
  codigo: string;
  grupo_codigo: string;
  subgrupo_id: string;
  paginas_fonte: number[];
  orientacoes_ids: string[];
  peso_individual: number | null;
  texto_original: string;
}

interface SecuritySourceCatalog {
  documento: { identificacao: string; revisao: string };
  orientacoes_gerais: SecuritySourceGeneralOrientation[];
  grupos: SecuritySourceGroup[];
  subgrupos: SecuritySourceSubgroup[];
  itens: SecuritySourceItem[];
  orientacoes: SecuritySourceOrientation[];
}

import securitySource from "../../CATALOGO_SEGURANCA_IT07_R02.json" with { type: "json" };

export interface QualityModel {
  id: "F175" | "F176";
  name: string;
  version: string;
  source: string;
  criteria: Criterion[];
  hideWeightsInPublishedForm: boolean | null;
}

export const securityGroups = [
  ["01", "Áreas de vivência", 2], ["02", "Bebedouros", 2], ["03", "Auxiliares de limpeza, higienização e portaria", 2],
  ["04", "Equipamentos de proteção individual – EPIS e uniformes", 4], ["05", "Treinamentos", 2], ["06", "Documentação Legal Obrigatória", 3],
  ["07", "Gestão de segurança", 1], ["08", "Sinalização de Segurança", 2], ["09", "Prontidão e Respostas a Emergências", 1],
  ["10", "Escavações e fundações", 10], ["11", "Central de fôrmas", 2], ["12", "Central de armação", 2],
  ["13", "Escadas, rampas, passarelas e tapumes", 5], ["14", "Proteções contra quedas", 10], ["15", "Plataformas", 10],
  ["16", "Entelamento", 3], ["17", "Andaimes suspensos leves", 5], ["18", "Cadeira suspensa", 5],
  ["19", "Elevador cremalheira", 4], ["20", "Grua", 5], ["21", "Andaimes simplesmente apoiados, móveis e fachadeiros", 6],
  ["22", "Instalações elétricas provisórias", 5], ["23", "Máquinas, Equipamentos e Ferramentas Diversas", 4],
  ["24", "Específico a Pólvora", 1], ["25", "Iluminação", 2], ["26", "Ordem e Limpeza", 4], ["27", "Atendimento a Convenção Coletiva", 1],
] as const;

const securityCatalog = securitySource as SecuritySourceCatalog;
const securityGroupNames = new Map(securityCatalog.grupos.map((group) => [group.codigo, group.nome_original]));
const securitySubgroups = new Map(securityCatalog.subgrupos.map((subgroup) => [subgroup.id_tecnico, subgroup]));
const securityOrientations = new Map(securityCatalog.orientacoes.map((orientation) => [orientation.id_tecnico, orientation]));
const generalOrientations: (CatalogOrientation & { groups: string[] })[] = securityCatalog.orientacoes_gerais.map((orientation) => ({
  id: orientation.id_tecnico,
  scope: orientation.aplicacao,
  text: orientation.texto_original,
  pages: orientation.paginas_fonte,
  highlighted: false,
  groups: orientation.grupos_codigos ?? [],
}));

const toOrientation = (orientation: SecuritySourceOrientation): CatalogOrientation => ({
  id: orientation.id_tecnico,
  scope: orientation.escopo,
  text: orientation.texto_original,
  pages: orientation.paginas_fonte,
  highlighted: false,
});

const orientationsForItem = (item: SecuritySourceItem): CatalogOrientation[] => {
  const subgroup = securitySubgroups.get(item.subgrupo_id);
  const linked = item.orientacoes_ids.map((id) => securityOrientations.get(id)).filter((orientation): orientation is SecuritySourceOrientation => Boolean(orientation));
  const subgroupOrientations = (subgroup?.orientacoes_ids ?? []).map((id) => securityOrientations.get(id)).filter((orientation): orientation is SecuritySourceOrientation => Boolean(orientation));
  const applicableGeneral = generalOrientations.filter((orientation) => orientation.groups.length === 0 || orientation.groups.includes(item.grupo_codigo));
  return [...linked, ...subgroupOrientations].map(toOrientation).concat(applicableGeneral);
};

/** Decisão do responsável em 14/09/2026 para os 205 subitens da IT.07 R02.
 * Peso individual; não substitui a escala de respostas nem os pesos dos grupos.
 */
export const securityWeightConfiguration = {
  id: "IT07-R02-PESOS-INICIAIS-2026-09-14",
  itemWeight: 1,
  source: "Definição do responsável em 14/09/2026",
} as const;

export const securityCriteria: Criterion[] = securityCatalog.itens.map((item) => {
  const subgroup = securitySubgroups.get(item.subgrupo_id);
  const groupName = securityGroupNames.get(item.grupo_codigo) ?? item.grupo_codigo;
  return {
    id: `IT07-${item.codigo}`,
    code: item.codigo,
    title: groupName,
    text: item.texto_original,
    group: `${item.grupo_codigo} — ${groupName}`,
    subgroup: subgroup?.nome_original ?? item.subgrupo_id,
    source: `${securityCatalog.documento.identificacao} revisão ${securityCatalog.documento.revisao}`,
    locator: `página${item.paginas_fonte.length === 1 ? "" : "s"} ${item.paginas_fonte.join(", ")}`,
    documentedWeight: item.peso_individual,
    configuredWeight: securityWeightConfiguration.itemWeight,
    weightConfigurationId: securityWeightConfiguration.id,
    orientations: orientationsForItem(item),
  };
});

const quality = (id: string, name: string, hide: boolean | null, rows: [string, string, number | null, string, string][]): QualityModel => ({
  id: id as "F175" | "F176", name, version: "00", source: `${id} - Roteiro Farol da Qualidade ${id === "F175" ? "Simplificado" : "Completo"}.docx`, hideWeightsInPublishedForm: hide,
  criteria: rows.map(([code, text, weight, group, locator]) => ({ id: `${id}-${code}`, code, text: qualityTextOverrides[code] ?? text, title: group, group, subgroup: "", source: id, locator, documentedWeight: weight, orientations: [], verificationRule: qualityVerificationRules[code], sourceNote: qualitySourceNotes[code], interpretation: text.includes("quantidade") ? "Rateio documental preservado; quantidade zero ou ausente não redistribui peso automaticamente." : undefined })),
});

const qualityTextOverrides: Record<string, string> = {
  "F175-Q02": "Existe o controle de validade dos materiais (F.99)?",
  "F175-Q03": "Existe o acompanhamento semanal da TAM (F.87)?",
  "F175-Q04": "Existe o controle de armazenamento dos materiais?",
  "F175-Q10": "Estão sendo realizadas inspeções periódicas para verificação da qualidade dos serviços executados (FVS)?",
  "F176-Q02": "A obra possui projeto de canteiro e ele está atualizado incluindo, minimamente, questões de logística e produção (acessos e circulações de produtos, equipamentos e pessoas; áreas de produção e processamento, de escritórios, de armazenamento de produtos e de armazenamento de resíduos; localização de equipamentos de produção e transporte) e as áreas de vivência (instalações sanitárias, vestiário e local de refeições - obrigatórias; alojamento, cozinha, lavanderia, área de lazer e ambulatório - quando aplicáveis)?",
  "F176-Q03": "A obra controla o consumo mensal de resíduos, energia e água (F.107)? Checar contas do último mês e comparar com valores da planilha.",
  "F176-Q04": "A obra controla os equipamentos de medição (F.39)?",
  "F176-Q09": "Existe o controle de armazenamento dos materiais (Identificação e estocagem conforme TAM)?",
  "F176-Q11": "Os projetos em campo e/ou utilizados na engenharia estão com suas revisões corretamente controladas (Checar F.110 e revisão disponível no Autodoc/ferramenta de controle de projetos)?",
  "F176-Q12": "A qualificação e treinamento da equipe de trabalho estão conforme (conversar com colaboradores em campo e verificar aderência aos procedimentos existentes)?",
  "F176-Q20": "Estão sendo realizadas inspeções periódicas para verificação da qualidade dos serviços executados (FVS)?",
  "F176-Q21": "Há registros documentais das inspeções realizadas e dos testes executados (PCT) (checar inclsuive se os documentos estão datados e assinados)?",
  "F176-Q19": "As licenças das empresas responsáveis pelo descarte dos resíduos gerados estão sendo devidamente registradas na planilha de caracterização e quantificação de resíduos (F.124)? Verificar também validade das licenças.",
};

const qualityVerificationRules: Record<string, string> = {
  "F175-Q01": "Dividido pela quantidade verificada", "F175-Q02": "Conforme/Não Conforme", "F175-Q03": "Conforme/Não Conforme", "F175-Q04": "Dividido pela quantidade verificada", "F175-Q05": "Conforme/Não Conforme", "F175-Q06": "Conforme/Não Conforme", "F175-Q07": "Conforme/Não Conforme", "F175-Q08": "Conforme/Não Conforme", "F175-Q09": "Conforme/Não Conforme", "F175-Q10": "Dividido pela quantidade verificada",
  "F176-Q01": "Conforme/Não Conforme", "F176-Q02": "Conforme/Não Conforme", "F176-Q03": "Conforme/Não Conforme", "F176-Q04": "Conforme/Não Conforme", "F176-Q05": "Conforme/Não Conforme", "F176-Q06": "Dividido pela quantidade verificada", "F176-Q07": "Conforme/Não Conforme", "F176-Q08": "Conforme/Não Conforme", "F176-Q09": "Dividido pela quantidade verificada", "F176-Q10": "Conforme/Não Conforme", "F176-Q11": "Conforme/Não Conforme", "F176-Q12": "Conforme/Não Conforme", "F176-Q13": "Dividido pela quantidade verificada", "F176-Q14": "Conforme/Não Conforme", "F176-Q15": "Conforme/Não Conforme", "F176-Q16": "Conforme/Não Conforme", "F176-Q17": "Conforme/Não Conforme", "F176-Q18": "Dividido pela quantidade verificada", "F176-Q19": "Dividido pela quantidade verificada", "F176-Q20": "Dividido pela quantidade verificada", "F176-Q21": "Dividido pela quantidade verificada", "F176-Q22": "Conforme/Não Conforme", "F176-Q23": "Conforme/Não Conforme",
};

const qualitySourceNotes: Record<string, string> = {
  "F175-Q07": "pode ser não aplicavel, dividir entre as outras notas",
};

export const qualityModels: QualityModel[] = [
  quality("F175", "Farol da Qualidade Simplificado", true, [
    ["F175-Q01", "Existe o controle de recebimento e aceitação de materiais (FVM)?", .5, "1. Armazenamento de Materiais", "tabela 2, linha 3"], ["F175-Q02", "Existe o controle de validade dos materiais (F.99)?", .5, "1. Armazenamento de Materiais", "tabela 2, linha 4"], ["F175-Q03", "Existe o acompanhamento semanal da TAM (F.87)?", .5, "1. Armazenamento de Materiais", "tabela 2, linha 5"], ["F175-Q04", "Existe o controle de armazenamento dos materiais? (Pontuação dividida pela quantidade de materiais estocados)", 1.5, "1. Armazenamento de Materiais", "tabela 2, linha 6"],
    ["F175-Q05", "As atividades estão sendo realizadas conforme as especificações do projeto?", 1, "2. Execução dos Processos", "tabela 2, linha 8"], ["F175-Q06", "Os documentos de revisão de projeto e alterações estão corretamente controlados (F.110)?", .5, "2. Execução dos Processos", "tabela 2, linha 9"], ["F175-Q07", "Controle de Transporte de Resíduos (CTR)?", .5, "3. Ambiente de Trabalho", "tabela 2, linha 11"], ["F175-Q08", "Identificação das caçambas de entulho?", .5, "3. Ambiente de Trabalho", "tabela 2, linha 12"], ["F175-Q09", "Identificação da baia de bags?", .5, "3. Ambiente de Trabalho", "tabela 2, linha 13"], ["F175-Q10", "Estão sendo realizadas inspeções periódicas para verificação da qualidade dos serviços executados (FVS)? (distribuir o peso pela quantidade de serviços verificados)", 4, "4. Inspeções e Ensaios", "tabela 2, linha 15"],
  ]),
  quality("F176", "Farol da Qualidade Completo", null, [
    ["F176-Q01", "Existe um plano de qualidade (PQO) documentado, aprovado e atualizado no Autodoc Qualidade?", .3, "1. Controle de Qualidade", "tabela 2, linha 3"], ["F176-Q02", "A obra possui projeto de canteiro e ele está atualizado incluindo, minimamente, questões de logística e produção e as áreas de vivência?", .7, "1. Controle de Qualidade", "tabela 2, linha 4"], ["F176-Q03", "A obra controla o consumo mensal de resíduos, energia e água (F.107)? Checar contas do último mês e comparar com valores da planilha.", .4, "1. Controle de Qualidade", "tabela 2, linha 5"], ["F176-Q04", "A obra controla os equipamentos de medição (F.39)?", .2, "1. Controle de Qualidade", "tabela 2, linha 6"], ["F176-Q05", "Os objetivos estabelecidos pelo plano mensal de atividades estão sendo realizados (F.49)?", .2, "1. Controle de Qualidade", "tabela 2, linha 7"],
    ["F176-Q06", "Existe o controle de recebimento e aceitação de materiais (FVM)?", .3, "2. Armazenamento de Materiais", "tabela 2, linha 9"], ["F176-Q07", "Existe o controle de validade dos materiais (F.99)?", .3, "2. Armazenamento de Materiais", "tabela 2, linha 10"], ["F176-Q08", "Existe o acompanhamento semanal da TAM (F.87)?", .3, "2. Armazenamento de Materiais", "tabela 2, linha 11"], ["F176-Q09", "Existe o controle de armazenamento dos materiais (Identificação e estocagem conforme TAM)? (Pontuação dividida pela quantidade de materiais estocados.)", 1, "2. Armazenamento de Materiais", "tabela 2, linha 12"], ["F176-Q10", "As atividades estão sendo realizadas conforme as especificações do projeto?", .7, "3. Execução dos Processos", "tabela 2, linha 14"], ["F176-Q11", "Os projetos em campo e/ou utilizados na engenharia estão com suas revisões corretamente controladas?", .3, "3. Execução dos Processos", "tabela 2, linha 15"],
    ["F176-Q12", "A qualificação e treinamento da equipe de trabalho estão conforme?", .2, "4. Treinamento", "tabela 2, linha 17"], ["F176-Q13", "Todos os colaboradores envolvidos na obra estão cientes das políticas e procedimentos de qualidade?", .2, "4. Treinamento", "tabela 2, linha 18"], ["F176-Q14", "Há registros de treinamentos realizados?", .2, "4. Treinamento", "tabela 2, linha 19"], ["F176-Q15", "Existem procedimentos de controle ambiental sendo seguidos na obra (PGRCC)?", .3, "5. Ambiente de Trabalho", "tabela 2, linha 21"], ["F176-Q16", "Controle de Transporte de Resíduos (CTR)?", .2, "5. Ambiente de Trabalho", "tabela 2, linha 22"], ["F176-Q17", "Identificação das caçambas de entulho?", .2, "5. Ambiente de Trabalho", "tabela 2, linha 23"], ["F176-Q18", "Identificação da baia de bags?", .2, "5. Ambiente de Trabalho", "tabela 2, linha 24"], ["F176-Q19", "As licenças das empresas responsáveis pelo descarte dos resíduos gerados estão sendo devidamente registradas? Verificar também validade das licenças.", .2, "5. Ambiente de Trabalho", "tabela 2, linha 25"], ["F176-Q20", "Estão sendo realizadas inspeções periódicas para verificação da qualidade dos serviços executados (FVS)? (pontuação dividida pela quantidade de serviços auditados)", 3, "6. Inspeções e Ensaios", "tabela 3, linha 2"], ["F176-Q21", "Há registros documentais das inspeções realizadas e dos testes executados (PCT)?", .2, "6. Inspeções e Ensaios", "tabela 3, linha 3"], ["F176-Q22", "As oportunidades de melhoria e riscos são registradas (F.122)?", .2, "7. Melhoria Contínua", "tabela 3, linha 5"], ["F176-Q23", "O canteiro está limpo e organizado?", .2, "7. Melhoria Contínua", "tabela 3, linha 6"],
  ]),
];

export const allCriteria = [...securityCriteria, ...qualityModels.flatMap((model) => model.criteria)];
