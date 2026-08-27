"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseUser } from "@/lib/supabase";

/**
 * Amigos e duelos assíncronos.
 *
 * Tudo passa por funções security definer no Postgres. Não é preguiça de
 * escrever query: profiles tem RLS "só a própria linha", então um usuário não
 * consegue nem descobrir que outro existe. As funções são a única superfície
 * que atravessa isso, e cada uma devolve exatamente o que a tela precisa.
 */

export type Amigo = {
  friendship_id: string;
  amigo_id: string;
  username: string;
  status: "pendente" | "aceito";
  sou_solicitante: boolean;
  xp: number;
};

export type Duelo = {
  duel_id: string;
  status: "pendente" | "ativo" | "concluido" | "recusado";
  expirado: boolean;
  sou_desafiante: boolean;
  oponente_id: string;
  oponente_nome: string;
  tema_titulo: string;
  dificuldade: string;
  criado_em: string;
  expira_em: string;
  minha_match_id: string | null;
  minha_status: string | null;
  meu_xp: number | null;
  oponente_match_id: string | null;
  oponente_status: string | null;
  oponente_xp: number | null;
  resultado: "aguardando" | "ganhei" | "perdi" | "empate";
};

async function rpc<T>(nome: string, args: Record<string, unknown> = {}) {
  const supabase = await supabaseUser();
  const { data, error } = await supabase.rpc(nome, args);
  if (error) throw new Error(error.message);
  return data as T;
}

// ==========================================================================
// Amigos
// ==========================================================================

export async function listarAmigos() {
  return (await rpc<Amigo[]>("meus_amigos")) ?? [];
}

export async function pedirAmizade(codigo: string) {
  const limpo = codigo.trim().toUpperCase();
  if (limpo.length !== 6) throw new Error("o código tem 6 caracteres");

  const r = await rpc<string>("pedir_amizade", { p_codigo: limpo });
  revalidatePath("/duelos");

  return r === "aceito"
    ? "Vocês já eram pedido mútuo — amizade aceita."
    : r === "ja_existe"
      ? "Vocês já estão conectados."
      : "Pedido enviado.";
}

export async function responderAmizade(friendshipId: string, aceitar: boolean) {
  await rpc("responder_amizade", { p_id: friendshipId, p_aceitar: aceitar });
  revalidatePath("/duelos");
}

// ==========================================================================
// Duelos
// ==========================================================================

export async function listarDuelos() {
  return (await rpc<Duelo[]>("meus_duelos")) ?? [];
}

export async function criarDuelo(amigoId: string, dificuldade: string) {
  await rpc<string>("criar_duelo", {
    p_amigo_id: amigoId,
    p_difficulty: dificuldade,
  });
  revalidatePath("/duelos");
}

export async function responderDuelo(duelId: string, aceitar: boolean) {
  await rpc("responder_duelo", { p_duel_id: duelId, p_aceitar: aceitar });
  revalidatePath("/duelos");
}

/**
 * Começa (ou retoma) a sua metade do duelo.
 *
 * O redirect fica fora do try por construção: `redirect()` funciona lançando,
 * e um catch por perto engoliria a navegação.
 */
export async function jogarDuelo(duelId: string) {
  const matchId = await rpc<string>("iniciar_partida_duelo", { p_duel_id: duelId });
  redirect(`/match/${matchId}`);
}
