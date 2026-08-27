/**
 * Status efetivo da partida, derivado na leitura.
 *
 * Não existe cron varrendo partidas vencidas nem correção travada: o status
 * é calculado a partir dos timestamps que a consulta já traz.
 *
 * Isto é derivação para a TELA. A decisão que vale — se o envio entrou no
 * prazo — é tomada dentro de enviar_partida(), no Postgres, contra o relógio do
 * banco. Aqui é só qual UI mostrar, e para isso o relógio do servidor de
 * aplicação basta.
 *
 * Já foi uma VIEW no banco. Virou função porque uma view exigia migração e
 * ficava sujeita ao cache de schema do PostgREST — infraestrutura para
 * calcular o que a própria linha já responde.
 *
 * Autoteste: `node lib/grading.check.ts`
 */

export type MatchStatus =
  | "in_progress"
  | "submitted"
  | "grading"
  | "needs_reupload"
  | "graded"
  | "expired"
  | "grading_failed"
  | "cancelled";

/** Passou disto em grading, tratamos como falha (PRD 6.5). */
export const GRADING_TIMEOUT_MS = 15 * 60 * 1000;

export function effectiveStatus(
  m: { status: MatchStatus; deadline: string; submitted_at: string | null },
  now: number = Date.now()
): MatchStatus {
  if (m.status === "in_progress" && new Date(m.deadline).getTime() < now) {
    return "expired";
  }

  // O que não pode acontecer é partida presa em grading para sempre.
  if (
    m.status === "grading" &&
    m.submitted_at &&
    new Date(m.submitted_at).getTime() + GRADING_TIMEOUT_MS < now
  ) {
    return "grading_failed";
  }

  return m.status;
}

/**
 * Espelha p_grace_seconds em enviar_partida(). Latência de rede não é trapaça.
 */
export const SUBMIT_GRACE_SECONDS = 120;

/**
 * Entregou fora do prazo?
 *
 * Derivado de elapsed_seconds, que é gravado UMA vez no envio e nunca muda —
 * não da coluna status, que é mutável. Importa porque o fluxo de reprocessamento
 * sobrescreve status: uma partida expired que falha na correção vira
 * grading_failed, e ler a expiração do status pagaria XP para uma entrega
 * atrasada na segunda tentativa.
 */
export function isLate(m: {
  elapsed_seconds: number | null;
  duration_seconds: number;
}): boolean {
  if (m.elapsed_seconds === null) return false;
  return m.elapsed_seconds > m.duration_seconds + SUBMIT_GRACE_SECONDS;
}
