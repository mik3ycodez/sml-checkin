export default function Home() {
  return (
    <div className="flex flex-1 flex-col justify-center gap-3">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        SML Check-in
      </h1>
      <p className="text-lg text-foreground/70">
        Scan an event QR code to check in.
      </p>
    </div>
  );
}
