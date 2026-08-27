"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Cronômetro puramente cosmético.
 *
 * O prazo é um instante ABSOLUTO vindo do banco, não um contador que o cliente
 * decrementa e guarda. Consequências:
 *  - F5 não zera nem estende: o servidor devolve o mesmo deadline.
 *  - Fechar a aba não pausa.
 *  - Mexer no relógio do sistema não ajuda: o offset é medido contra o
 *    servidor, e de todo modo quem valida o envio é o servidor.
 *
 * Nada de localStorage participa da regra.
 *
 * Nenhum Date.now() é chamado durante o render: iniciadores de useState rodam
 * no SSR também, então o servidor renderizaria um segundo e o cliente hidrataria
 * outro. Todo o tempo é medido no useEffect, que só roda no cliente.
 */
export default function Countdown({
  deadline,
  serverNow,
}: {
  deadline: string;
  serverNow: string;
}) {
  const router = useRouter();
  const deadlineMs = new Date(deadline).getTime();

  // Desvio entre o relógio do navegador e o do servidor, medido uma vez no
  // primeiro tick do cliente.
  const offset = useRef<number | null>(null);
  // null = ainda não montou. O servidor renderiza o placeholder.
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (offset.current === null) {
      offset.current = new Date(serverNow).getTime() - Date.now();
    }
    const tick = () =>
      setRemaining(deadlineMs - (Date.now() + (offset.current ?? 0)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [deadlineMs, serverNow]);

  useEffect(() => {
    // Timer de aba em segundo plano é estrangulado pelo navegador. Ao voltar,
    // ressincroniza contra o servidor em vez de confiar no setInterval.
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);

  // Placeholder estável: é o que o SSR emite e o que o cliente hidrata, byte a
  // byte igual. O relógio real aparece no primeiro tick do useEffect.
  if (remaining === null) {
    return (
      <div className="text-center">
        <div className="tabular font-display text-6xl font-extrabold text-zinc-700">
          --:--:--
        </div>
        <p className="mt-2 text-xs text-zinc-600">sincronizando…</p>
      </div>
    );
  }

  const expired = remaining <= 0;
  const totalSeconds = Math.max(0, Math.floor(remaining / 1000));
  const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");

  const color = expired
    ? "text-red-500"
    : totalSeconds < 300
      ? "text-red-400"
      : totalSeconds < 900
        ? "text-amber-400"
        : "text-emerald-400";

  return (
    <div className="text-center">
      <div className={`tabular font-display text-6xl font-extrabold ${color}`}>
        {hh}:{mm}:{ss}
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        {expired
          ? "Tempo esgotado — o envio não vale mais XP."
          : `Envie até ${new Date(deadlineMs).toLocaleTimeString("pt-BR")}`}
      </p>
    </div>
  );
}
