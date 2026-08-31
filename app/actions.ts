"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseUser, requireAdmin, requireUser } from "@/lib/supabase";
import { computeXp } from "@/lib/scoring";
import { finalScores } from "@/lib/enem";
import { effectiveStatus, isLate, type MatchStatus } from "@/lib/matchStatus";
import {
  TREINO_LIVRE_MIN_MINUTOS,
  TREINO_LIVRE_MAX_MINUTOS,
  TEMA_LIVRE_MIN_CHARS,
  TEMA_LIVRE_MAX_CHARS,
} from "@/lib/treinoLivre";
import {
  transcribe,
  evaluate,
  VISION_MODEL,
  EVAL_MODEL,
  RUBRIC_VERSION,
  LEGIBILITY_GATE,
} from "@/lib/gemini";

/**
 * Gira a roleta e inicia a partida.
 *
 * O sorteio sem repetição e o started_at vivem no banco (função
 * iniciar_partida): o relógio da partida é o relógio do Postgres, não o do
 * Node e muito menos o do navegador.
 */
export type Dificuldade = {
  id: string;
  label: string;
  descricao: string;
  duration_seconds: number;
  xp_multiplier: number;
  min_xp: number;
  desbloqueada: boolean;
};

export async function listDifficulties(): Promise<Dificuldade[]> {
  const supabase = await supabaseUser();
  const { data, error } = await supabase.rpc("dificuldades_disponiveis");
  if (error) throw new Error(error.message);
  return (data ?? []) as Dificuldade[];
}

export type LinhaRanking = {
  posicao: number;
  username: string;
  xp: number;
  partidas: number;
  eu: boolean;
};

/**
 * Ranking entre usuários.
 *
 * A agregação mora numa função security definer no Postgres: a RLS de matches
 * restringe a auth.uid(), e afrouxá-la para o placar exporia as redações de
 * todo mundo. A função devolve só nome, XP e contagem.
 */
export async function getRanking(
  periodo: "semana" | "mes" | "historico"
): Promise<LinhaRanking[]> {
  const supabase = await supabaseUser();
  const { data, error } = await supabase.rpc("ranking", { p_periodo: periodo });
  if (error) throw new Error(error.message);
  return (data ?? []) as LinhaRanking[];
}

/** Nome exibido no ranking. Curto e sem e-mail. */
export async function updateUsername(nome: string) {
  const limpo = nome.trim();
  if (limpo.length < 3) throw new Error("use ao menos 3 caracteres");
  if (limpo.length > 24) throw new Error("máximo de 24 caracteres");
  if (limpo.includes("@")) throw new Error("não use e-mail — este nome aparece no ranking");

  const user = await requireUser();
  const supabase = await supabaseUser();
  const { error } = await supabase
    .from("profiles")
    .update({ username: limpo })
    .eq("id", user.id);

  if (error) {
    throw new Error(
      error.code === "23505" ? "esse nome já está em uso" : error.message
    );
  }
}

export async function startMatch(dificuldade: string = "padrao") {
  // Verificação de partida ativa, expiração de partidas fantasma e sorteio
  // acontecem todos dentro de iniciar_partida(), numa transação só. Duplicar a
  // verificação aqui foi o que travou o game loop: ela rodava antes de o banco
  // materializar o vencimento e enxergava a partida já expirada como ativa.
  const supabase = await supabaseUser();
  // Sem p_user_id: quem o usuário é sai do JWT, dentro do Postgres.
  const { data: matchId, error } = await supabase.rpc("iniciar_partida", {
    p_difficulty: dificuldade,
  });

  if (error) throw new Error(error.message);

  redirect(`/match/${matchId}`);
}

// --------------------------------------------------------------------------
// Treino livre
// --------------------------------------------------------------------------

export type TemaDaLista = {
  id: string;
  title: string;
  jogado: boolean;
};

/**
 * Temas para escolher no treino livre.
 *
 * Só id e título: o enunciado e os textos motivadores continuam saindo na
 * página da partida. Mandar a proposta inteira aqui seria entregar o conteúdo
 * de todos os temas na primeira carga do lobby.
 *
 * `jogado` é informativo — no treino livre repetir é permitido, e saber o que
 * já foi feito é justamente o que ajuda a escolher o que treinar de novo.
 */
