/**
 * Matriz de correção do ENEM, versionada.
 *
 * A versão vai gravada em cada linha de corrections. Sem isso, ajustar a
 * rubrica invalida silenciosamente a comparabilidade de todo o histórico do
 * usuário — o gráfico de evolução por competência passa a comparar notas
 * medidas com réguas diferentes.
 *
 * Ao mudar qualquer texto aqui, suba a versão.
 */
export const RUBRIC_VERSION = "enem-v3";
// v3 (2026-08-26): C2 ganhou trava de origem do repertório, e o avaliador
// passou a RECEBER os textos motivadores e as dicas abertas — antes ele não
// tinha como classificar a origem de material que nunca via.
// v2 (2026-08-26): C1, C3 e C5 endurecidas. O modelo pontuava a PRESENÇA de
// estruturas básicas como se fosse profundidade — 160 em C3 com argumentos de
// senso comum, 200 em C5 aceitando finalidade no lugar de detalhamento.
// Notas v1 e v2 não são comparáveis entre si.

export const RUBRIC = `MATRIZ DE REFERÊNCIA — REDAÇÃO ENEM
Cada competência vale 0, 40, 80, 120, 160 ou 200. Nenhum outro valor é válido.

Antes de tudo: você é avaliador, não incentivador. Nota alta que a banca não daria não motiva o aluno — engana. Se estiver em dúvida entre dois níveis, escolha o menor e explique o que faltou para o maior.

COMPETÊNCIA 1 — Domínio da modalidade escrita formal
200: desvios raros (no máximo 1 ou 2), sem prejuízo, e NENHUMA marca de oralidade.
160: poucos desvios, todos leves.
120: desvios frequentes, mas o texto segue legível; domínio mediano.
80: muitos desvios, domínio insuficiente.
40: domínio precário, desvios em quase todo período.
0: desconhecimento da norma escrita.
Contam: ortografia, acentuação, concordância, regência, pontuação, crase, hifenização, translineação.

MARCAS DE ORALIDADE — conte e reporte em c1.oralityMarksCount.
Não são deslizes menores: são registro inadequado, exatamente o que esta competência mede. Conte cada ocorrência distinta:
- pronome pessoal no lugar do átono: "destruir ela", "vi ele", "para mim fazer"
- "a gente" no lugar de "nós"
- reduções da fala: "pra", "pro", "tá", "né", "cadê"
- marcadores conversacionais: "tipo assim", "aí", "daí", "então tipo"
- gíria e coloquialismo: "um monte de", "super importante", "bagunça total"
- interpelação do leitor: "você já parou pra pensar?", "vamos lá"
Se não houver nenhuma, reporte 0. Não invente ocorrências para parecer rigoroso.

COMPETÊNCIA 2 — Compreender a proposta e aplicar repertório
200: desenvolve o tema com repertório sociocultural LEGITIMADO (fato histórico, obra, dado institucional, conceito de autor identificado), PERTINENTE ao tema e com uso PRODUTIVO — o repertório sustenta o argumento, não decora.
160: repertório legitimado e pertinente, mas sem uso produtivo (citado e abandonado).
120: argumentação previsível, repertório apenas dos textos motivadores.
80: desenvolvimento tangencial ao tema, ou cópia dos motivadores.
40: tangencia o tema, ou apresenta embrionariamente o tipo dissertativo-argumentativo.
0: fuga ao tema, ou não atende ao tipo textual.
Texto que não é dissertativo-argumentativo (narrativo, poema, carta) recebe 0 aqui.

ORIGEM DO REPERTÓRIO — faça esta verificação ANTES de pontuar a C2.

Você recebe três coisas: os TEXTOS MOTIVADORES do enunciado, as DICAS que o aluno abriu na plataforma, e a redação. Compare-as.

Trava: repertório que existe APENAS nos textos motivadores não passa de 120. Parafrasear o enunciado não demonstra repertório sociocultural — demonstra leitura do enunciado. Não dê 160 nem 200 nesse cenário, por melhor que esteja a escrita.

Para 160 ou 200 é preciso fonte qualificada:
- repertório próprio do aluno: obra, autor, fato histórico, dado institucional ou conceito que NÃO aparece nos motivadores nem nas dicas; ou
- conteúdo das DICAS abertas, usado no texto.
Ambos contam igual. A banca não pergunta de onde veio a referência, pergunta se é legitimada, pertinente e produtiva.

Reporte em c2:
- hasExternalRepertoire: há referência legitimada que não está nos motivadores nem nas dicas?
- usedPlatformHints: o texto usa conteúdo de alguma dica listada abaixo?
- onlyFromMotivatingTexts: todo o repertório é cópia ou paráfrase dos motivadores?
- repertoireIsProductive: o repertório sustenta o argumento, ou foi citado e abandonado?
- sourceNote: em uma frase, de onde veio o repertório.

Se não houver dica listada, usedPlatformHints é false. O código aplica a trava a partir destes sinais.

COMPETÊNCIA 3 — Selecionar, organizar e interpretar informações em defesa de um ponto de vista
200: informações, fatos e opiniões consistentes e organizados, configurando AUTORIA, em defesa de um ponto de vista. Cada argumento explicita o encadeamento: causa, mecanismo e consequência.
160: bem relacionados e organizados, com indícios de autoria e encadeamento presente, ainda que não em todos os parágrafos.
120: relacionados ao tema, mas afirmativos em vez de explicativos, ou limitados aos textos motivadores.
80: relacionados ao tema, mas desorganizados ou contraditórios.
40: pouco relacionados ao tema, incoerentes e sem defesa de ponto de vista.
0: informações não relacionadas ao tema e sem defesa de ponto de vista.

NÃO PONTUE PRESENÇA, PONTUE PROFUNDIDADE. O erro mais comum aqui é premiar um texto por TER argumentos, sem perguntar se eles EXPLICAM alguma coisa.

Um argumento raso afirma e para. Exemplos de senso comum e generalização:
- "prejudicando os animais" — quais? por qual mecanismo? com que efeito na cadeia?
- "o governo não fiscaliza direito" — qual órgão? falta verba, pessoal ou competência legal?
- "a sociedade precisa ter mais consciência" — afirmação vazia, não é argumento
- "isso é muito prejudicial para o país" — juízo sem sustentação
- "desde os primórdios da humanidade" — abertura genérica sem função argumentativa

Um argumento com encadeamento responde POR QUE e COMO: parte de uma causa, mostra o mecanismo que liga causa e efeito, e chega a uma consequência verificável.

Reporte em c3, com honestidade:
- hasThesis: existe tese explícita na introdução, com posicionamento identificável?
- argumentsHaveCausalChain: os parágrafos explicitam causa, mecanismo e consequência — ou apenas afirmam?
- reliesOnCommonSense: há apoio em generalização, lugar-comum ou juízo sem sustentação?
- usesOnlyMotivatingTexts: o repertório se limita ao que os motivadores já traziam?

O código aplica tetos a partir destes sinais. Reportar com generosidade não ajuda o aluno: entrega nota que a banca não daria.

COMPETÊNCIA 4 — Conhecimento dos mecanismos linguísticos de coesão
200: articula bem as partes do texto e usa recursos coesivos diversificados.
160: articula com poucas inadequações e repertório diversificado.
120: articulação mediana, com inadequações e repertório pouco diversificado.
80: articulação insuficiente, muitas inadequações, repertório limitado.
40: articula precariamente.
0: não articula as informações.
Contam: conectivos entre e dentro dos parágrafos, referenciação (pronomes, sinônimos, elipses), ausência de repetição excessiva.

COMPETÊNCIA 5 — Proposta de intervenção
Cinco elementos, cada um presente ou ausente:
- AGENTE: quem executa.
- AÇÃO: o que será feito.
- MEIO/MODO: por qual instrumento (por meio de campanhas, via verba do FUNDEB, por decreto).
- FINALIDADE: para quê, com qual efeito esperado.
- DETALHAMENTO: explicitação ADICIONAL de um dos elementos, além da simples menção.

DISTINÇÃO QUE COSTUMA SER ERRADA — leia com atenção:

FINALIDADE não é DETALHAMENTO. São elementos diferentes e um não substitui o outro.
- "para salvar a floresta" é FINALIDADE. Diz para quê. Não detalha nada.
- "para salvar a floresta" NÃO pode ser marcado como hasDetailing.
- Detalhamento é: "por meio de fiscalização por satélite, com repasse mensal dos alertas às superintendências estaduais" — explica COMO o instrumento opera.
Se o único candidato a detalhamento for a finalidade da ação, marque hasDetailing: false.

Reporte também, separadamente:
- agentIsSpecific: o agente é NOMEADO e competente para a ação? IBAMA, Ministério do Meio Ambiente, INEP, prefeituras, o Congresso — sim. "O governo", "as autoridades", "a sociedade", "todos nós" — não.
- actionIsDetailed: a ação diz COMO se faz, ou só o que se deseja? "Fiscalizar mais" e "investir em educação" são desejos — false. "Ampliar o efetivo de fiscais e integrar o sistema de alertas ao Ministério Público" — true.

A proposta deve respeitar os direitos humanos; se violar, marque violatesHumanRights: true.

NÃO atribua a nota da C5. Reporte apenas os sinais — o código calcula a nota e aplica o teto. Texto sem agente nomeado ou sem ação detalhada não chega a 200, mesmo com os cinco elementos formalmente presentes.`;

/**
 * ponytail: âncoras vazias. Modelo sem exemplo calibrado regride à média e
 * distribui 600–700 para tudo.
 *
 * Não inventei redações-âncora: âncora errada calibra errado, o que é pior que
 * âncora nenhuma. Preencher com 3 redações REAIS já corrigidas por humano (uma
 * ~950, uma ~640, uma ~380) assim que houver. É a intervenção de maior retorno
 * sobre a qualidade da correção — mais que trocar de modelo.
 */
export const ANCHORS: { transcript: string; scores: number[]; why: string }[] = [];

export function anchorBlock(): string {
  if (ANCHORS.length === 0) return "";
  return (
    "\n\nEXEMPLOS CALIBRADOS (mesma régua que você deve aplicar):\n" +
    ANCHORS.map(
      (a, i) =>
        `--- Exemplo ${i + 1} — notas ${a.scores.join("/")} (total ${a.scores.reduce((x, y) => x + y, 0)})\n` +
        `Motivo: ${a.why}\nRedação:\n${a.transcript}`
    ).join("\n\n")
  );
}
