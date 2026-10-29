"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <h1 className="font-serif text-4xl">Something went wrong</h1>
      <p className="mt-3 text-ink/70">The counter could not finish that action.</p>
      <button className="btn btn-primary mt-6" type="button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
