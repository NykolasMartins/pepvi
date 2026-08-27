/**
 * Peças de interface repetidas.
 *
 * Não é biblioteca de componentes: cada uma destas já existia copiada em dois
 * ou três arquivos. Extraí o que estava duplicado, não o que talvez venha a ser.
 */
import type { ReactNode } from "react";

export function Titulo({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
      {children}
    </h2>
  );
}

export function Card({
  rotulo,
  valor,
  sufixo,
  destaque = false,
}: {
  rotulo: string;
  valor: string | number;
  sufixo?: string;
  destaque?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        destaque
          ? "border-emerald-900/70 bg-emerald-950/20"
          : "border-borda/60 bg-superficie/60"
      }`}
    >
      <p className="text-xs text-zinc-500">{rotulo}</p>
      <p
        className={`tabular mt-1 font-mono text-2xl font-bold ${
          destaque ? "text-emerald-400" : "text-zinc-100"
        }`}
      >
        {valor}
        {sufixo && (
          <span className="ml-1 text-xs font-normal text-zinc-500">{sufixo}</span>
        )}
      </p>
    </div>
  );
}

export function Linha({
  rotulo,
  valor,
  apagado = false,
}: {
  rotulo: ReactNode;
  valor: string;
  apagado?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-4 ${apagado ? "text-zinc-600" : "text-zinc-300"}`}>
      <span>{rotulo}</span>
      <span className="tabular font-mono">{valor}</span>
    </div>
  );
}

export function Etiqueta({
  children,
  tom = "neutro",
}: {
  children: ReactNode;
  tom?: "neutro" | "bom" | "aviso" | "ruim";
}) {
  const tons = {
    neutro: "bg-zinc-800 text-zinc-400",
    bom: "bg-emerald-950 text-emerald-400",
    aviso: "bg-amber-950 text-amber-400",
    ruim: "bg-red-950 text-red-400",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs ${tons[tom]}`}>{children}</span>
  );
}

/** Cor por faixa de nota do ENEM. Um lugar só — usada em três telas. */
export function corDaNota(n: number) {
  if (n >= 160) return "bg-emerald-500";
  if (n >= 120) return "bg-lime-500";
  if (n >= 80) return "bg-amber-500";
  return "bg-red-500";
}

export function Barra({
  valor,
  maximo = 200,
  cor,
}: {
  valor: number;
  maximo?: number;
  cor?: string;
}) {
  const pct = Math.max(0, Math.min(100, (valor / maximo) * 100));
  return (
    <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
      <div
        className={`h-full rounded-full transition-all ${cor ?? corDaNota(valor)}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
