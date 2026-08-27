import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

/**
 * DOIS clientes, com fronteira deliberada.
 *
 *   supabaseUser()  — chave pública + sessão do usuário nos cookies.
 *                     RLS VALE. Use em páginas e em toda ação feita em nome do
 *                     usuário. É o que impede que um `.eq("user_id", …)`
 *                     esquecido vaze dados de outra pessoa.
 *
 *   supabaseAdmin   — service_role, IGNORA RLS. Só para trabalho de servidor
 *                     confiável que o usuário não poderia fazer sozinho: ler as
 *                     fotos do Storage e gravar a correção.
 *
 * A regra: se a operação é "o usuário fazendo algo com os próprios dados", use
 * supabaseUser(). Admin é exceção, e cada uso precisa de motivo.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    "Faltam NEXT_PUBLIC_SUPABASE_URL e/ou NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local"
  );
}

/** Cliente com a sessão do usuário. Um por requisição — não guarde em módulo. */
export async function supabaseUser() {
  const store = await cookies();

  return createServerClient(url!, publishableKey!, {
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

/**
 * Cliente administrativo. Nunca use para ler dados "do usuário logado" —
 * é justamente aí que RLS deixaria de proteger.
 */
export const supabaseAdmin = serviceRoleKey
  ? createClient(url, serviceRoleKey, { auth: { persistSession: false } })
  : null;

export function requireAdmin() {
  if (!supabaseAdmin) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY no .env.local");
  }
  return supabaseAdmin;
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
