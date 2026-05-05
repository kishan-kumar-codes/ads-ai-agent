export function ChatPage() {
  return (
    <section className="grid h-[calc(100vh-8rem)] grid-cols-1 gap-4 md:grid-cols-[260px_1fr]">
      <aside className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <button className="w-full rounded-md bg-brand px-3 py-2 text-sm text-white hover:bg-brand-dark">
          + New chat
        </button>
        <ul className="mt-4 space-y-1 text-sm">
          <li className="rounded px-3 py-2 text-slate-500">No threads yet</li>
        </ul>
      </aside>
      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-slate-500">
          Chat UI lands in Phase 4. This is the Phase 3 shell.
        </p>
      </div>
    </section>
  );
}
