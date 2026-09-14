// Static export renders this into the flat 404.html every unknown URL
// serves, outside any locale shell; it stays locale-neutral and links into
// each locale home in its own script. Plain anchors: no router context here.
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="card-ui max-w-md p-8 text-center">
        <p className="font-serif text-4xl font-bold">404</p>
        <p className="mt-3 text-muted">Page not found</p>
        <nav className="mt-6 flex flex-wrap items-center justify-center gap-3" aria-label="ExecAtlas">
          <a href="/en" className="btn btn-primary">
            English
          </a>
          <a href="/hi" className="btn-ghost">
            हिन्दी
          </a>
          <a href="/ar" className="btn-ghost">
            العربية
          </a>
          <a href="/id" className="btn-ghost">
            Bahasa Indonesia
          </a>
        </nav>
      </div>
    </main>
  );
}
