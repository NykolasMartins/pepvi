export default function Loading() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-12" aria-busy="true">
      <div className="h-9 w-56 animate-pulse rounded-lg bg-superficie" />
      <div className="h-28 animate-pulse rounded-2xl bg-superficie" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-superficie" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-superficie" />
      <span className="sr-only">Carregando…</span>
    </main>
  );
}
