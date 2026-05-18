import { useLocation, useNavigate } from 'react-router-dom';
import { useTickets } from '@/lib/tickets-context';
import { NotificationBell } from '@/components/NotificationBell';
import { UserMenu } from '@/components/UserMenu';

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { myTickets } = useTickets();

  const isAuthScreen =
    location.pathname === '/login' || location.pathname === '/staff-login' || location.pathname === '/change-password';
  const isDiscoverActive = location.pathname === '/';
  const isTicketsActive = location.pathname === '/tickets';

  return (
    <header className="h-[44px] md:h-[60px] bg-[rgba(255,255,255,0.8)] backdrop-blur-xl border-b border-[#E5E5EA] px-[16px] md:px-[32px] sticky top-0 z-50 flex items-center justify-between supports-backdrop-blur:bg-white/60">
      <button
        type="button"
        className="font-semibold text-[17px] tracking-tight text-[#1C1C1E] cursor-pointer flex items-center gap-[8px]"
        onClick={() => navigate('/')}
        aria-label="Về trang khám phá"
      >
        <img src="/icon.svg" alt="UniHub Workshop" className="w-[36px] h-[36px]" />
      </button>
      {!isAuthScreen && (
        <>
          <nav className="hidden md:flex gap-[32px]">
            <button
              onClick={() => navigate('/')}
              className={`text-[15px] transition-colors ${isDiscoverActive ? 'text-[#1C1C1E] font-semibold' : 'text-[#8E8E93] hover:text-[#1C1C1E] font-medium'}`}
            >
              Khám phá
            </button>
            <button
              onClick={() => navigate('/tickets')}
              className={`text-[15px] transition-colors flex items-center gap-[6px] ${isTicketsActive ? 'text-[#1C1C1E] font-semibold' : 'text-[#8E8E93] hover:text-[#1C1C1E] font-medium'}`}
            >
              Vé của tôi {myTickets.length > 0 && <span className="bg-[#007AFF] text-white text-[11px] font-bold px-[6px] py-[2px] rounded-full">{myTickets.length}</span>}
            </button>
          </nav>
          <div className="flex items-center gap-[10px]">
            <NotificationBell />
            <UserMenu />
          </div>
        </>
      )}
    </header>
  );
}
