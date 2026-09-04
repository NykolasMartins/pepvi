import type { ReactNode } from "react";

/**
 * Peças de painel, compartilhadas pelas abas.
 *
 * SVG inline, sem biblioteca de gráfico: a convenção do projeto é não instalar
 * dependência sem motivo medido, e barra e sparkline são dez linhas de SVG.
 */

export function Secao({
  titulo,
  nota,
  children,
}: {
  titulo: string;
  nota?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          {titulo}
        </h2>
        {nota && <p className="mt-1 text-xs text-zinc-600">{nota}</p>}
      </div>
      {children}
    </section>
  );
}

export function Metrica({
  rotulo,
  valor,
  sufixo,
  nota,
  tom = "neutro",
}: {
  rotulo: string;
  valor: string | number;
  sufixo?: string;
  nota?: string;
  /** `alerta` e `ruim` existem para o número que exige ação saltar da grade. */
  tom?: "neutro" | "bom" | "alerta" | "ruim";
}) {
  const cor = {
    neutro: "text-zinc-100",
    bom: "text-emerald-400",
    alerta: "text-amber-400",
    ruim: "text-red-400",
  }[tom];

  return (
    <div className="rounded-xl border border-borda/60 bg-superficie/50 p-4">
      <p className="text-xs text-zinc-500">{rotulo}</p>
      <p className={`tabular mt-1 font-mono text-2xl font-bold ${cor}`}>
        {typeof valor === "number" ? valor.toLocaleString("pt-BR") : valor}
        {sufixo && <span className="ml-1 text-sm text-zinc-600">{sufixo}</span>}
      </p>
      {nota && <p className="mt-1 text-xs leading-relaxed text-zinc-600">{nota}</p>}
    </div>
  );
}

export function Grade({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>;
}

/** Barra horizontal proporcional ao maior valor da lista. */
export function BarraH({
  itens,
  formato = (n: number) => n.toLocaleString("pt-BR"),
}: {
  itens: { rotulo: string; valor: number; destaque?: boolean }[];
  formato?: (n: number) => string;
}) {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <ul className="space-y-2">
      {itens.map((i) => (
        <li key={i.rotulo} className="space-y-1">
          <div className="flex justify-between gap-3 text-xs">
            <span className={i.destaque ? "text-emerald-300" : "text-zinc-400"}>
              {i.rotulo}
            </span>
            <span className="tabular shrink-0 font-mono text-zinc-500">
              {formato(i.valor)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className={`h-full rounded-full ${i.destaque ? "bg-emerald-500" : "bg-zinc-600"}`}
              style={{ width: `${(i.valor / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Tabela com rolagem horizontal própria — a página nunca rola de lado. */
export function Tabela({
  colunas,
  children,
}: {
  colunas: string[];
  children: ReactNode;
}) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-left">
            {colunas.map((c) => (
              <th
                key={c}
                className="whitespace-nowrap px-3 py-2 text-xs font-medium uppercase tracking-wider text-zinc-500"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-900">{children}</tbody>
      </table>
    </div>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
      {children}
    </p>
  );
}

/** Série temporal como sparkline. Uma linha de dados, sem eixo — é tendência. */
export function Sparkline({
  valores,
  rotulos,
}: {
  valores: number[];
  rotulos: string[];
}) {
  if (valores.length < 2) return null;
  const W = 600, H = 90, P = 4;
  const max = Math.max(1, ...valores);
  const pontos = valores.map((v, i) => {
    const x = P + (i / (valores.length - 1)) * (W - 2 * P);
    const y = H - P - (v / max) * (H - 2 * P);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <div className="space-y-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Série de ${valores.length} dias, máximo ${max}`}
      >
        <polyline
          points={pontos.join(" ")}
          fill="none"
          stroke="rgb(16 185 129)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {valores.map((v, i) => {
          const [x, y] = pontos[i].split(",");
          return <circle key={i} cx={x} cy={y} r="2.5" fill="rgb(16 185 129)" />;
        })}
      </svg>
      <div className="flex justify-between text-xs text-zinc-600">
        <span>{rotulos[0]}</span>
        <span className="font-mono">pico {max.toLocaleString("pt-BR")}</span>
        <span>{rotulos[rotulos.length - 1]}</span>
      </div>
    </div>
  );
}
