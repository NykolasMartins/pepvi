import { NIVEIS, type ProgressoNivel } from "@/lib/levels";

/**
 * Nível e o caminho até o próximo.
 *
 * O XP existia e não fazia nada — era um número que subia. O nível dá a ele um
 * destino visível, sem criar economia: nada se gasta, então ninguém fica sem
 * poder pagar por uma dica de que precisa.
 */
export default function BarraNivel({
  nivel,
  xpTotal,
}: {
  nivel: ProgressoNivel;
  xpTotal: number;
}) {
  const pct = Math.round(nivel.fracao * 100);

  return (
    <section className="space-y-4 rounded-lg border border-zinc-800 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">
            Nível {nivel.atual.numero}
          </p>
          <p className="text-2xl font-black tracking-tight text-emerald-400">
            {nivel.atual.nome}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-bold tabular-nums">
            {xpTotal.toLocaleString("pt-BR")}
          </p>
          <p className="text-xs text-zinc-500">XP acumulado</p>
        </div>
      </div>

      <div>
        <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          {nivel.proximo ? (
            <>
              faltam{" "}
              <strong className="text-zinc-300">
                {nivel.xpParaProximo!.toLocaleString("pt-BR")} XP
              </strong>{" "}
              para <strong className="text-zinc-300">{nivel.proximo.nome}</strong>
              {" — cerca de "}
              {Math.max(1, Math.ceil(nivel.xpParaProximo! / 800))} partida
              {Math.ceil(nivel.xpParaProximo! / 800) === 1 ? "" : "s"} boa
              {Math.ceil(nivel.xpParaProximo! / 800) === 1 ? "" : "s"}
            </>
          ) : (
            "nível máximo alcançado"
          )}
        </p>
      </div>

      <ol className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {NIVEIS.map((n) => (
          <li
            key={n.numero}
            className={
              n.numero < nivel.atual.numero
                ? "text-zinc-600 line-through"
                : n.numero === nivel.atual.numero
                  ? "font-semibold text-emerald-400"
                  : "text-zinc-600"
            }
          >
            {n.nome}
          </li>
        ))}
      </ol>
    </section>
  );
}
