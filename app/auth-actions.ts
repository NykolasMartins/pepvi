"use server";

import { headers } from "next/headers";
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
  if (/rate limit|too many|after \d+ seconds/i.test(raw))
    return "Muitas tentativas. Espere um minuto.";
  if (/New password should be different/i.test(raw))
    return "A senha nova precisa ser diferente da anterior.";
  if (/Auth session missing|session_not_found/i.test(raw))
    return "O link de recuperação expirou. Peça outro.";
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
  const bruto = formData.get("modo");
  const modo =
    bruto === "criar" || bruto === "recuperar" ? bruto : "entrar";
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/") || "/";

  if (!email) return { error: "Preencha o e-mail." };
  if (modo !== "recuperar" && !password)
    return { error: "Preencha e-mail e senha." };

  const supabase = await supabaseUser();

  if (modo === "recuperar") {
    // O redirectTo precisa estar em Authentication > URL Configuration >
    // Redirect URLs no painel do Supabase, senão o link do e-mail cai na Site
    // URL e o code se perde.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${await origem()}/auth/confirm?next=/nova-senha`,
    });
    if (error) return { error: mensagem(error.message) };

    // Resposta igual existindo conta ou não: dizer "este e-mail não tem conta"
    // transformaria a tela em um verificador de quem está cadastrado aqui.
    return {
      error:
        "Se existir conta com esse e-mail, o link de recuperação chegou. Confira também o spam.",
    };
  }

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

/**
 * Origem da requisição, não variável de ambiente.
 *
 * O link do e-mail precisa voltar para o mesmo host de onde o pedido saiu —
 * localhost em dev, o domínio da Vercel em produção, o domínio de preview num
 * preview. Uma variável fixa erraria dois desses três, e ainda exigiria
 * cadastrá-la nos três ambientes da Vercel.
 */
async function origem(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Troca a senha de quem já está autenticado.
 *
 * Serve tanto para o fluxo de recuperação (a sessão vem do code trocado em
 * /auth/confirm) quanto para uma troca comum. Não recebe o e-mail nem o id:
 * updateUser age sobre a sessão dos cookies, e é o Supabase que decide de quem
 * ela é. Aceitar identificador do cliente aqui deixaria trocar a senha alheia.
 */
export async function definirNovaSenha(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  const confirmacao = String(formData.get("confirmacao") ?? "");

  if (password.length < 6)
    return { error: "A senha precisa de pelo menos 6 caracteres." };
  if (password !== confirmacao) return { error: "As duas senhas não batem." };

  const supabase = await supabaseUser();

  // Sem sessão o updateUser falharia com uma mensagem interna. Checar antes dá
  // o recado certo: o link do e-mail venceu.
  const { data: sessao } = await supabase.auth.getUser();
  if (!sessao.user) return { error: "O link de recuperação expirou. Peça outro." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: mensagem(error.message) };

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signOut() {
  const supabase = await supabaseUser();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
