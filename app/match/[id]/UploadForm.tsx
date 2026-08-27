"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createUploadSlots, submitMatch } from "@/app/actions";

const MAX_PHOTOS = 3;
const MAX_EDGE = 1600; // lado maior, em px

type Stage = "idle" | "resizing" | "uploading" | "submitting";

/**
 * Reduz a foto para 1600px no lado maior antes de subir.
 *
 * Vale por dois motivos: corta 4 MB de 4G para uns 300 KB, e é o tamanho que a
 * etapa de visão da Fase 2 vai querer de todo modo — acima disso a API
 * redimensiona sozinha e cobra igual.
 */
async function downscale(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponível neste navegador");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.9)
  );
  if (!blob) throw new Error("falha ao processar a imagem");
  return blob;
}

export default function UploadForm({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);

  const busy = stage !== "idle";

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const picked = Array.from(e.target.files ?? []);
    if (picked.length > MAX_PHOTOS) {
      setError(`Máximo de ${MAX_PHOTOS} fotos.`);
      return;
    }
    setFiles(picked);
  }

  async function onSubmit() {
    setError(null);
    try {
      setStage("resizing");
      const blobs = await Promise.all(files.map(downscale));

      setStage("uploading");
      const slots = await createUploadSlots(matchId, blobs.length);

      // PUT direto no Storage. O token vem na query string da URL assinada, por
      // isso não há nenhuma chave do Supabase no navegador.
      await Promise.all(
        slots.map(async (slot, i) => {
          const body = new FormData();
          body.append("cacheControl", "3600");
          body.append("", blobs[i], `foto-${i + 1}.jpg`);
          const res = await fetch(slot.signedUrl, { method: "PUT", body });
          if (!res.ok) {
            throw new Error(`upload da foto ${i + 1} falhou (HTTP ${res.status})`);
          }
        })
      );

      // A partir daqui o relógio já não importa: o instante que conta é o do
      // submitMatch, e ele é decidido pelo Postgres.
      setStage("submitting");
      await submitMatch(
        matchId,
        slots.map((s) => s.path)
      );

      // Daqui em diante quem manda é o status no banco: a página re-renderiza
      // no estado "grading" e o componente Grading assume o acompanhamento.
      // Não esperamos a correção aqui — ela leva 30–60s.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage("idle");
    }
  }

  const label: Record<Stage, string> = {
    idle: "ENVIAR REDAÇÃO",
    resizing: "Preparando fotos…",
    uploading: "Enviando fotos…",
    submitting: "Parando o cronômetro…",
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        De 1 a {MAX_PHOTOS} fotos da folha. O upload em si não consome seu tempo.
      </p>

      <input
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        disabled={busy}
        onChange={onPick}
        className="block w-full text-sm text-zinc-400 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-4 file:py-2 file:text-sm file:font-medium file:text-zinc-100 disabled:opacity-50"
      />

      {files.length > 0 && (
        <ul className="space-y-1 text-xs text-zinc-500">
          {files.map((f) => (
            <li key={f.name}>
              {f.name} — {(f.size / 1048576).toFixed(1)} MB
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="rounded-md bg-amber-950/50 p-3 text-xs text-amber-300">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={busy || files.length === 0}
        className="w-full rounded-lg bg-emerald-500 px-6 py-3 font-bold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {label[stage]}
      </button>

    </div>
  );
}
