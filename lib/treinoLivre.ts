/**
 * Limites do relógio no treino livre.
 *
 * Mora em lib/ e não em app/actions.ts porque um arquivo "use server" só pode
 * exportar função async — constante ali quebra o build. E não fica solta no
 * componente porque o clamp da tela e a validação do servidor precisam ser o
 * mesmo número.
 *
 * A cópia que MANDA é a de iniciar_partida(), no Postgres: p_minutes chega por
 * POST e o cliente não decide nada. Estas constantes existem para o seletor
 * não oferecer o que o banco vai recusar. Mudou aqui, mude lá.
 *
 * O teto de 240 min não é rigor de prova — é o ponto em que "treinar sem
 * pressa" e "esquecer a aba aberta" deixam de se distinguir.
 */
export const TREINO_LIVRE_MIN_MINUTOS = 5;
export const TREINO_LIVRE_MAX_MINUTOS = 240;

/**
 * Tamanho do tema escrito pelo jogador.
 *
 * Espelha iniciar_partida(), e a cópia que manda continua sendo a do Postgres.
 * O teto não é estética: o título entra no prompt de correção, então um texto
 * gigante é conta de API paga sem redação nenhuma escrita.
 */
export const TEMA_LIVRE_MIN_CHARS = 10;
export const TEMA_LIVRE_MAX_CHARS = 180;
