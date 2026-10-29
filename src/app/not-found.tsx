import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <h1 className="font-serif text-4xl">Not found</h1>
      <p className="mt-3 text-ink/70">That page or receipt is not in this shop.</p>
      <Link href="/" className="btn btn-primary mt-6">
        Back to the counter
      </Link>
    </main>
  );
}
