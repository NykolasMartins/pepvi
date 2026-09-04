import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOwner } from "@/lib/supabase";
import AbasAdmin from "./AbasAdmin";

export const dynamic = "force-dynamic";

/**
 * Guarda de TODO o /admin.
 *
 * Um layout, e não uma verificação por página: página nova nasce protegida sem
 * ninguém lembrar de nada. A checagem no middleware seria pior — custaria uma
 * consulta ao banco em toda requisição do site para proteger uma rota que quase
 * ninguém acessa.
 *
 * notFound() e não um 403: responder "proibido" confirma que a rota existe e
 * convida a insistir. Para quem não é admin, /admin simplesmente não existe.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let username: string;
  try {
    ({ username } = await requireOwner());
  } catch {
    notFound();
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">
            Administração
          </h1>
          <p className="mt-1 text-xs text-zinc-500">
            {username} · os números desta área cruzam todos os usuários
          </p>
        </div>
        <Link href="/" className="text-xs text-zinc-500 underline hover:text-zinc-300">
          voltar ao jogo
        </Link>
      </header>

      <AbasAdmin />

      <div className="mt-6">{children}</div>
    </main>
  );
}
