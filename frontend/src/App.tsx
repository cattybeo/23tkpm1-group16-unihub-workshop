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
import { UserSettingsPage } from '@/pages/UserSettingsPage';
import { AccountPage } from '@/pages/AccountPage';
import { AdminPage } from '@/pages/AdminPage';
import { StaffPage } from '@/pages/StaffPage';
import { PaymentPage } from '@/pages/PaymentPage';
import LoginPage from '@/pages/LoginPage';
import ChangePasswordPage from '@/pages/ChangePasswordPage';
import StaffLoginPage from '@/pages/StaffLoginPage';

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

function getHomeRoute(role: 'student' | 'organizer' | 'staff'): string {
  if (role === 'staff') return '/staff'
  if (role === 'organizer') return '/admin'
  return '/'
}

function RoleGuard({ allowedRoles }: { allowedRoles: Array<'organizer' | 'staff' | 'student'> }) {
  const { profile } = useAuth();

  if (!profile || !allowedRoles.includes(profile.role)) {
    return <Navigate to={getHomeRoute(profile?.role ?? 'student')} replace />;
  }

  return <Outlet />;
}

function RoleRedirect() {
  const { profile } = useAuth();
  return <Navigate to={getHomeRoute(profile?.role ?? 'student')} replace />;
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

const CHROMELESS_PATHS = ['/staff', '/admin', '/payment'];

function AppShell() {
  const location = useLocation();
  const isChromelessRoute = CHROMELESS_PATHS.some(p => location.pathname === p || location.pathname.startsWith(p + '/'));

  return (
    <div className="min-h-screen flex flex-col bg-[#F2F2F7] font-[system-ui,-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',sans-serif]">
      {!isChromelessRoute && <Header />}
      <div className="flex-1 flex flex-col">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/staff-login" element={<StaffLoginPage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />

        <Route element={<AuthGuard />}>
          {/* Organizer only */}
          <Route element={<RoleGuard allowedRoles={['organizer']} />}>
            <Route path="admin" element={<AdminPage />} />
          </Route>

          {/* Organizer + Staff */}
          <Route element={<RoleGuard allowedRoles={['organizer', 'staff']} />}>
            <Route path="staff" element={<StaffPage />} />
          </Route>

          {/* Student only */}
          <Route element={<RoleGuard allowedRoles={['student']} />}>
            <Route path="payment" element={<PaymentPage />} />
            <Route element={<Layout />}>
              <Route index element={<DiscoverPage />} />
              <Route path="workshop/:id" element={<WorkshopDetailPage />} />
              <Route path="tickets" element={<MyTicketsPage />} />
              <Route path="settings" element={<UserSettingsPage />} />
              <Route path="account" element={<AccountPage />} />
            </Route>
          </Route>

          {/* Unknown routes → role home */}
          <Route path="*" element={<RoleRedirect />} />
        </Route>
      </Routes>
      </div>
      {!isChromelessRoute && <Footer />}
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