export async function listThemes(): Promise<TemaDaLista[]> {
  const supabase = await supabaseUser();

  // Sem filtro por user_id em matches: a RLS restringe a auth.uid().
  const [temas, minhas] = await Promise.all([
    supabase.from("themes").select("id, title").eq("active", true).order("title"),
    supabase.from("matches").select("theme_id").neq("status", "cancelled"),
  ]);

  if (temas.error) throw new Error(temas.error.message);
  if (minhas.error) throw new Error(minhas.error.message);

  const jogados = new Set((minhas.data ?? []).map((m) => m.theme_id));
  return (temas.data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    jogado: jogados.has(t.id),
  }));
}

/**
 * Treino livre: o jogador escreve o próprio tema, escolhe o relógio, e nada
 * disso paga XP.
 *
 * Três caminhos para o tema, nesta precedência: o texto digitado, um tema do
 * catálogo, ou aleatório. Quem resolve é iniciar_partida — e o ENUNCIADO é
 * montado lá, não aqui e muito menos no cliente: ele acompanha o tema no prompt
 * de correção, e a instrução sobre direitos humanos que a Competência 5 cobra
 * não pode depender do que veio no POST.
 *
 * Mesma função do Postgres da partida comum. A regra de UMA partida ativa por
 * usuário mora lá dentro, e uma segunda porta de entrada seria uma segunda
 * cópia dela.
 *
 * Os limites aparecem duas vezes — aqui e em iniciar_partida. O que vale é o do
 * banco; este só evita a ida ao servidor.
 */
export async function startFreeMatch(
  tema: string | null,
  themeId: string | null,
  minutos: number
) {
  if (!Number.isInteger(minutos) || minutos < TREINO_LIVRE_MIN_MINUTOS || minutos > TREINO_LIVRE_MAX_MINUTOS) {
    throw new Error(
      `escolha entre ${TREINO_LIVRE_MIN_MINUTOS} e ${TREINO_LIVRE_MAX_MINUTOS} minutos`
    );
  }

  const escrito = tema?.trim() || null;
  if (escrito && (escrito.length < TEMA_LIVRE_MIN_CHARS || escrito.length > TEMA_LIVRE_MAX_CHARS)) {
    throw new Error(
      `o tema precisa ter de ${TEMA_LIVRE_MIN_CHARS} a ${TEMA_LIVRE_MAX_CHARS} caracteres`
    );
  }

  const supabase = await supabaseUser();
  const { data: matchId, error } = await supabase.rpc("iniciar_partida", {
    p_tema_livre: escrito,
    p_theme_id: escrito ? null : themeId,
    p_minutes: minutos,
  });

  if (error) throw new Error(error.message);

  redirect(`/match/${matchId}`);
}

/**
 * Pausa e retomada — treino livre e só.
 *
 * A recusa mora em pausar_partida(), no Postgres. Valendo XP, parar o relógio é
 * inflar o bônus de velocidade diretamente: esconder o botão não impediria o
 * POST, então a regra não pode viver na tela.
 *
 * Nenhuma das duas recebe timestamp. Quem marca o instante da pausa e quem
 * empurra o deadline é o banco, com o relógio do banco — a mesma razão pela
 * qual iniciar_partida não aceita `started_at`.
 */
export async function pauseMatch(matchId: string) {
  const supabase = await supabaseUser();
  const { error } = await supabase.rpc("pausar_partida", { p_match_id: matchId });
  if (error) throw new Error(error.message);
  revalidatePath(`/match/${matchId}`);
}

export async function resumeMatch(matchId: string) {
  const supabase = await supabaseUser();
  const { error } = await supabase.rpc("retomar_partida", { p_match_id: matchId });
  if (error) throw new Error(error.message);
  revalidatePath(`/match/${matchId}`);
}

// ==========================================================================
// Envio da redação (PRD 4.4)
// ==========================================================================

const BUCKET = "essays";
const MAX_PHOTOS = 3;

