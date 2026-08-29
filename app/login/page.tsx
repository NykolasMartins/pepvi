import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; erro?: string }>;
}) {
  const { next, erro } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-8 px-6 py-16">
      <div>
        <h1 className="font-display text-5xl font-extrabold tracking-tight">PEPVI</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Treino de redação do ENEM contra o relógio. Tema sorteado, cronômetro
          correndo, correção nas 5 competências.
        </p>
      </div>

      <LoginForm next={next ?? "/"} erro={erro} />
    </main>
  );
}
