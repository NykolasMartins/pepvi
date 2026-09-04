import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * DOIS clientes, com fronteira deliberada.
 *
 *   supabaseUser()  — chave pública + sessão do usuário nos cookies.
 *                     RLS VALE. Use em páginas e em toda ação feita em nome do
 *                     usuário. É o que impede que um `.eq("user_id", …)`
 *                     esquecido vaze dados de outra pessoa.
 *
 *   requireAdmin()  — service_role, IGNORA RLS. Só para trabalho de servidor
 *                     confiável que o usuário não poderia fazer sozinho: ler as
 *                     fotos do Storage e gravar a correção.
 *
 * A regra: se a operação é "o usuário fazendo algo com os próprios dados", use
 * supabaseUser(). Admin é exceção, e cada uso precisa de motivo.
 *
 * As variáveis são lidas e validadas na CHAMADA, nunca no carregamento do
 * módulo. Validar no topo faz o `next build` quebrar em "Failed to collect
 * configuration": o build avalia os módulos para coletar config de rota, e
 * ambiente de build não tem — nem deveria ter — segredo de runtime.
 */

function exigir(nome: string): string {
  const valor = process.env[nome];
  if (!valor) {
    throw new Error(
      `Falta a variável de ambiente ${nome}. Local: preencha o .env.local. ` +
        `Em produção: Project Settings > Environment Variables.`
    );
  }
  return valor;
}

/** Cliente com a sessão do usuário. Um por requisição — não guarde em módulo. */
export async function supabaseUser() {
  const url = exigir("NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey = exigir("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const store = await cookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, options);
          }
        } catch {
          // Server Component não pode escrever cookie. O middleware já
          // renovou a sessão nesta requisição, então ignorar aqui é correto.
        }
      },
    },
  });
}

let _admin: SupabaseClient | null = null;

/**
 * Cliente administrativo. Nunca use para ler dados "do usuário logado" —
 * é justamente aí que RLS deixaria de proteger.
 */
export function requireAdmin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(
      exigir("NEXT_PUBLIC_SUPABASE_URL"),
      exigir("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } }
    );
  }
  return _admin;
}

/**
 * Usuário da sessão. Lança se não houver — as rotas protegidas passam pelo
 * middleware, então chegar aqui sem sessão é bug, não fluxo normal.
 *
 * getUser() valida o token no servidor do Supabase. getSession() só lê o
 * cookie, que é dado do cliente e pode ser forjado — nunca use getSession()
 * para decidir autorização.
 */
export async function requireUser() {
  const supabase = await supabaseUser();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("não autenticado");
  return data.user;
}

/**
 * Usuário da sessão, e ele precisa ser admin. Lança se não for.
 *
 * Lê profiles.is_admin com a SESSÃO do usuário, não com service_role: a RLS já
 * restringe a linha à própria pessoa, e usar a chave administrativa aqui só
 * ampliaria o estrago de um bug sem melhorar nada.
 *
 * Quem escreve a coluna é o SQL Editor, uma vez. `revoke update (is_admin)` em
 * supabase/admin.sql é o que impede o usuário de se promover — sem aquele
 * revoke, esta função seria decorativa, porque a policy profiles_self permite
 * ao usuário escrever no próprio profile.
 *
 * Quem chama trata a exceção como 404, não 403: um 403 confirmaria que a rota
 * de administração existe.
 */
export async function requireOwner() {
  const user = await requireUser();
  const supabase = await supabaseUser();
  const { data, error } = await supabase
    .from("profiles")
    .select("is_admin, username")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.is_admin) throw new Error("não autorizado");
  return { ...user, username: data.username as string };
}

/**
 * Separa "não achou" de "quebrou".
 *
 * Sem isto, `const { data } = await query; if (!data) notFound()` transforma
 * TODA falha de banco — tabela faltando, coluna renomeada, RLS negando, rede
 * caindo — num 404. O sintoma vira indistinguível de registro inexistente e a
 * causa real fica invisível.
 */
export function unwrap<T>(res: {
  data: T;
  error: { message: string; code?: string } | null;
}): T {
  if (res.error) {
    throw new Error(
      `Supabase${res.error.code ? ` [${res.error.code}]` : ""}: ${res.error.message}`
    );
  }
  return res.data;
}
