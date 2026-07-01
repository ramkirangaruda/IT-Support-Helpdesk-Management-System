export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full">
      <main className="max-w-7xl w-full mx-auto px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
