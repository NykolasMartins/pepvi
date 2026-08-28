"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseUser } from "@/lib/supabase";

/**
 * E-mail e senha, não magic link.
 *
 * Magic link é mais elegante, mas o envio de e-mail do Supabase no plano free
 * tem limite baixo por hora e por projeto — com cinco pessoas testando na mesma
 * tarde, o cadastro simplesmente para de funcionar. Senha não depende de
 * entrega de e-mail.
 *
 * Para trocar por magic link depois: configure SMTP próprio primeiro.
 */

export type AuthState = { error: string } | null;

function mensagem(raw: string): string {
  // Mensagens do Supabase vêm em inglês e algumas vazam detalhe interno.
  if (/Invalid login credentials/i.test(raw)) return "E-mail ou senha incorretos.";
  if (/already registered|already been registered/i.test(raw))
    return "Este e-mail já tem conta. Volte para “Entrar”.";
  if (/Password should be at least/i.test(raw))
    return "A senha precisa de pelo menos 6 caracteres.";
  if (/Email not confirmed/i.test(raw))
    return "Confirme o e-mail antes de entrar (ou desligue a confirmação no painel do Supabase).";
  if (/rate limit|too many/i.test(raw))
    return "Muitas tentativas. Espere um minuto.";
  return raw;
}

/**
 * Entrar e criar conta na MESMA Server Action, com o modo vindo do formulário.
 *
 * Antes eram duas ações e o componente escolhia qual passar para
 * `useActionState`. Isso tem um bug silencioso: o hook guarda a função do
 * render em que o `formAction` foi criado, então trocar de aba não trocava a
 * ação — quem clicava em "Criar conta" e voltava para "Entrar" continuava
 * enviando um cadastro, e recebia "este e-mail já tem conta" estando na aba de
 * login.
 *
 * Com uma função só, não existe função para ficar velha. O modo é um campo do
 * formulário, e o servidor lê o que foi enviado de fato.
 */
export async function authenticate(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const modo = formData.get("modo") === "criar" ? "criar" : "entrar";
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/") || "/";

  if (!email || !password) return { error: "Preencha e-mail e senha." };

  const supabase = await supabaseUser();

  if (modo === "entrar") {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: mensagem(error.message) };

    revalidatePath("/", "layout");
    // redirect() funciona lançando — precisa ficar fora de try/catch.
    redirect(next.startsWith("/") ? next : "/");
  }

  if (password.length < 6) {
    return { error: "A senha precisa de pelo menos 6 caracteres." };
  }

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: mensagem(error.message) };

  // Sem sessão = o projeto exige confirmação por e-mail.
  if (!data.session) {
    return {
      error:
        "Conta criada. Confirme o e-mail para entrar — ou desligue a confirmação em Authentication > Sign In / Providers no painel do Supabase.",
    };
  }

  // A linha em profiles é criada pelo trigger on_auth_user_created.
  revalidatePath("/", "layout");
  redirect("/");
}

export async function signOut() {
  const supabase = await supabaseUser();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
