import { NextResponse, type NextRequest } from "next/server";
import { supabaseUser } from "@/lib/supabase";

/**
 * Ponto de chegada do link enviado por e-mail (recuperação de senha).
 *
 * O link vai para o Supabase, que valida e redireciona para cá. O que chega
 * depende do template do e-mail:
 *
 *   ?code=…        template padrão com {{ .ConfirmationURL }} e cliente PKCE
 *   ?token_hash=…  template reescrito para {{ .TokenHash }}
 *
 * Os dois são aceitos porque trocar o template do e-mail é a primeira coisa
 * que se faz no painel, e o fluxo quebrar por isso seria um bug invisível: o
 * link "funciona" e cai numa tela pedindo login.
 *
 * Precisa ser Route Handler, não página: só aqui dá para gravar o cookie da
 * sessão e redirecionar na mesma resposta.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const proximo = searchParams.get("next") ?? "/";
  // Só caminho interno: `next` vem da URL e um "//evil.com" viraria redirect
  // aberto — o link do e-mail passaria a levar para fora.
  const destino = proximo.startsWith("/") && !proximo.startsWith("//") ? proximo : "/";

  const supabase = await supabaseUser();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(destino, origin));
  } else if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({
      type: "recovery",
      token_hash: tokenHash,
    });
    if (!error) return NextResponse.redirect(new URL(destino, origin));
  }

  const login = new URL("/login", origin);
  login.searchParams.set("erro", "link-invalido");
  return NextResponse.redirect(login);
}
