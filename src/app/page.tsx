export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-3 px-4 py-6 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        SML Check-in
      </h1>
      <p className="text-lg text-foreground/70">
        Scan an event QR code to check in.
      </p>
    </main>
  );
}
