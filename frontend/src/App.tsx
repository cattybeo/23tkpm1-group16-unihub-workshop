import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { TicketsProvider } from '@/lib/tickets-context';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { NotificationsProvider } from '@/lib/notifications-context';
import { Header } from '@/components/Header';
import { MobileNav } from '@/components/MobileNav';
import { Footer } from '@/components/GlobalFooter';
import { DiscoverPage } from '@/pages/DiscoverPage';
import { WorkshopDetailPage } from '@/pages/WorkshopDetailPage';
import { MyTicketsPage } from '@/pages/MyTicketsPage';
import { AdminPage } from '@/pages/AdminPage';
import { AdminDashboard } from '@/pages/AdminDashboard';
import { StaffPage } from '@/pages/StaffPage';
import { ScannerPage } from '@/pages/ScannerPage';
import LoginPage from '@/pages/LoginPage';
import ChangePasswordPage from '@/pages/ChangePasswordPage';

function AuthGuard() {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;
  if (profile?.must_change_password) return <Navigate to="/change-password" replace />;

  return <Outlet />;
}

function RoleGuard({ allowedRoles }: { allowedRoles: Array<'organizer' | 'staff' | 'student'> }) {
  const { profile } = useAuth();

  if (!profile || !allowedRoles.includes(profile.role)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

function Layout() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-[#F2F2F7]">
      <Outlet />
      <MobileNav />
    </div>
  );
}

function AppShell() {
  const location = useLocation();
  const isStaffRoute = location.pathname === '/staff';

  return (
    <div className="min-h-screen bg-[#F2F2F7] font-[system-ui,-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',sans-serif]">
      {!isStaffRoute && <Header />}
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />

        {/* Routes yêu cầu đăng nhập */}
        <Route element={<AuthGuard />}>
          <Route path="admin" element={<AdminPage />} />
          <Route path="admin-dashboard" element={<AdminDashboard />} />
          <Route path="scanner" element={<ScannerPage />} />
          <Route element={<RoleGuard allowedRoles={['organizer', 'staff']} />}>
            <Route path="staff" element={<StaffPage />} />
          </Route>
          <Route element={<Layout />}>
            <Route index element={<DiscoverPage />} />
            <Route path="workshop/:id" element={<WorkshopDetailPage />} />
            <Route path="tickets" element={<MyTicketsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
      {!isStaffRoute && <Footer />}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationsProvider>
          <TicketsProvider>
            <AppShell />
          </TicketsProvider>
        </NotificationsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
