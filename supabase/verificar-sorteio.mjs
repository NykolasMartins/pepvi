/**
 * Verifica que sortear_tema() é realmente aleatório e nunca repete tema.
 *
 *   node supabase/verificar-sorteio.mjs
 *
 * Dois testes:
 *  1) DISTRIBUIÇÃO — chama o sorteio N vezes com usuários novos (histórico
 *     vazio) e mede quantas vezes cada tema saiu. Uniforme = aleatório.
 *  2) SEM REPETIÇÃO — simula um usuário jogando todos os temas em sequência e
 *     confirma que nenhum sai duas vezes antes de o pool esgotar.
 *
 * Usa service_role: precisa ignorar RLS para simular usuários que não existem.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import crypto from "node:crypto";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const N = Number(process.argv[2] ?? 300);

const { data: temas, error: e1 } = await db
  .from("themes").select("id, title").eq("active", true);
if (e1) { console.error(e1.message); process.exit(1); }

const titulo = new Map(temas.map((t) => [t.id, t.title]));
console.log(`${temas.length} temas ativos · ${N} sorteios\n`);

// ---- 1) distribuição -----------------------------------------------------
const contagem = new Map();
for (let i = 0; i < N; i++) {
  // Usuário novo a cada chamada: histórico vazio, todos os temas elegíveis.
  const { data, error } = await db.rpc("sortear_tema", { p_user_id: crypto.randomUUID() });
  if (error) { console.error(`sorteio ${i}: ${error.message}`); process.exit(1); }
  const row = Array.isArray(data) ? data[0] : data;
  contagem.set(row.theme_id, (contagem.get(row.theme_id) ?? 0) + 1);
}

const esperado = N / temas.length;
const vistos = [...contagem.entries()].sort((a, b) => b[1] - a[1]);

console.log("DISTRIBUIÇÃO");
for (const [id, n] of vistos) {
  const barra = "█".repeat(Math.round((n / Math.max(...contagem.values())) * 24));
  console.log(`  ${String(n).padStart(4)}  ${barra.padEnd(25)} ${titulo.get(id)?.slice(0, 48)}`);
}

const nuncaSaiu = temas.filter((t) => !contagem.has(t.id));
const desvio = Math.sqrt(
  temas.reduce((s, t) => s + ((contagem.get(t.id) ?? 0) - esperado) ** 2, 0) / temas.length
);

console.log(`\n  esperado por tema: ${esperado.toFixed(1)}`);
console.log(`  desvio-padrão:     ${desvio.toFixed(1)}  (aleatório uniforme fica perto de ${Math.sqrt(esperado).toFixed(1)})`);
console.log(`  temas que nunca saíram: ${nuncaSaiu.length}`);
if (nuncaSaiu.length) for (const t of nuncaSaiu) console.log(`    - ${t.title}`);

// ---- 2) sem repetição ----------------------------------------------------
// Não dá para simular sem gravar partidas, então faço a checagem inversa:
// confirmo que a consulta exclui o que já foi jogado, usando um usuário real
// que tenha histórico.
const { data: comHistorico } = await db
  .from("matches")
  .select("user_id, theme_id")
  .neq("status", "cancelled");

console.log("\nSEM REPETIÇÃO");
if (!comHistorico?.length) {
  console.log("  nenhuma partida jogada ainda — nada a excluir. Teste depois de jogar.");
} else {
  const porUsuario = new Map();
  for (const m of comHistorico) {
    if (!porUsuario.has(m.user_id)) porUsuario.set(m.user_id, new Set());
    porUsuario.get(m.user_id).add(m.theme_id);
  }
  let falhas = 0;
  for (const [userId, jogados] of porUsuario) {
    for (let i = 0; i < 40; i++) {
      const { data } = await db.rpc("sortear_tema", { p_user_id: userId });
      const row = Array.isArray(data) ? data[0] : data;
      if (!row.is_replay && jogados.has(row.theme_id)) {
        console.log(`  FALHA: tema já jogado sorteado de novo (${titulo.get(row.theme_id)})`);
        falhas++;
        break;
      }
    }
    const restam = temas.length - jogados.size;
    console.log(`  usuário ${userId.slice(0, 8)}: ${jogados.size} jogados, ${restam} inéditos — 40 sorteios sem repetir: ${falhas ? "NÃO" : "OK"}`);
  }
}

const uniforme = nuncaSaiu.length === 0 && desvio < Math.sqrt(esperado) * 2.5;
console.log(`\n${uniforme ? "OK" : "SUSPEITO"}: sorteio ${uniforme ? "uniforme" : "com viés — investigar"}`);