/**
 * Devolve URLs de upload assinadas, uma por foto.
 *
 * O navegador manda o arquivo DIRETO para o Storage — não passa pelo servidor
 * Next. Duas razões: o corpo de uma Server Action tem limite baixo, e latência
 * de upload em 4G não deve competir com o cronômetro.
 *
 * A URL assinada carrega o token na própria query string, então o navegador
 * não precisa de nenhuma chave do Supabase.
 */
export async function createUploadSlots(matchId: string, count: number) {
  if (count < 1 || count > MAX_PHOTOS) {
    throw new Error(`envie de 1 a ${MAX_PHOTOS} fotos`);
  }

  const user = await requireUser();
  const userId = user.id;
  const supabase = await supabaseUser();

  // RLS já limita a linha ao próprio usuário; o filtro explícito mantém o erro
  // legível ("partida não encontrada") em vez de um resultado vazio silencioso.
  const { data: match, error } = await supabase
    .from("matches")
    .select("id, status")
    .eq("id", matchId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!match) throw new Error("partida não encontrada");
  if (match.status !== "in_progress") {
    throw new Error(`partida não está em andamento (status: ${match.status})`);
  }

  const slots = [];
  for (let i = 0; i < count; i++) {
    const path = `${userId}/${matchId}/${Date.now()}-${i}.jpg`;
    // Emitir URL assinada exige service_role: é a operação que o usuário não
    // pode fazer sozinho. A partida já foi confirmada como dele acima.
    const { data, error: signError } = await requireAdmin()
      .storage.from(BUCKET)
      .createSignedUploadUrl(path);
    if (signError) throw new Error(signError.message);
    slots.push({ path: data.path, signedUrl: data.signedUrl });
  }
  return slots;
}

/**
 * Fecha o relógio.
 *
 * Toda a decisão sobre tempo acontece dentro de enviar_partida(), no Postgres:
 * o elapsed sai de now() - started_at com os dois valores do banco. O "acabou o
 * tempo" que o cliente mostra é cosmético — quem decide é esta chamada.
 */
export async function submitMatch(matchId: string, imagePaths: string[]) {
  const supabase = await supabaseUser();
  const { data, error } = await supabase.rpc("enviar_partida", {
    p_match_id: matchId,
    p_image_paths: imagePaths,
  });

  if (error) throw new Error(error.message);

  const row = Array.isArray(data) ? data[0] : data;
  return {
    status: row.status as string,
    elapsedSeconds: row.elapsed_seconds as number,
    late: row.late as boolean,
  };
}

/**
 * Envio de redação digitada.
 *
 * Fecha o relógio pela MESMA função do Postgres que o modo foto: a decisão
 * sobre tempo não pode existir em dois lugares. A diferença é só o payload.
 *
 * Sem transcrição a fazer, a correção pula a etapa de visão inteira.
 */
export async function submitTypedMatch(
  matchId: string,
  text: string,
  pasteFlagged = false
) {
  const trimmed = text.trim();
  if (trimmed.length < 200) {
    throw new Error("texto muito curto para uma redação dissertativo-argumentativa");
  }
  if (trimmed.length > 20000) {
    throw new Error("texto acima do limite");
  }

  const supabase = await supabaseUser();
  const { data, error } = await supabase.rpc("enviar_partida", {
    p_match_id: matchId,
    p_transcript: trimmed,
  });

  if (error) throw new Error(error.message);

  // Colagem de bloco grande não bloqueia — é contornável e punir engano seria
  // punir a coisa errada. Fica registrado para inspeção, como o código da folha.
  if (pasteFlagged) {
    await supabase.from("matches").update({ flagged: true }).eq("id", matchId);
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    status: row.status as string,
    elapsedSeconds: row.elapsed_seconds as number,
    late: row.late as boolean,
  };
}


// ==========================================================================
// Correção (PRD 6.2–6.5)
// ==========================================================================

