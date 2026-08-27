import { listarAmigos, listarDuelos } from "@/app/duel-actions";
import { listDifficulties } from "@/app/actions";
import { supabaseUser } from "@/lib/supabase";
import Amigos from "./Amigos";
import ListaDuelos from "./ListaDuelos";

export const dynamic = "force-dynamic";

export default async function DuelosPage() {
  const supabase = await supabaseUser();

  const [amigos, duelos, dificuldades, { data: profile }] = await Promise.all([
    listarAmigos(),
    listarDuelos(),
    listDifficulties(),
    supabase.from("profiles").select("friend_code").maybeSingle(),
  ]);

  return (
    <main className="mx-auto max-w-2xl space-y-10 px-5 py-10">
      <header>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Duelos</h1>
        <p className="mt-1 text-sm leading-relaxed text-zinc-500">
          Mesmo tema, mesmo tempo, cada um na sua hora. Vence quem fizer mais XP.
        </p>
      </header>

      <Amigos
        amigos={amigos}
        meuCodigo={profile?.friend_code ?? "······"}
        dificuldades={dificuldades}
      />

      <section className="space-y-3">
        <h2 className="font-display text-xl font-bold">Seus duelos</h2>
        <ListaDuelos duelos={duelos} />
      </section>

      <p className="text-xs leading-relaxed text-zinc-600">
        O tema do duelo é sempre inédito para os dois — sortear um que o
        adversário já escreveu daria vantagem de repertório e estragaria a
        comparação. Duelo não jogado expira em 7 dias.
      </p>
    </main>
  );
}
