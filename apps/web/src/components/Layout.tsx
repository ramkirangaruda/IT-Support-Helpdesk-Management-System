// Content-area wrapper used by individual pages.
// The top nav has been replaced by Sidebar (rendered in App.tsx).
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-transparent">
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}
