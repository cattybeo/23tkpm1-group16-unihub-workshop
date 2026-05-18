import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Ticket, User } from 'lucide-react';

export function MobileNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const isDiscoverActive = location.pathname === '/';
  const isTicketsActive = location.pathname === '/tickets';
  const isSettingsActive = location.pathname === '/settings';

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[rgba(255,255,255,0.8)] backdrop-blur-xl border-t border-[#E5E5EA] flex pb-safe pt-[8px] px-[16px] z-50 supports-backdrop-blur:bg-white/60">
      <button
        onClick={() => navigate('/')}
        className={`flex-1 flex flex-col items-center justify-center gap-[4px] h-[50px] ${isDiscoverActive ? 'text-[#007AFF]' : 'text-[#8E8E93]'}`}
        aria-label="Khám phá workshop"
      >
        <Search className="w-[24px] h-[24px]" />
        <span className="text-[10px] font-medium">Khám phá</span>
      </button>
      <button
        onClick={() => navigate('/tickets')}
        className={`flex-1 flex flex-col items-center justify-center gap-[4px] h-[50px] ${isTicketsActive ? 'text-[#007AFF]' : 'text-[#8E8E93]'}`}
        aria-label="Vé của tôi"
      >
        <Ticket className="w-[24px] h-[24px]" />
        <span className="text-[10px] font-medium">Vé</span>
      </button>
      <button
        onClick={() => navigate('/settings')}
        className={`flex-1 flex flex-col items-center justify-center gap-[4px] h-[50px] ${isSettingsActive ? 'text-[#007AFF]' : 'text-[#8E8E93]'}`}
        aria-label="Cài đặt tài khoản"
      >
        <User className="w-[24px] h-[24px]" />
        <span className="text-[10px] font-medium">Hồ sơ</span>
      </button>
    </nav>
  );
}
