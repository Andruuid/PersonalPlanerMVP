import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold">403 - Zugriff verweigert</h1>
      <p className="mt-3 text-sm text-neutral-600">
        Ihr Konto ist angemeldet, hat aber keinen Zugriff auf diesen Bereich.
      </p>
      <Link
        href="/login"
        className="mt-6 inline-flex rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
      >
        Zur Anmeldung
      </Link>
    </main>
  );
}
