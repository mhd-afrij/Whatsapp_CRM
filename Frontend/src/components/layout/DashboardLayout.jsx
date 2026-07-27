import { Sidebar } from "./Sidebar.jsx";
import { Header } from "./Header.jsx";
import { Footer } from "./Footer.jsx";

export function DashboardLayout({ children }) {
  return (
    <div className="flex min-h-screen bg-background text-text-primary">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <Header />
        <main className="flex-1 p-6 pb-24 md:pb-6">{children}</main>
      </div>
      <Footer />
    </div>
  );
}
