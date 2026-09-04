"use server";

import { revalidatePath } from "next/cache";
import { supabaseUser } from "@/lib/supabase";

/**
 * Ponte para as funções de administração do Postgres.
 *
 * Nenhuma delas usa requireAdmin() / service_role. A guarda real está DENTRO de
 * cada função SQL (`if not sou_admin() then raise`), e é por isso que ela
 * continua valendo mesmo que uma rota nova esqueça o layout: a chave que ignora
 * RLS segue restrita aos três pontos do pipeline de correção.
 *
 * Estas ações não fazem checagem própria de admin de propósito. Uma segunda
 * cópia da regra em TypeScript é o tipo de coisa que diverge da que realmente
 * protege — o mesmo motivo de o desbloqueio de dificuldade ser validado só no
 * banco.
 *
 * TUDO aqui é `export async function`. Arquivo "use server" recusa qualquer
 * outro export em tempo de build ("Server Actions must be async functions"), e
 * `export const x = () => promise` não conta como async — foi exatamente assim
 * que este arquivo quebrou o build na primeira tentativa.
 */

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const supabase = await supabaseUser();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

// --------------------------------------------------------------------------
// Painéis (leitura)
// --------------------------------------------------------------------------

export type UsoIA = {
  chamadas24h: number;
  redacoes24h: number;
  porDia: { dia: string; correcoes: number; tokensIn: number; tokensOut: number }[];
  porModelo: { modelo: string; correcoes: number; tokensIn: number; tokensOut: number }[];
  topUsuarios: { username: string; correcoes: number; tokens: number }[];
  limiteDiario: number;
};
export async function getUsoIA() {
  return rpc<UsoIA>("admin_uso_ia");
}

export type Qualidade = {
  porVersao: {
    versao: string; correcoes: number; media: number;
    c1: number; c2: number; c3: number; c4: number; c5: number;
  }[];
  faixas: { de: number; quantas: number }[];
  contestadas: number;
  submissoes: number;
  zeradas: number;
  suspeitas: number;
  reprocessadas: number;
};
export async function getQualidade() {
  return rpc<Qualidade>("admin_qualidade");
}

export type Saude = {
  porStatus: { status: string; quantas: number }[];
  travadasEmCorrecao: number;
  aguardandoFoto: number;
  pausadas: number;
  pausasQuaseVencidas: number;
  vencidasNaoMaterializadas: number;
  falhasCorrecao7d: number;
  fotoIlegivel30d: number;
  sinalizadas: number;
};
export async function getSaude() {
  return rpc<Saude>("admin_saude");
}

export type Uso = {
  usuarios: number;
  ativos7d: number;
  ativos30d: number;
  cadastrosPorSemana: { semana: string; quantos: number }[];
  funil: { iniciadas: number; enviadas: number; corrigidas: number };
  livreVsValendo: { livre: number; valendo: number };
  porDificuldade: { id: string; quantas: number }[];
  dicasAbertas: number;
  temasCustom: number;
};
export async function getUso() {
  return rpc<Uso>("admin_uso");
}

export type TemaAdmin = {
  id: string; title: string; active: boolean; is_custom: boolean;
  queimado_por: number; corrigidas: number; nota_media: number | null; dicas: number;
};
export async function getTemas() {
  return rpc<TemaAdmin[]>("admin_temas");
}

export type PartidaAdmin = {
  id: string; username: string; tema: string; status: string; is_free: boolean;
  criada_em: string; nota: number | null; contestada: boolean; sinalizada: boolean;
};
export async function getPartidas(filtro = "todas", limite = 50) {
  return rpc<PartidaAdmin[]>("admin_partidas", { p_filtro: filtro, p_limite: limite });
}

/**
 * Detalhe de uma redação.
 *
 * Registra o acesso em admin_access_log na mesma transação — por isso não é
 * "só uma leitura" e nunca deve ser chamada especulativamente para preencher
 * uma lista.
 */
export async function getPartida(id: string) {
  return rpc<Record<string, unknown>>("admin_partida", { p_match_id: id });
}

export type Acesso = { admin: string; match_id: string; aluno: string; lido_em: string };
export async function getAcessos(limite = 50) {
  return rpc<Acesso[]>("admin_acessos", { p_limite: limite });
}

export type DicaAdmin = {
  id: string; kind: string; content: string; cost_xp: number;
  order_index: number; aberturas: number;
};
export async function getDicas(themeId: string) {
  return rpc<DicaAdmin[]>("admin_dicas", { p_theme_id: themeId });
}

// --------------------------------------------------------------------------
// Gestão (escrita)
// --------------------------------------------------------------------------

export async function setConfig(chave: string, valor: number) {
  await rpc("admin_set_config", { p_chave: chave, p_valor: valor });
  // O teto aparece no lobby de todo mundo, não só no painel.
  revalidatePath("/", "layout");
}

/**
 * Cria ou atualiza tema do catálogo.
 *
 * Campo ausente em atualização significa "não mexe" — é o que permite ativar um
 * tema sem reenviar o enunciado. Ao CRIAR, título e enunciado são obrigatórios,
 * e quem exige isso é a função no Postgres.
 */
export async function salvarTema(input: {
  id?: string | null;
  title?: string;
  statement?: string;
  supportingTexts?: { source?: string; content?: string }[];
  active?: boolean;
}) {
  await rpc("admin_upsert_tema", {
    p_id: input.id ?? null,
    p_title: input.title ?? null,
    p_statement: input.statement ?? null,
    p_supporting_texts: input.supportingTexts ?? null,
    p_active: input.active ?? null,
  });
  revalidatePath("/admin/conteudo");
  revalidatePath("/");
}

export async function salvarDica(input: {
  id?: string | null;
  themeId: string;
  kind: string;
  content: string;
  costXp: number;
  orderIndex: number;
}) {
  await rpc("admin_upsert_dica", {
    p_id: input.id ?? null,
    p_theme_id: input.themeId,
    p_kind: input.kind,
    p_content: input.content,
    p_cost_xp: input.costXp,
    p_order_index: input.orderIndex,
  });
  revalidatePath("/admin/conteudo");
}

export async function salvarDificuldade(input: {
  id: string;
  durationSeconds: number;
  xpMultiplier: number;
  minXp: number;
}) {
  await rpc("admin_set_dificuldade", {
    p_id: input.id,
    p_duration_seconds: input.durationSeconds,
    p_xp_multiplier: input.xpMultiplier,
    p_min_xp: input.minXp,
  });
  revalidatePath("/admin/conteudo");
  revalidatePath("/");
}
