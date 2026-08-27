"use client";

import { useState } from "react";

const COMPETENCIAS = [
  { curto: "C1", nome: "Norma culta" },
  { curto: "C2", nome: "Proposta e repertório" },
  { curto: "C3", nome: "Argumentação" },
  { curto: "C4", nome: "Coesão" },
  { curto: "C5", nome: "Intervenção" },
];

const MAX = 200;
const NIVEIS_ANEL = [40, 80, 120, 160, 200];

function corDaNota(n: number) {
  if (n >= 160) return "bg-emerald-500";
  if (n >= 120) return "bg-lime-500";
  if (n >= 80) return "bg-amber-500";
  return "bg-red-500";
}

export default function CompetenciasChart({
  medias,
  tendencias,
  maisFraca,
  minPartidasParaTendencia,
}: {
  medias: number[];
  tendencias: number[] | null;
  maisFraca: number | null;
  minPartidasParaTendencia: number;
}) {
  const [modo, setModo] = useState<"barras" | "pentagono">("barras");

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Média por competência
        </h2>

        <div role="tablist" aria-label="Formato do gráfico" className="flex gap-1 rounded-lg bg-zinc-900 p-1">
          {(
            [
              ["barras", "Barras"],
              ["pentagono", "Pentágono"],
            ] as const
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              role="tab"
              aria-selected={modo === valor}
              onClick={() => setModo(valor)}
              className={`rounded-md px-3 py-2 text-xs font-medium transition ${
                modo === valor
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      {tendencias === null && (
        <p className="text-xs text-zinc-600">
          tendência a partir de {minPartidasParaTendencia} partidas
        </p>
      )}

      {modo === "barras" ? (
        <Barras medias={medias} tendencias={tendencias} maisFraca={maisFraca} />
      ) : (
        <Pentagono medias={medias} maisFraca={maisFraca} />
      )}

      <p className="text-xs leading-relaxed text-zinc-600">
        A competência mais fraca é onde 40 pontos são mais fáceis de ganhar que
        nas outras. Treinar a mais forte rende menos.
      </p>
    </section>
  );
}

function Barras({
  medias,
  tendencias,
  maisFraca,
}: {
  medias: number[];
  tendencias: number[] | null;
  maisFraca: number | null;
}) {
  return (
    <div className="space-y-4">
      {COMPETENCIAS.map((c, i) => {
        const val = medias[i];
        const delta = tendencias?.[i];
        const fraca = maisFraca === i;
        return (
          <div key={c.curto} className="space-y-1">
            <div className="flex items-baseline justify-between text-sm">
              <span className={fraca ? "text-amber-300" : "text-zinc-300"}>
                <span className="text-zinc-600">{c.curto}</span> {c.nome}
                {fraca && (
                  <span className="ml-2 rounded bg-amber-950 px-2 py-0.5 text-xs text-amber-400">
                    mais fraca
                  </span>
                )}
              </span>
              <span className="flex items-baseline gap-2 font-mono">
                {delta !== undefined && delta !== 0 && (
                  <span className={`text-xs ${delta > 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {delta > 0 ? "+" : ""}
                    {delta}
                  </span>
                )}
                <span className="font-semibold">{Math.round(val)}</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
              <div
                className={`h-full rounded-full ${corDaNota(val)}`}
                style={{ width: `${(val / MAX) * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Pentágono das 5 competências.
 *
 * SVG puro. Um radar chart de biblioteca custaria dezenas de kB no bundle para
 * desenhar dois polígonos e cinco linhas.
 *
 * O eixo vai de 0 a 200 partindo do topo, no sentido horário, seguindo a ordem
 * C1..C5 — a mesma das barras, para que alternar não reordene nada.
 */
function Pentagono({ medias, maisFraca }: { medias: number[]; maisFraca: number | null }) {
  const TAM = 320;
  const centro = TAM / 2;
  const raio = 110;

  // -90° põe C1 no topo; 72° entre eixos.
  const angulo = (i: number) => ((i * 72 - 90) * Math.PI) / 180;
  const ponto = (i: number, valor: number) => {
    const r = (Math.max(0, Math.min(MAX, valor)) / MAX) * raio;
    return [centro + r * Math.cos(angulo(i)), centro + r * Math.sin(angulo(i))] as const;
  };
  const poligono = (valores: number[]) =>
    valores.map((v, i) => ponto(i, v).join(",")).join(" ");

  const media = medias.reduce((a, b) => a + b, 0) / medias.length;

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg bg-zinc-900 p-4 sm:flex-row sm:justify-center sm:gap-8">
      <svg
        viewBox={`0 0 ${TAM} ${TAM}`}
        className="h-auto w-full max-w-[320px]"
        role="img"
        aria-label={
          "Pentágono das competências: " +
          COMPETENCIAS.map((c, i) => `${c.curto} ${Math.round(medias[i])}`).join(", ")
        }
      >
        {/* anéis de referência */}
        {NIVEIS_ANEL.map((nivel) => (
          <polygon
            key={nivel}
            points={poligono(COMPETENCIAS.map(() => nivel))}
            fill="none"
            stroke="#27272a"
            strokeWidth="1"
          />
        ))}

        {/* eixos */}
        {COMPETENCIAS.map((_, i) => {
          const [x, y] = ponto(i, MAX);
          return <line key={i} x1={centro} y1={centro} x2={x} y2={y} stroke="#27272a" strokeWidth="1" />;
        })}

        {/* área da média geral, como referência de equilíbrio */}
        <polygon
          points={poligono(COMPETENCIAS.map(() => media))}
          fill="none"
          stroke="#3f3f46"
          strokeWidth="1"
          strokeDasharray="4 4"
        />

        {/* desempenho */}
        <polygon
          points={poligono(medias)}
          fill="#34d399"
          fillOpacity="0.18"
          stroke="#34d399"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {COMPETENCIAS.map((c, i) => {
          const [x, y] = ponto(i, medias[i]);
          const fraca = maisFraca === i;
          return <circle key={c.curto} cx={x} cy={y} r={fraca ? 6 : 4} fill={fraca ? "#fbbf24" : "#34d399"} />;
        })}

        {/* rótulos, empurrados para fora do vértice */}
        {COMPETENCIAS.map((c, i) => {
          const [x, y] = ponto(i, MAX * 1.28);
          const fraca = maisFraca === i;
          return (
            <text
              key={c.curto}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="13"
              fontWeight="600"
              fill={fraca ? "#fbbf24" : "#a1a1aa"}
            >
              {c.curto}
              <tspan x={x} dy="14" fontSize="11" fontWeight="400" fill="#71717a">
                {Math.round(medias[i])}
              </tspan>
            </text>
          );
        })}
      </svg>

      <ul className="w-full space-y-1 text-xs sm:w-auto">
        {COMPETENCIAS.map((c, i) => (
          <li
            key={c.curto}
            className={`flex justify-between gap-6 ${maisFraca === i ? "text-amber-300" : "text-zinc-400"}`}
          >
            <span>
              <span className="text-zinc-600">{c.curto}</span> {c.nome}
            </span>
            <span className="font-mono font-semibold">{Math.round(medias[i])}</span>
          </li>
        ))}
        <li className="flex justify-between gap-6 border-t border-zinc-800 pt-1 text-zinc-500">
          <span>linha tracejada = sua média</span>
          <span className="font-mono">{Math.round(media)}</span>
        </li>
      </ul>
    </div>
  );
}
