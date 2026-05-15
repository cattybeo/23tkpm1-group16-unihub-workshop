import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { TicketsProvider } from '@/lib/tickets-context';
import { Header } from '@/components/Header';
import { MobileNav } from '@/components/MobileNav';
import { DiscoverPage } from '@/pages/DiscoverPage';
import { WorkshopDetailPage } from '@/pages/WorkshopDetailPage';
import { MyTicketsPage } from '@/pages/MyTicketsPage';

function Layout() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-[#F2F2F7] font-[system-ui,-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',sans-serif]">
      <Header />
      <Outlet />
      <MobileNav />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <TicketsProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DiscoverPage />} />
            <Route path="workshop/:id" element={<WorkshopDetailPage />} />
            <Route path="tickets" element={<MyTicketsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </TicketsProvider>
    </BrowserRouter>
  );
}
