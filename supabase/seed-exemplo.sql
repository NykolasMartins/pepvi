-- PEPVI — seed de EXEMPLO.
--
-- Três temas e nove dicas, para que quem clonar o repositório consiga rodar o
-- projeto de ponta a ponta.
--
-- O banco completo (22 temas e 66 dicas) não está aqui de propósito: a
-- curadoria dos textos motivadores e das referências de repertório é trabalho
-- editorial, e é o único ativo do projeto que o código não reproduz. A
-- estrutura toda — schema, RLS, funções, tetos de correção — está pública.
--
-- Rode DEPOIS de schema.sql. Idempotente por título.

create unique index if not exists themes_title_key on themes (title);

with proposta as (
  select 'A partir da leitura dos textos motivadores e com base nos conhecimentos construídos ao longo de sua formação, redija um texto argumentativo em modalidade escrita formal da língua portuguesa sobre o tema, apresentando proposta de intervenção que respeite os direitos humanos. Selecione, organize e relacione, de forma coerente e coesa, argumentos e fatos para defesa de seu ponto de vista.' as texto
)
insert into themes (title, statement, supporting_texts, source_year, difficulty)
select t.title, proposta.texto, t.motivadores::jsonb, t.ano, t.dificuldade
from proposta,
(values
  (
    'Viver em rede no século XXI: os limites entre o público e o privado',
    '[{"source":"Constituição Federal, art. 5º, X","content":"São inviolávies a intimidade, a vida privada, a honra e a imagem das pessoas, assegurado o direito a indenização pelo dano material ou moral decorrente de sua violação."},
      {"source":"Lei 12.965/2014 (Marco Civil da Internet), art. 3º","content":"A disciplina do uso da internet no Brasil tem como princípios a proteção da privacidade e a proteção dos dados pessoais, na forma da lei."}]',
    2011, 3
  ),
  (
    'O movimento imigratório para o Brasil no século XXI',
    '[{"source":"Lei 13.445/2017 (Lei de Migração), art. 3º","content":"A política migratória brasileira rege-se pela universalidade, indivisibilidade e interdependência dos direitos humanos e pelo repúdio à xenofobia, ao racismo e a quaisquer formas de discriminação."},
      {"source":"Declaração Universal dos Direitos Humanos, art. 14","content":"Toda pessoa vítima de perseguição tem o direito de procurar e de gozar asilo em outros países."}]',
    2012, 3
  ),
  (
    'Efeitos da implantação da Lei Seca no Brasil',
    '[{"source":"Lei 11.705/2008 (Lei Seca)","content":"Altera o Código de Trânsito Brasileiro para inibir o consumo de bebida alcoólica por condutor de veículo automotor."},
      {"source":"Organização Mundial da Saúde","content":"O consumo de álcool é um dos principais fatores de risco evitáveis em mortes no trânsito."}]',
    2013, 2
  )
) as t(title, motivadores, ano, dificuldade)
on conflict (title) do nothing;

-- ==========================================================================
-- Dicas dos temas acima
-- ==========================================================================
insert into hints (theme_id, kind, content, cost_xp, order_index)
select t.id, v.kind, v.content, 25, v.order_index
from (values
('Viver em rede no século XXI: os limites entre o público e o privado','repertorio','Michel Foucault, em "Vigiar e Punir", descreve o panóptico: uma arquitetura em que a possibilidade constante de ser observado faz o vigiado disciplinar a si mesmo. Nas redes, a vigilância deixou de precisar de vigia.',0),
('Viver em rede no século XXI: os limites entre o público e o privado','repertorio','Zygmunt Bauman e David Lyon, em "Vigilância Líquida", argumentam que hoje a vigilância é aderida voluntariamente: o usuário entrega os próprios dados em troca de conveniência e reconhecimento.',1),
('Viver em rede no século XXI: os limites entre o público e o privado','tese','Separe duas coisas que costumam ser confundidas: exposição escolhida e vigilância imposta. A primeira é exercício de liberdade; a segunda viola o art. 5º, X da Constituição. O problema é que a primeira serve de justificativa para a segunda.',2),
('O movimento imigratório para o Brasil no século XXI','repertorio','A Lei de Migração (13.445/2017) substituiu o Estatuto do Estrangeiro de 1980, que tratava o imigrante como assunto de segurança nacional. A troca de paradigma — de ameaça a sujeito de direitos — é o repertório mais forte aqui.',0),
('O movimento imigratório para o Brasil no século XXI','repertorio','Dois fluxos recentes concretizam o tema: haitianos após o terremoto de 2010 e venezuelanos por Roraima, que motivou a Operação Acolhida em 2018. Um caso concreto vale mais que falar de "imigração" em abstrato.',1),
('O movimento imigratório para o Brasil no século XXI','tese','O Brasil se orgulha de um passado de imigração europeia e trata a imigração presente como problema. Essa contradição entre memória celebrada e realidade rejeitada sustenta um texto inteiro.',2),
('Efeitos da implantação da Lei Seca no Brasil','repertorio','A Lei 11.705/2008 criou a proibição, mas foi a Lei 12.760/2012 que a tornou aplicável, ao aceitar provas além do bafômetro — vídeo, testemunho, sinais de embriaguez. Mostra que lei sem meio de fiscalização não muda comportamento.',0),
('Efeitos da implantação da Lei Seca no Brasil','repertorio','A teoria da dissuasão, na criminologia, sustenta que o que inibe a infração não é a severidade da pena, mas a probabilidade percebida de ser pego. Explica por que blitz visível funciona melhor que multa alta.',1),
('Efeitos da implantação da Lei Seca no Brasil','tese','Em vez de defender ou atacar a lei, argumente sobre o que ela revela: mudança de comportamento coletivo exige lei, fiscalização e mudança cultural ao mesmo tempo — duas das três não bastam.',2)
) as v(titulo, kind, content, order_index)
join themes t on t.title = v.titulo
on conflict (theme_id, order_index) do nothing;

select (select count(*) from themes where active) as temas,
       (select count(*) from hints) as dicas;
-- Com apenas este seed: 3 temas e 9 dicas.
