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
export const RUBRIC_VERSION = "enem-v4";
// v4 (2026-09-03): ANCHORS deixou de ser vazio. Tres redacoes reais
// corrigidas por humano (880, 640 e 360) passaram a acompanhar todo prompt
// de avaliacao. Sem exemplo calibrado o modelo regredia a media e distribuia
// 600-700 para tudo; a regua mudou, entao notas v3 e v4 nao se comparam.
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
 * Redações-âncora: o que cada nota REALMENTE parece.
 *
 * Sem elas o modelo regredia à média e distribuía 600–700 para tudo. As três
 * cobrem a escala (880, 640, 360) e foram escolhidas para ensinar as fronteiras
 * onde o avaliador mais erra: repertório com fonte nomeada contra conceito
 * solto na C2, e os cinco elementos presentes sem detalhamento real na C5.
 *
 * ORIGEM: corpus Extended Essay-BR (github.com/lplnufpi/essay-br, licença MIT),
 * corrigido por professores pela régua do ENEM. NÃO são notas do INEP — a banca
 * oficial pode ser mais dura, sobretudo na C2. Ao conseguir redações com nota
 * oficial, substitua estas e suba a versão.
 *
 * Cada uma foi conferida contra a rubrica antes de entrar: o corpus tem casos
 * com C5 200 sem nenhuma proposta de intervenção, e uma âncora dessas ensinaria
 * o modelo a repetir o erro. Âncora errada calibra errado — pior que nenhuma.
 *
 * O `theme` não é decoração: sem saber qual era a proposta, não há como julgar
 * a pertinência do repertório, que é metade da C2.
 */
