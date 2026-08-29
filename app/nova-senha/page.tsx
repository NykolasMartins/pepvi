"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { definirNovaSenha, type AuthState } from "@/app/auth-actions";

/**
 * Tela de definir a senha nova.
 *
 * Chega-se aqui já com sessão: /auth/confirm trocou o code do e-mail por
 * cookie antes de redirecionar. Por isso o formulário não pede e-mail nem
 * token — quem é o dono da troca já está decidido no servidor.
 */
function Enviar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-emerald-500 px-6 py-3 font-bold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "…" : "SALVAR SENHA"}
    </button>
  );
}

export default function NovaSenhaPage() {
  const [state, formAction] = useActionState<AuthState, FormData>(
    definirNovaSenha,
    null
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-8 px-6 py-16">
      <div>
        <h1 className="font-display text-4xl font-extrabold tracking-tight">
          Nova senha
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Escolha uma senha de pelo menos 6 caracteres.
        </p>
      </div>

      <form action={formAction} className="space-y-3">
        <label className="block">
          <span className="text-xs text-zinc-500">Senha nova</span>
          <input
            name="password"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm outline-none focus:border-zinc-600"
          />
        </label>

        <label className="block">
          <span className="text-xs text-zinc-500">Repita a senha</span>
          <input
            name="confirmacao"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm outline-none focus:border-zinc-600"
          />
        </label>

        {state?.error && (
          <p className="rounded-md bg-amber-950/50 p-3 text-xs leading-relaxed text-amber-300">
            {state.error}
          </p>
        )}

        <Enviar />
      </form>
    </main>
  );
}
