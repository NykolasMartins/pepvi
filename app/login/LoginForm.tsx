"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { authenticate, type AuthState } from "@/app/auth-actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-emerald-500 px-6 py-3 font-bold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "…" : label}
    </button>
  );
}

export default function LoginForm({ next, erro }: { next: string; erro?: string }) {
  const [modo, setModo] = useState<"entrar" | "criar" | "recuperar">("entrar");

  // Uma ação só, sempre a mesma. Passar `modo === "entrar" ? signIn : signUp`
  // para o useActionState parece natural e está errado: o hook guarda a função
  // do render em que criou o formAction, então trocar de aba não trocava a
  // ação. Quem clicava em "Criar conta" e voltava para "Entrar" continuava
  // enviando cadastro. O modo agora vai num campo do formulário.
  const [state, formAction] = useActionState<AuthState, FormData>(authenticate, null);

  const criando = modo === "criar";
  const recuperando = modo === "recuperar";

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Entrar ou criar conta" className="flex gap-1 rounded-lg bg-zinc-900 p-1">
        {(
          [
            ["entrar", "Entrar"],
            ["criar", "Criar conta"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={modo === value}
            onClick={() => setModo(value)}
            className={`flex-1 rounded-md px-4 py-3 text-sm font-medium transition ${
              modo === value
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        {/* O modo viaja com o envio: o servidor decide pelo que foi enviado,
            não por uma função que o cliente escolheu antes. */}
        <input type="hidden" name="modo" value={modo} />

        <label className="block">
          <span className="text-xs text-zinc-500">E-mail</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm outline-none focus:border-zinc-600"
          />
        </label>

        {/* Sem `required` renderizado no modo recuperar: o campo some do DOM,
            então não segura o envio de um formulário que não pede senha. */}
        {!recuperando && (
          <label className="block">
            <span className="text-xs text-zinc-500">Senha</span>
            <input
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete={criando ? "new-password" : "current-password"}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm outline-none focus:border-zinc-600"
            />
          </label>
        )}

        {(state?.error || erro) && (
          <p className="rounded-md bg-amber-950/50 p-3 text-xs leading-relaxed text-amber-300">
            {state?.error ?? "O link de recuperação é inválido ou já foi usado. Peça outro."}
          </p>
        )}

        <Submit
          label={
            recuperando ? "ENVIAR LINK" : criando ? "CRIAR CONTA" : "ENTRAR"
          }
        />

        <button
          type="button"
          onClick={() => setModo(recuperando ? "entrar" : "recuperar")}
          className="w-full text-center text-xs text-zinc-500 underline-offset-4 transition hover:text-zinc-300 hover:underline"
        >
          {recuperando ? "Voltar para o login" : "Esqueci minha senha"}
        </button>
      </form>
    </div>
  );
}