export const ANCHORS: {
  theme: string;
  transcript: string;
  scores: number[];
  why: string;
}[] = [
  {
    theme: "Privatização do saneamento básico",
    scores: [160, 200, 160, 200, 160],
    why:
      "C2 200: dado institucional datado (SNIS 2017, 48% sem coleta de esgoto), ONU e Schopenhauer sustentam o argumento em vez de decorarem. C5 160 e não 200: os cinco elementos estão lá (Ministério da Saúde, expandir serviços, com auxílio das prefeituras, relatório e redirecionamento de verbas, popularizar o acesso), mas o detalhamento é administrativo e não diz como a expansão chega à zona rural. C1 160: desvios pontuais de acentuação e vírgula que não comprometem a leitura. Ter os cinco elementos da C5 não garante 200.",
    transcript: `A Constituição Federal de 1988 assegura a todos os indivíduos o acesso ao saneamento básico. No entanto, na prática, tal garantia é deturpada, visto que esse direito, indispensável para a saúde da população, é precário em zonas rurais e periféricas. Assim, uma possível privatização do saneamento básico restringirá ainda mais a saúde no Brasil. Isso ocorre devido a má distribuição de renda e a negligência governamental.

Em primeira análise, a desigualdade de renda corrobora para a elitizacão do acesso ao saneamento. Segundo a ONU , o Brasil está em segundo lugar em concentração de renda nas mãos de poucos . Visto isso, fica claro que privatizar tal serviço agravará a desigualdade social e o tornará ainda mais restrito, uma vez que, nas mãos de empresas privadas, os impostos crescerão cada vez mais e a população carente não terá condições de arcar com as despesas.

Além disso, é irrefutável o descaso governamental na resolução do problema. De acordo com o SNIS 2017 (Sistema Nacional de Informações sobre Saneamento), o Brasil tem 48% da população sem coleta de esgoto, esse dado mostra como a gestão brasileira é ineficaz na democratização de serviços essenciais. Mas privatizar não solucionará o problema do povo, apenas beneficiará a geração de lucro, e sacrificar a saúde a qualquer outra vantagem é o maior erro do homem , assim como afirmava Arthur Schopenhauer.

Entende-se, portanto, a necessidade em democratizar o saneamento básico. Para tanto, o Estado , através do Ministério da Saúde, deve expandir o alcance dos serviços de esgoto, de água, de coleta de lixo e limpeza pública para zonas rurais e periféricas com o auxílio da prefeitura de cada região, onde os prefeitos devem fornecer um relatório sobre a atual situação para que possa ser analisada e redirecionar as verbas governamentais para a resolução do problema a fim de popularizar o acesso ao saneamento básico. Assim, a população verá o direito constitucional como uma realidade próxima.`,
  },
  {
    theme: "Escola no Brasil: com partido ou sem partido?",
    scores: [120, 160, 120, 120, 120],
    why:
      "C2 160 e não 200: a análise é conceitual e coerente (classes antagônicas, alienação, função social do professor), mas nenhum autor, obra ou dado é nomeado — conceito sem fonte legitimada não passa de 160. C3 120: os parágrafos repetem a mesma tese em vez de encadear causa e consequência. C5 120: 'devemos exigir a discussão' é desejo, não proposta — sem agente, sem meio, sem detalhamento. Texto bem escrito e organizado que ainda assim fica na média por falta de repertório e de intervenção.",
    transcript: `Diante da emersão do projeto de Lei “Escola sem Partido”, necessita-se analisar os pressupostos dessa proposta conservadora, porque busca intimidar o professor ao coibi-lo de expor suas ideologias no ambiente de ensino. O educador é um ser social crítico, proibi-lo de exercer sua função social é um atraso histórico.

A sociedade é marcada por divisões de classes antagônicas que se relacionam por diferentes meios. Nesse contexto, o profissional da educação é vítima de um sistema social alienador que impõe medo e individualiza os seres humanos. O professor na escola discute e aborda suas ideias sejam elas críticas ou conservadoras, o aluno democraticamente escolhe qual segui-la . Nessa perspectiva o professor não doutrina, e sim esclarece dúvidas.

Acusá-lo de doutrinação é oprimi-lo de construir uma sociedade democrática que luta por direitos e reconhece seus deveres. A educação tem a função social de construir indivíduos conscientes, justos, críticos que não se intimidam pelas desigualdades. No entanto, o ato de educador não esta livre de alienação e alienadores.

Em tese, aprovar a “Escola sem Partido” que prevê a punição aos professores que façam “doutrinação ideológica” na escola é um retrocesso. Pois, em vez de proibir, devemos exigir a discussão, a análise e o exame dos pressupostos que norteiam o discurso de pais, professores e alunos.`,
  },
  {
    theme: "Caminhos para combater a intolerância religiosa no Brasil",
    scores: [80, 80, 80, 40, 80],
    why:
      "C1 80: desvios graves e recorrentes de concordância ('agressões permanece', 'criminosos que não respeita') e grafia ('constiuição'). C4 40: rupturas de coesão e trechos truncados — as interrogações soltas marcam onde a frase se perde. C2 80: Kant aparece citado e abandonado, sem sustentar o argumento. C5 80: 'investimento em educação', 'parceria público e privada' e 'leis mais punitivas' são intenções genéricas, sem agente nomeado nem meio de execução.",
    transcript: `É notável que atos de violência contra as crenças religiosas da população brasileira aumenta-se  gradativamente. Atitudes de intolerância são vistas desde a reforma protestante  onde  milhares de indivíduos foram perseguidos e mortos pelos seus representantes políticos por não seguirem a religião designada.

Essas agressões, seja verbal ou corporal permanece  na sociedade, realizadas por criminosos que não respeita  os dogmas escolhidos pelas pessoas que tem  a sua liberdade assegurada pela constiuição .

Em consequência disso, guerras são instituídas, como exemplo a  estado islâmico ? matam   . No Brasil ? o preconceito de crenças emprego por parte de alguns , aumenta a discriminação sofrida por sua população religiosa.

Diante do exposto, como disse o filosofo Immanuel Kant ? "o ser humano é aquilo que a educação faz dele"  o investimento em educação é fundamental para que tenhamos um maior respeito sobre o assunto. Também em parceria público e privada, a criação e a divulgação de campanhas para extinguir o problema, além de leis mais punitivas aos que descumprirem, podendo assim acabar com essa intolerância.`,
  },
];

export function anchorBlock(): string {
  if (ANCHORS.length === 0) return "";
  return (
    "\n\nEXEMPLOS CALIBRADOS (mesma régua que você deve aplicar):\n" +
    ANCHORS.map(
      (a, i) =>
        `--- Exemplo ${i + 1} — C1 ${a.scores[0]} / C2 ${a.scores[1]} / C3 ${a.scores[2]} / C4 ${a.scores[3]} / C5 ${a.scores[4]} (total ${a.scores.reduce((x, y) => x + y, 0)})\n` +
        `Tema da proposta: ${a.theme}\n` +
        `Por que estas notas: ${a.why}\nRedação:\n${a.transcript}`
    ).join("\n\n")
  );
}