/** Leitura barata para o cliente fazer polling. */
export async function getMatchStatus(matchId: string) {
  const supabase = await supabaseUser();
  const { data, error } = await supabase
    .from("matches")
    .select("status, deadline, submitted_at, paused_at, xp_final")
    .eq("id", matchId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("partida não encontrada");

  return {
    status: effectiveStatus({
      status: data.status as MatchStatus,
      deadline: data.deadline,
      submitted_at: data.submitted_at,
      paused_at: data.paused_at,
    }),
    xpFinal: data.xp_final as number | null,
  };
}

async function downloadImages(paths: string[]) {
  const admin = requireAdmin(); // Storage privado: leitura só com service_role.
  return Promise.all(
    paths.map(async (path) => {
      const { data, error } = await admin.storage.from(BUCKET).download(path);
      if (error) throw new Error(`falha ao ler ${path}: ${error.message}`);
      const buf = Buffer.from(await data.arrayBuffer());
      return { mimeType: data.type || "image/jpeg", base64: buf.toString("base64") };
    })
  );
}

/**
 * Corrige a partida: transcrição, depois avaliação, depois aritmética.
 *
 * Não recebe redirect nem lança para a UI: quem navega é o polling do cliente,
 * que lê o status. Correção real leva 30–60s e a UI não pode ficar presa numa
 * única promessa.
 *
 * Idempotente por status: só age em 'grading'.
 */
/**
 * Etapa que a chamada executou. O cliente usa para saber se precisa chamar de
 * novo.
 */
export type EtapaCorrecao =
  | "transcricao"   // leu a foto; falta avaliar
  | "avaliacao"     // avaliou e fechou a nota
  | "reenvio"       // foto ilegível, parou aqui
  | "ignorado";     // partida não está em estado de correção

/**
 * Corrige a partida em DUAS requisições, uma etapa por chamada.
 *
 * Transcrição e avaliação somadas passam de 60 s com frequência, e função
 * serverless tem teto — na Vercel Hobby são 60 s. Uma requisição por etapa cabe
 * folgada em qualquer plano.
 *
 * O ganho não é só de prazo: se a avaliação falhar, a transcrição já está
 * gravada e não é refeita. Não se paga a leitura da foto duas vezes.
 *
 * Redação digitada já chega com transcript preenchido, então resolve numa
 * chamada só.
 */
export async function gradeMatch(matchId: string): Promise<EtapaCorrecao> {
  // A partida é confirmada como do usuário da sessão ANTES de qualquer escrita.
  // Daí em diante o pipeline usa service_role: ele lê o Storage privado e grava
  // corrections, coisas que o usuário não pode fazer sozinho.
  const user = await requireUser();
  const userId = user.id;
  const supabase = requireAdmin();

  const { data: match, error } = await supabase
    .from("matches")
    .select(
      "id, status, elapsed_seconds, duration_seconds, is_replay, is_free, difficulty, anti_replay_code, themes(title, statement, supporting_texts)"
    )
    .eq("id", matchId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!match) throw new Error("partida não encontrada");
  // grading_failed entra: é o caminho do "tentar de novo" na tela.
  if (!["grading", "expired", "grading_failed"].includes(match.status)) return "ignorado";

  const { data: submission } = await supabase
    .from("submissions")
    .select("image_paths, transcript, source, vision_meta")
    .eq("match_id", matchId)
    .maybeSingle();

  if (!submission) throw new Error("nenhuma redação enviada");

  const theme = match.themes as unknown as {
    title: string;
    statement: string;
    supporting_texts: { source?: string; content?: string }[];
  };

  // Conteúdo das dicas que o aluno abriu. Sem isso o avaliador não consegue
  // distinguir repertório próprio de repertório vindo da plataforma — e a
  // trava da C2 classificaria tudo como "só dos motivadores".
  // Leitura com service_role: hints tem RLS sem política de leitura.
  const { data: dicasAbertas } = await supabase
    .from("match_hints")
    .select("hints(content)")
    .eq("match_id", matchId);

  const openedHints = (dicasAbertas ?? [])
    .map((d) => (d.hints as unknown as { content: string } | null)?.content)
    .filter((c): c is string => Boolean(c));

  const digitada = submission.source === "typed";

  try {
    // ================= ETAPA 1: transcrição =================
    //
    // Só roda se ainda não houver transcrição. A contestação (disputeTranscript)
    // limpa o campo justamente para forçar a releitura.
    if (!submission.transcript) {
      if (digitada) throw new Error("texto digitado ausente");

      const images = await downloadImages(submission.image_paths);
      const { parsed: tr, usage } = await transcribe(images, match.anti_replay_code);

      await supabase
        .from("submissions")
        .update({
          transcript: tr.transcription,
          legibility: tr.legibility,
          vision_model: VISION_MODEL,
          // O que a etapa 2 vai precisar e não sobrevive ao fim da requisição.
          vision_meta: {
            illegibleCount: tr.illegibleCount,
            antiReplayCodeFound: tr.antiReplayCodeFound,
            inTokens: usage.inTokens,
            outTokens: usage.outTokens,
          },
        })
        .eq("match_id", matchId);

      // Foto ruim volta para reenvio SEM gastar a avaliação e sem consumir a
      // partida. O relógio já parou, então o usuário refotografa em paz.
      if (!tr.looksLikeEssay || tr.legibility < LEGIBILITY_GATE) {
        await supabase
          .from("matches")
          .update({ status: "needs_reupload" })
          .eq("id", matchId);
        return "reenvio";
      }

      // Código ausente na folha não bloqueia: falso positivo (código apagado,
      // foto cortada) não pode custar a partida de quem escreveu de verdade.
      if (!tr.antiReplayCodeFound) {
        await supabase.from("matches").update({ flagged: true }).eq("id", matchId);
      }

      // Encerra a requisição aqui. O cliente chama de novo para a avaliação.
      return "transcricao";
    }

    // ================= ETAPA 2: avaliação =================
    const transcript = submission.transcript;
    const meta = (submission.vision_meta ?? {}) as {
      illegibleCount?: number;
      antiReplayCodeFound?: boolean;
      inTokens?: number;
      outTokens?: number;
    };
    const trUsage = { inTokens: meta.inTokens ?? 0, outTokens: meta.outTokens ?? 0 };
    const illegibleCount = meta.illegibleCount ?? 0;
    const antiReplayCodeFound = meta.antiReplayCodeFound ?? true;

    const { parsed: ev, usage: evUsage } = await evaluate({
      themeTitle: theme.title,
      themeStatement: theme.statement,
      supportingTexts: theme.supporting_texts ?? [],
      openedHints,
      transcript,
    });

    // ---- Aritmética, em código ------------------------------------------
    const scores = finalScores(ev);
    const rawScore = scores.c1 + scores.c2 + scores.c3 + scores.c4 + scores.c5;
    // Do tempo gravado, não do status: status é sobrescrito por retry.
    const expired = isLate(match);

    // Soma dos snapshots em match_hints — nunca o preço atual da dica, que
    // pode ter sido rebalanceado depois da partida.
    const { data: penalidade } = await supabase.rpc("penalidade_dicas", {
      p_match_id: matchId,
    });

    // Multiplicador lido da tabela no momento da correção. xp_final é gravado
    // uma vez, então rebalancear depois não reescreve partidas antigas.
    const { data: dif } = await supabase
      .from("difficulties")
      .select("xp_multiplier")
      .eq("id", match.difficulty ?? "padrao")
      .maybeSingle();

    const xp = computeXp({
      rawScore,
      hintPenalty: (penalidade as number | null) ?? 0,
      difficultyMultiplier: Number(dif?.xp_multiplier ?? 1),
      elapsedSeconds: match.elapsed_seconds ?? match.duration_seconds,
      durationSeconds: match.duration_seconds,
      expired,
      isReplay: match.is_replay,
      // A correção do treino livre é igual à das outras — mesma rubrica, mesmo
      // modelo, mesmos tetos. O que muda é só o que ela paga.
      isFree: match.is_free,
    });

    const { data: last } = await supabase
      .from("corrections")
      .select("attempt")
      .eq("match_id", matchId)
      .order("attempt", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error: corrError } = await supabase.from("corrections").insert({
      match_id: matchId,
      attempt: (last?.attempt ?? 0) + 1,
      c1: scores.c1, c2: scores.c2, c3: scores.c3, c4: scores.c4, c5: scores.c5,
      feedback: {
        competencies: ev.competencies,
        c1: ev.c1,
        c2: ev.c2,
        c3: ev.c3,
        c5: ev.c5,
        // Por que cada teto baixou a nota. É o que vira feedback acionável na
        // tela — sem isso o aluno vê 120 e não sabe o que fez.
        ceilings: scores.ceilings,
        escapesTheme: ev.escapesTheme,
        isDisconnected: ev.isDisconnected,
        zeroed: scores.zeroed,
        generalFeedback: ev.generalFeedback,
        topPriority: ev.topPriority,
        source: submission.source,
        illegibleCount,
        antiReplayCodeFound,
      },
      rubric_version: RUBRIC_VERSION,
      model: digitada ? EVAL_MODEL : `${VISION_MODEL}+${EVAL_MODEL}`,
      tokens_in: trUsage.inTokens + evUsage.inTokens,
      tokens_out: trUsage.outTokens + evUsage.outTokens,
    });

    if (corrError) throw new Error(corrError.message);

    await supabase
      .from("matches")
      .update({
        // Partida expirada continua expired: corrige para dar feedback, mas o
        // status precisa registrar que passou do prazo.
        status: expired ? "expired" : "graded",
        raw_score: rawScore,
        hint_penalty: xp.penalty,
        speed_bonus: xp.speedBonus,
        xp_final: xp.xpFinal,
        scoring_version: xp.scoringVersion,
      })
      .eq("id", matchId);

    return "avaliacao";
  } catch (e) {
    // Falha marcada no banco, não engolida: o usuário vê "reprocessando" em vez
    // de uma partida presa em grading para sempre.
    await supabase
      .from("matches")
      .update({ status: "grading_failed" })
      .eq("id", matchId);
    throw e;
  }
}

/**
 * Contestação da transcrição (PRD 6.6).
 *
 * Sem edição manual do texto: liberar edição livre seria liberar corrigir a
 * ortografia e inflar a Competência 1. Reprocessa a transcrição uma vez.
 */
export async function disputeTranscript(matchId: string) {
  const supabase = await supabaseUser();

  const { data: submission } = await supabase
    .from("submissions")
    .select("disputed")
    .eq("match_id", matchId)
    .maybeSingle();

  if (!submission) throw new Error("nenhuma submissão para contestar");
  if (submission.disputed) throw new Error("esta transcrição já foi contestada uma vez");

  // Limpar transcript e vision_meta é o que força a etapa 1 a rodar de novo.
  // Sem isso, a divisão em duas requisições faria a contestação pular direto
  // para a avaliação e reavaliar exatamente o mesmo texto contestado.
  await supabase
    .from("submissions")
    .update({ disputed: true, transcript: null, vision_meta: null, legibility: null })
    .eq("match_id", matchId);

  const { error } = await supabase
    .from("matches")
    .update({ status: "grading" })
    .eq("id", matchId);

  if (error) throw new Error(error.message);
}

// ==========================================================================
// Dicas (PRD 4.7)
// ==========================================================================

export type Hint = {
  id: string;
  kind: "repertorio" | "tese" | "estrutura";
  cost_xp: number;
  order_index: number;
  opened: boolean;
  content: string | null; // null enquanto não aberta — nunca chega ao cliente
};

/**
 * Lista as dicas da partida: metadados sempre, conteúdo só das já abertas.
 *
 * A função no Postgres é que decide isso. Não existe consulta daqui que traga
 * o texto de uma dica fechada, porque a tabela hints tem RLS ligada e nenhuma
 * política de leitura — nem anon nem authenticated alcançam.
 */
export async function listHints(matchId: string): Promise<Hint[]> {
  const supabase = await supabaseUser();
  const { data, error } = await supabase.rpc("dicas_da_partida", {
    p_match_id: matchId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as Hint[];
}

/**
 * Abre uma dica: grava o log e devolve o conteúdo, na mesma transação.
 *
 * A penalidade NÃO é aplicada aqui. Ela é somada no fechamento, a partir de
 * match_hints. Uma aritmética, num lugar só.
 */
export async function openHint(hintId: string): Promise<string> {
  const supabase = await supabaseUser();
  const { data, error } = await supabase.rpc("abrir_dica", { p_hint_id: hintId });
  if (error) throw new Error(error.message);
  return data as string;
}
