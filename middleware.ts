import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Renova o token da sessão e barra o acesso anônimo.
 *
 * O middleware é o único lugar que consegue escrever cookie de resposta em toda
 * requisição — por isso a renovação mora aqui e não nas páginas. Sem ele a
 * sessão expira e o usuário é deslogado no meio de uma partida.
 *
 * Isto é conveniência de navegação, NÃO a fronteira de segurança. Quem protege
 * os dados é a RLS no Postgres: mesmo que alguém contorne o middleware, as
 * políticas só devolvem as linhas do próprio auth.uid().
 */
const PUBLICAS = ["/login", "/auth"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // getUser() valida o token contra o Supabase. getSession() só leria o cookie,
  // que é dado do cliente. Não trocar por getSession() para "economizar".
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const publica = PUBLICAS.some((p) => pathname.startsWith(p));

  if (!user && !publica) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  if (user && pathname === "/login") {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return NextResponse.redirect(home);
  }

  return response;
}

export const config = {
  matcher: [
    // Tudo, menos estáticos e imagens.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
