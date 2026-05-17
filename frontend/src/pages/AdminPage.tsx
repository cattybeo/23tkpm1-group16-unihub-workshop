import { FormEvent, useMemo, useState } from 'react';
import {
  Activity,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  CreditCard,
  Image as ImageIcon,
  LayoutDashboard,
  Map,
  MonitorPlay,
  Plus,
  Sparkles,
  Trash2,
  TrendingUp,
  UploadCloud,
  Users
} from 'lucide-react';
import { MOCK_WORKSHOPS } from '@/lib/mock-data';

type AdminView = 'dashboard' | 'workshops' | 'editor';
type WorkshopStatus = 'draft' | 'published';

interface AdminWorkshop {
  id: string;
  title: string;
  speaker: string;
  day: string;
  time: string;
  room: string;
  coverUrl: string;
  roomMapUrl: string;
  capacity: number;
  seatsRemaining: number;
  status: WorkshopStatus;
  isFree: boolean;
  feeVnd: number;
  aiSummary: string;
}

const ADMIN_WORKSHOPS: AdminWorkshop[] = MOCK_WORKSHOPS.slice(0, 2).map((workshop, index) => ({
  id: workshop.id,
  title: workshop.title,
  speaker: workshop.speaker,
  day: workshop.day,
  time: workshop.time,
  room: workshop.room,
  coverUrl: workshop.image,
  roomMapUrl: index === 0 ? 'https://images.unsplash.com/photo-1576085898323-218337e3e43c?q=80&w=800&auto=format&fit=crop' : '',
  capacity: workshop.capacity,
  seatsRemaining: Math.max(workshop.capacity - workshop.booked, 0),
  status: 'published',
  isFree: workshop.isFree,
  feeVnd: workshop.price,
  aiSummary: workshop.aiSummary
}));

const DASHBOARD_STATS = {
  totalRevenue: 15000000,
  registrations: { confirmed: 442, pendingPayment: 45 },
  checkIns: { online: 310, offline: 85 }
};

const DEFAULT_COVER_URL = 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?q=80&w=800&auto=format&fit=crop';
const DEFAULT_ROOM_MAP_URL = 'https://images.unsplash.com/photo-1576085898323-218337e3e43c?q=80&w=800&auto=format&fit=crop';

const inputClass =
  'w-full h-[48px] px-[16px] bg-[#F9F9F9] border border-[#E5E5EA] rounded-[12px] text-[15px] text-[#1C1C1E] focus:outline-none focus:border-[#007AFF] focus:bg-white transition-colors';

function numberOrZero(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function createEmptyWorkshop(): AdminWorkshop {
  return {
    id: `new-${Date.now()}`,
    title: '',
    speaker: '',
    day: '',
    time: '',
    room: '',
    coverUrl: '',
    roomMapUrl: '',
    capacity: 100,
    seatsRemaining: 100,
    status: 'draft',
    isFree: true,
    feeVnd: 0,
    aiSummary: ''
  };
}

interface SidebarProps {
  currentView: AdminView;
  onNavigate: (view: AdminView) => void;
}

function Sidebar({ currentView, onNavigate }: SidebarProps) {
  const isWorkshopActive = currentView === 'workshops' || currentView === 'editor';

  return (
    <aside className="w-[260px] bg-[#F9F9F9] border-r border-[#E5E5EA] h-screen fixed left-0 top-0 hidden md:flex flex-col z-20">
      <div className="h-[80px] flex items-center px-[24px] border-b border-[#E5E5EA] bg-white">
        <div className="font-bold text-[20px] tracking-tight text-[#1C1C1E] flex items-center gap-[12px]">
          <div className="w-[32px] h-[32px] bg-[#007AFF] rounded-[8px] text-white flex items-center justify-center text-[14px] shadow-[0_2px_8px_rgba(0,122,255,0.3)]">
            U
          </div>
          UniHub
          <span className="text-[#007AFF] font-medium text-[13px] bg-[#007AFF]/10 px-[8px] py-[2px] rounded-[6px]">
            Admin
          </span>
        </div>
      </div>

      <nav className="flex-1 py-[24px] px-[16px] space-y-[8px]">
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className={`w-full flex items-center gap-[12px] px-[16px] py-[12px] rounded-[12px] text-[15px] font-medium transition-all duration-200 ${
            currentView === 'dashboard'
              ? 'bg-[#007AFF] text-white shadow-[0_4px_12px_rgba(0,122,255,0.25)]'
              : 'text-[#5C5C5E] hover:bg-[#007AFF]/10 hover:text-[#007AFF]'
          }`}
        >
          <LayoutDashboard className="w-[20px] h-[20px]" /> Tổng quan
        </button>
        <button
          type="button"
          onClick={() => onNavigate('workshops')}
          className={`w-full flex items-center gap-[12px] px-[16px] py-[12px] rounded-[12px] text-[15px] font-medium transition-all duration-200 ${
            isWorkshopActive
              ? 'bg-[#007AFF] text-white shadow-[0_4px_12px_rgba(0,122,255,0.25)]'
              : 'text-[#5C5C5E] hover:bg-[#007AFF]/10 hover:text-[#007AFF]'
          }`}
        >
          <CalendarRange className="w-[20px] h-[20px]" /> Quản lý Workshop
        </button>
      </nav>

      <div className="p-[20px] border-t border-[#E5E5EA] bg-white">
        <div className="flex items-center gap-[12px] bg-[#F2F2F7] px-[16px] py-[12px] rounded-[16px] border border-[#E5E5EA]/50">
          <div className="w-[40px] h-[40px] rounded-[12px] bg-[#007AFF]/10 flex items-center justify-center font-bold text-[#007AFF] text-[15px] shadow-sm">
            BTC
          </div>
          <div>
            <p className="text-[15px] font-bold text-[#1C1C1E] leading-tight">Ban Tổ Chức</p>
            <p className="text-[13px] text-[#8E8E93] font-medium mt-[2px]">Khoa CNTT - HCMUS</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

interface MobileAdminNavProps {
  currentView: AdminView;
  onNavigate: (view: AdminView) => void;
}

function MobileAdminNav({ currentView, onNavigate }: MobileAdminNavProps) {
  const isWorkshopActive = currentView === 'workshops' || currentView === 'editor';

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[rgba(255,255,255,0.9)] backdrop-blur-xl border-t border-[#E5E5EA] flex px-[16px] pt-[8px] pb-[10px]">
      <button
        type="button"
        onClick={() => onNavigate('dashboard')}
        className={`flex-1 h-[52px] flex flex-col items-center justify-center gap-[4px] text-[11px] font-semibold ${
          currentView === 'dashboard' ? 'text-[#007AFF]' : 'text-[#8E8E93]'
        }`}
      >
        <LayoutDashboard className="w-[22px] h-[22px]" />
        Tổng quan
      </button>
      <button
        type="button"
        onClick={() => onNavigate('workshops')}
        className={`flex-1 h-[52px] flex flex-col items-center justify-center gap-[4px] text-[11px] font-semibold ${
          isWorkshopActive ? 'text-[#007AFF]' : 'text-[#8E8E93]'
        }`}
      >
        <CalendarRange className="w-[22px] h-[22px]" />
        Workshop
      </button>
    </nav>
  );
}

interface DashboardViewProps {
  workshops: AdminWorkshop[];
}

function DashboardView({ workshops }: DashboardViewProps) {
  const totalCapacity = workshops.reduce((acc, workshop) => acc + workshop.capacity, 0);
  const totalCheckIns = DASHBOARD_STATS.checkIns.online + DASHBOARD_STATS.checkIns.offline;

  return (
    <div className="animate-in fade-in duration-300 max-w-[1200px]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[12px] mb-[28px]">
        <h1 className="text-[28px] md:text-[32px] font-bold text-[#1C1C1E] tracking-tight">Thống kê hệ thống</h1>
        <div className="w-fit flex items-center gap-[8px] px-[12px] py-[6px] bg-[#34C759]/10 rounded-full border border-[#34C759]/20">
          <div className="w-[8px] h-[8px] bg-[#34C759] rounded-full animate-pulse" />
          <span className="text-[13px] font-medium text-[#34C759]">Dữ liệu cập nhật lúc 02:00 AM</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-[20px] mb-[28px]">
        <div className="bg-white p-[20px] rounded-[20px] shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-[#E5E5EA] flex flex-col justify-between min-h-[140px]">
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-medium text-[#8E8E93]">Tổng Doanh Thu</p>
            <div className="w-[32px] h-[32px] rounded-[8px] bg-[#34C759]/10 flex items-center justify-center">
              <CreditCard className="w-[16px] h-[16px] text-[#34C759]" />
            </div>
          </div>
          <div>
            <h3 className="text-[28px] font-bold text-[#1C1C1E] leading-none mb-[8px]">
              {DASHBOARD_STATS.totalRevenue.toLocaleString('vi-VN')} <span className="text-[16px] text-[#8E8E93]">đ</span>
            </h3>
            <p className="text-[12px] text-[#34C759] font-medium flex items-center gap-[4px]">
              <TrendingUp className="w-[12px] h-[12px]" /> Thanh toán thành công
            </p>
          </div>
        </div>

        <div className="bg-white p-[20px] rounded-[20px] shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-[#E5E5EA] flex flex-col justify-between min-h-[140px]">
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-medium text-[#8E8E93]">Sinh viên Đăng ký</p>
            <div className="w-[32px] h-[32px] rounded-[8px] bg-[#007AFF]/10 flex items-center justify-center">
              <Users className="w-[16px] h-[16px] text-[#007AFF]" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-[8px]">
              <h3 className="text-[28px] font-bold text-[#1C1C1E] leading-none mb-[8px]">
                {DASHBOARD_STATS.registrations.confirmed}
              </h3>
              <span className="text-[14px] text-[#8E8E93] font-medium">/ {totalCapacity} chỗ</span>
            </div>
            <p className="text-[12px] text-[#FF9500] font-medium">
              {DASHBOARD_STATS.registrations.pendingPayment} đang chờ thanh toán
            </p>
          </div>
        </div>

        <div className="bg-white p-[20px] rounded-[20px] shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-[#E5E5EA] flex flex-col justify-between min-h-[140px] md:col-span-2 relative overflow-hidden">
          <div className="absolute right-0 top-0 h-full w-[40%] bg-gradient-to-l from-[#F2F2F7] to-transparent pointer-events-none" />
          <div className="flex items-center justify-between relative z-10">
            <p className="text-[14px] font-medium text-[#8E8E93]">Trạng thái Check-in</p>
            <div className="w-[32px] h-[32px] rounded-[8px] bg-[#5E5CE6]/10 flex items-center justify-center">
              <Activity className="w-[16px] h-[16px] text-[#5E5CE6]" />
            </div>
          </div>
          <div className="relative z-10">
            <h3 className="text-[28px] font-bold text-[#1C1C1E] leading-none mb-[12px]">
              {totalCheckIns} <span className="text-[14px] text-[#8E8E93] font-normal">đã quét QR</span>
            </h3>
            <div className="flex flex-wrap items-center gap-x-[16px] gap-y-[8px]">
              <div className="flex items-center gap-[6px]">
                <div className="w-[8px] h-[8px] rounded-full bg-[#34C759]" />
                <span className="text-[12px] font-medium text-[#1C1C1E]">Hệ thống mượt: {DASHBOARD_STATS.checkIns.online}</span>
              </div>
              <div className="flex items-center gap-[6px]">
                <div className="w-[8px] h-[8px] rounded-full bg-[#FF3B30]" />
                <span className="text-[12px] font-medium text-[#1C1C1E]">Mất mạng/Nghẽn: {DASHBOARD_STATS.checkIns.offline}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <h2 className="text-[20px] font-bold text-[#1C1C1E] mb-[16px]">Tiến độ phân bổ vé</h2>
      <div className="bg-white rounded-[20px] border border-[#E5E5EA] shadow-[0_2px_12px_rgba(0,0,0,0.02)] overflow-hidden">
        {workshops.map((workshop) => {
          const booked = workshop.capacity - workshop.seatsRemaining;
          const percent = workshop.capacity > 0 ? (booked / workshop.capacity) * 100 : 0;

          return (
            <div key={workshop.id} className="p-[20px] border-b border-[#F2F2F7] last:border-0 flex flex-col md:flex-row md:items-center md:justify-between gap-[14px]">
              <div className="flex-1 md:pr-[32px] min-w-0">
                <p className="text-[15px] font-semibold text-[#1C1C1E] mb-[8px] truncate">{workshop.title}</p>
                <div className="flex flex-col sm:flex-row sm:items-center gap-[10px] sm:gap-[12px]">
                  <div className="h-[6px] w-full max-w-[300px] bg-[#E5E5EA] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${percent >= 100 ? 'bg-[#FF3B30]' : 'bg-[#007AFF]'}`}
                      style={{ width: `${Math.min(percent, 100)}%` }}
                    />
                  </div>
                  <span className="text-[13px] font-medium text-[#8E8E93]">Đã phân bổ {booked}/{workshop.capacity}</span>
                </div>
              </div>
              <div className="md:text-right">
                <span
                  className={`px-[10px] py-[4px] rounded-[6px] text-[12px] font-bold ${
                    workshop.status === 'published' ? 'bg-[#34C759]/10 text-[#34C759]' : 'bg-[#E5E5EA] text-[#8E8E93]'
                  }`}
                >
                  {workshop.status === 'published' ? 'Đang mở đăng ký' : 'Đang ẩn'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface WorkshopsViewProps {
  workshops: AdminWorkshop[];
  onCreateNew: () => void;
  onEdit: (workshop: AdminWorkshop) => void;
}

function WorkshopsView({ workshops, onCreateNew, onEdit }: WorkshopsViewProps) {
  return (
    <div className="animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[16px] mb-[28px]">
        <h1 className="text-[28px] md:text-[32px] font-bold text-[#1C1C1E] tracking-tight">Quản lý Workshop</h1>
        <button
          type="button"
          onClick={onCreateNew}
          className="w-full sm:w-fit bg-[#007AFF] hover:bg-[#006DEB] text-white px-[20px] py-[12px] rounded-[14px] font-semibold flex items-center justify-center gap-[8px] transition-colors shadow-[0_4px_12px_rgba(0,122,255,0.2)]"
        >
          <Plus className="w-[20px] h-[20px]" /> Tạo Workshop mới
        </button>
      </div>

      <div className="bg-white rounded-[24px] border border-[#E5E5EA] overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
        <div className="hidden lg:grid grid-cols-12 gap-[16px] px-[24px] py-[16px] border-b border-[#E5E5EA] bg-[#F9F9F9] text-[13px] font-bold text-[#8E8E93] uppercase tracking-wide">
          <div className="col-span-5">Tên sự kiện & Diễn giả</div>
          <div className="col-span-3">Thời gian & Địa điểm</div>
          <div className="col-span-2">Phân bổ</div>
          <div className="col-span-2 text-right">Trạng thái</div>
        </div>

        <div className="divide-y divide-[#E5E5EA]">
          {workshops.map((workshop) => {
            const booked = workshop.capacity - workshop.seatsRemaining;

            return (
              <button
                type="button"
                key={workshop.id}
                className="w-full text-left grid grid-cols-1 lg:grid-cols-12 gap-[14px] lg:gap-[16px] lg:items-center px-[20px] lg:px-[24px] py-[20px] hover:bg-[#F5F5F7] transition-colors group"
                onClick={() => onEdit(workshop)}
              >
                <div className="lg:col-span-5 flex items-center gap-[12px] min-w-0">
                  <div className="w-[48px] h-[48px] rounded-[8px] bg-[#F2F2F7] border border-[#E5E5EA] shrink-0 overflow-hidden">
                    {workshop.coverUrl ? (
                      <img src={workshop.coverUrl} alt={workshop.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-[16px] h-[16px] text-[#C7C7CC]" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-[#1C1C1E] mb-[2px] lg:pr-[16px] group-hover:text-[#007AFF] transition-colors truncate">
                      {workshop.title || 'Workshop chưa đặt tên'}
                    </p>
                    <p className="text-[13px] text-[#8E8E93] truncate">{workshop.speaker || 'Chưa có đơn vị tổ chức'}</p>
                  </div>
                </div>
                <div className="lg:col-span-3">
                  <p className="text-[14px] text-[#1C1C1E] font-medium">{workshop.day || 'Chưa có ngày'}</p>
                  <p className="text-[13px] text-[#8E8E93] truncate lg:pr-[16px]">{workshop.room || 'Chưa có phòng'}</p>
                </div>
                <div className="lg:col-span-2 flex flex-col justify-center">
                  <p className="text-[14px] font-bold text-[#1C1C1E]">
                    {booked} <span className="text-[#8E8E93] font-medium">/ {workshop.capacity}</span>
                  </p>
                </div>
                <div className="lg:col-span-2 flex items-center justify-between lg:justify-end gap-[16px]">
                  {workshop.status === 'published' ? (
                    <span className="bg-[#34C759]/10 text-[#34C759] text-[12px] font-bold px-[10px] py-[4px] rounded-full">Đang mở</span>
                  ) : (
                    <span className="bg-[#E5E5EA] text-[#8E8E93] text-[12px] font-bold px-[10px] py-[4px] rounded-full">Đang ẩn</span>
                  )}
                  <ChevronLeft className="w-[20px] h-[20px] text-[#C7C7CC] rotate-180" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface EditorViewProps {
  editingWorkshop: AdminWorkshop;
  isUploadingPDF: boolean;
  isGeneratingAI: boolean;
  isUploadingMap: boolean;
  isUploadingCover: boolean;
  tempSummary: string;
  onBack: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onUploadCover: () => void;
  onUploadMap: () => void;
  onGenerateAI: () => void;
  onWorkshopChange: (workshop: AdminWorkshop) => void;
  onSummaryChange: (summary: string) => void;
}

function EditorView({
  editingWorkshop,
  isUploadingPDF,
  isGeneratingAI,
  isUploadingMap,
  isUploadingCover,
  tempSummary,
  onBack,
  onCancel,
  onDelete,
  onSave,
  onUploadCover,
  onUploadMap,
  onGenerateAI,
  onWorkshopChange,
  onSummaryChange
}: EditorViewProps) {
  const isNew = editingWorkshop.id.startsWith('new-');

  return (
    <div className="animate-in slide-in-from-right-8 duration-300 max-w-[1000px] pb-[110px] md:pb-[40px]">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center text-[15px] font-medium text-[#8E8E93] hover:text-[#007AFF] mb-[24px] transition-colors"
      >
        <ChevronLeft className="w-[20px] h-[20px] mr-[4px]" /> Quay lại danh sách
      </button>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[16px] mb-[28px]">
        <h1 className="text-[28px] md:text-[32px] font-bold text-[#1C1C1E] tracking-tight">
          {isNew ? 'Tạo Workshop mới' : 'Chỉnh sửa Workshop'}
        </h1>
        {!isNew && (
          <button
            type="button"
            onClick={onDelete}
            className="w-fit flex items-center gap-[6px] text-[14px] font-semibold text-[#FF3B30] bg-white border border-[#FF3B30]/30 hover:border-[#FF3B30] hover:bg-[#FF3B30]/5 px-[16px] py-[8px] rounded-[10px] transition-all shadow-[0_2px_8px_rgba(255,59,48,0.05)]"
          >
            <Trash2 className="w-[18px] h-[18px]" /> Xóa sự kiện
          </button>
        )}
      </div>

      <form onSubmit={onSave} className="space-y-[28px]">
        <section className="bg-white p-[24px] md:p-[32px] rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-[#E5E5EA]">
          <h2 className="text-[18px] font-bold text-[#1C1C1E] mb-[24px]">Thông tin chung</h2>
          <div className="space-y-[20px]">
            <div>
              <label className="block text-[14px] font-medium text-[#1C1C1E] mb-[8px]">
                Tên sự kiện <span className="text-[#FF3B30]">*</span>
              </label>
              <input
                type="text"
                value={editingWorkshop.title}
                onChange={(event) => onWorkshopChange({ ...editingWorkshop, title: event.target.value })}
                required
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-[20px]">
              <div>
                <label className="block text-[14px] font-medium text-[#1C1C1E] mb-[8px]">
                  Đơn vị tổ chức / Diễn giả <span className="text-[#FF3B30]">*</span>
                </label>
                <input
                  type="text"
                  value={editingWorkshop.speaker}
                  onChange={(event) => onWorkshopChange({ ...editingWorkshop, speaker: event.target.value })}
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[14px] font-medium text-[#1C1C1E] mb-[8px]">
                  Phòng / Tòa nhà <span className="text-[#FF3B30]">*</span>
                </label>
                <input
                  type="text"
                  value={editingWorkshop.room}
                  onChange={(event) => onWorkshopChange({ ...editingWorkshop, room: event.target.value })}
                  required
                  placeholder="VD: Giảng đường 1, Tòa nhà I"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[20px]">
              <div>
                <label className="block text-[14px] font-medium text-[#1C1C1E] mb-[8px]">Ngày tổ chức</label>
                <input
                  type="text"
                  value={editingWorkshop.day}
                  onChange={(event) => onWorkshopChange({ ...editingWorkshop, day: event.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[14px] font-medium text-[#1C1C1E] mb-[8px]">Khung giờ</label>
                <input
                  type="text"
                  value={editingWorkshop.time}
                  onChange={(event) => onWorkshopChange({ ...editingWorkshop, time: event.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[14px] font-medium text-[#1C1C1E] mb-[8px]">Sức chứa</label>
                <input
                  type="number"
                  min={0}
                  value={editingWorkshop.capacity}
                  onChange={(event) => {
                    const nextCapacity = numberOrZero(event.currentTarget.valueAsNumber);
                    const booked = editingWorkshop.capacity - editingWorkshop.seatsRemaining;
                    onWorkshopChange({
                      ...editingWorkshop,
                      capacity: nextCapacity,
                      seatsRemaining: Math.max(nextCapacity - Math.max(booked, 0), 0)
                    });
                  }}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[14px] font-medium text-[#1C1C1E] mb-[8px]">Phí tham dự</label>
                <input
                  type="number"
                  min={0}
                  value={editingWorkshop.feeVnd}
                  onChange={(event) => {
                    const feeVnd = numberOrZero(event.currentTarget.valueAsNumber);
                    onWorkshopChange({ ...editingWorkshop, feeVnd, isFree: feeVnd === 0 });
                  }}
                  className={inputClass}
                />
                <p className="text-[12px] text-[#8E8E93] mt-[6px]">Để 0 nếu miễn phí</p>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white p-[24px] md:p-[32px] rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-[#E5E5EA]">
          <h2 className="text-[18px] font-bold text-[#1C1C1E] mb-[24px]">Tài liệu trực quan</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-[28px] md:gap-[32px]">
            <div>
              <label className="flex items-center gap-[8px] text-[15px] font-bold text-[#1C1C1E] mb-[8px]">
                <MonitorPlay className="w-[18px] h-[18px] text-[#007AFF]" /> Ảnh bìa sự kiện
              </label>
              {editingWorkshop.coverUrl ? (
                <div className="relative w-full aspect-video rounded-[16px] overflow-hidden border border-[#E5E5EA] bg-[#F9F9F9] group">
                  <img src={editingWorkshop.coverUrl} alt="Ảnh bìa sự kiện" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => onWorkshopChange({ ...editingWorkshop, coverUrl: '' })}
                      className="bg-white px-[16px] py-[8px] rounded-[8px] text-[#FF3B30] font-medium shadow-lg transition-transform hover:scale-105 flex items-center gap-[8px]"
                    >
                      <Trash2 className="w-[16px] h-[16px]" /> Đổi ảnh
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onUploadCover}
                  className="w-full aspect-video border-2 border-dashed border-[#E5E5EA] rounded-[16px] flex flex-col items-center justify-center text-[#8E8E93] hover:bg-[#F9F9F9] hover:border-[#007AFF] hover:text-[#007AFF] transition-colors"
                >
                  {isUploadingCover ? (
                    <Activity className="w-[28px] h-[28px] animate-spin mb-[12px]" />
                  ) : (
                    <>
                      <ImageIcon className="w-[32px] h-[32px] mb-[12px]" />
                      <span className="text-[14px] font-medium text-[#1C1C1E] mb-[4px]">Tải lên ảnh bìa</span>
                      <span className="text-[12px]">.JPG, .PNG (Max 5MB)</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <div>
              <label className="flex items-center gap-[8px] text-[15px] font-bold text-[#1C1C1E] mb-[8px]">
                <Map className="w-[18px] h-[18px] text-[#FF9500]" /> Sơ đồ tìm đường
              </label>
              {editingWorkshop.roomMapUrl ? (
                <div className="relative w-full aspect-video rounded-[16px] overflow-hidden border border-[#E5E5EA] bg-[#F9F9F9] group">
                  <img src={editingWorkshop.roomMapUrl} alt="Sơ đồ tìm đường" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => onWorkshopChange({ ...editingWorkshop, roomMapUrl: '' })}
                      className="bg-white px-[16px] py-[8px] rounded-[8px] text-[#FF3B30] font-medium shadow-lg transition-transform hover:scale-105 flex items-center gap-[8px]"
                    >
                      <Trash2 className="w-[16px] h-[16px]" /> Gỡ ảnh
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onUploadMap}
                  className="w-full aspect-video border-2 border-dashed border-[#E5E5EA] rounded-[16px] flex flex-col items-center justify-center text-[#8E8E93] hover:bg-[#F9F9F9] hover:border-[#FF9500] hover:text-[#FF9500] transition-colors"
                >
                  {isUploadingMap ? (
                    <Activity className="w-[28px] h-[28px] animate-spin mb-[12px]" />
                  ) : (
                    <>
                      <ImageIcon className="w-[32px] h-[32px] mb-[12px]" />
                      <span className="text-[14px] font-medium text-[#1C1C1E] mb-[4px]">Tải lên sơ đồ phòng</span>
                      <span className="text-[12px]">.JPG, .PNG (Max 5MB)</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="bg-gradient-to-br from-white to-[#F5F5FF] p-[24px] md:p-[32px] rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-[#5E5CE6]/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-[24px] opacity-10 pointer-events-none">
            <Sparkles className="w-[100px] h-[100px] text-[#5E5CE6]" />
          </div>

          <div className="relative z-10">
            <h2 className="text-[18px] font-bold text-[#1C1C1E] mb-[8px] flex items-center gap-[8px]">
              <Sparkles className="w-[20px] h-[20px] text-[#5E5CE6]" /> Tóm tắt nội dung tự động
            </h2>

            {tempSummary ? (
              <div className="bg-white border border-[#E5E5EA] rounded-[16px] p-[20px] shadow-sm mt-[20px]">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-[8px] mb-[12px]">
                  <span className="text-[12px] font-bold text-[#34C759] uppercase tracking-wide flex items-center gap-[4px]">
                    <CheckCircle2 className="w-[14px] h-[14px]" /> Đã tạo văn bản thành công
                  </span>
                  <button type="button" onClick={() => onSummaryChange('')} className="w-fit text-[#007AFF] text-[13px] font-medium">
                    Tải lại tệp khác
                  </button>
                </div>
                <textarea
                  value={tempSummary}
                  onChange={(event) => onSummaryChange(event.target.value)}
                  className="w-full min-h-[120px] text-[15px] text-[#1C1C1E] leading-relaxed resize-none focus:outline-none"
                />
              </div>
            ) : (
              <button
                type="button"
                className="w-full mt-[20px] border-2 border-dashed border-[#5E5CE6]/30 rounded-[16px] bg-white p-[32px] flex flex-col items-center justify-center text-center transition-all hover:border-[#5E5CE6] hover:bg-[#5E5CE6]/5"
                onClick={!isUploadingPDF && !isGeneratingAI ? onGenerateAI : undefined}
              >
                {isUploadingPDF ? (
                  <>
                    <Activity className="w-[32px] h-[32px] text-[#5E5CE6] animate-spin mb-[16px]" />
                    <p className="text-[15px] font-medium text-[#1C1C1E]">Đang tải tài liệu lên máy chủ...</p>
                  </>
                ) : isGeneratingAI ? (
                  <>
                    <Sparkles className="w-[32px] h-[32px] text-[#5E5CE6] animate-pulse mb-[16px]" />
                    <p className="text-[15px] font-medium text-[#1C1C1E]">Hệ thống AI đang đọc và phân tích...</p>
                  </>
                ) : (
                  <>
                    <div className="w-[48px] h-[48px] rounded-full bg-[#5E5CE6]/10 flex items-center justify-center mb-[16px]">
                      <UploadCloud className="w-[24px] h-[24px] text-[#5E5CE6]" />
                    </div>
                    <p className="text-[15px] font-medium text-[#1C1C1E] mb-[4px]">Nhấp hoặc kéo thả tệp PDF vào đây</p>
                    <p className="text-[13px] text-[#8E8E93]">Tài liệu PDF tối đa 5MB</p>
                  </>
                )}
              </button>
            )}
          </div>
        </section>

        <div className="bg-white p-[16px] md:p-[20px] rounded-[24px] shadow-[0_8px_30px_rgba(0,0,0,0.08)] border border-[#E5E5EA] flex flex-col md:flex-row md:items-center md:justify-between gap-[16px] sticky bottom-[74px] md:bottom-[24px] z-40">
          <div className="flex flex-col sm:flex-row sm:items-center gap-[10px] sm:gap-[12px]">
            <span className="text-[14px] font-medium text-[#1C1C1E]">Chế độ hiển thị:</span>
            <select
              value={editingWorkshop.status}
              onChange={(event) => onWorkshopChange({ ...editingWorkshop, status: event.target.value as WorkshopStatus })}
              className="bg-[#F2F2F7] border-none rounded-[10px] px-[16px] py-[10px] text-[14px] font-bold text-[#1C1C1E] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 cursor-pointer"
            >
              <option value="draft">Lưu nháp</option>
              <option value="published">Công khai</option>
            </select>
          </div>
          <div className="flex gap-[12px]">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 md:flex-none px-[24px] py-[12px] rounded-[12px] text-[15px] font-semibold text-[#1C1C1E] bg-[#F2F2F7] hover:bg-[#E5E5EA] transition-colors"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              className="flex-1 md:flex-none px-[32px] py-[12px] rounded-[12px] text-[15px] font-semibold text-white bg-[#007AFF] hover:bg-[#006DEB] transition-colors shadow-[0_4px_12px_rgba(0,122,255,0.3)]"
            >
              Lưu thay đổi
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function AdminPage() {
  const [currentView, setCurrentView] = useState<AdminView>('dashboard');
  const [workshops, setWorkshops] = useState<AdminWorkshop[]>(ADMIN_WORKSHOPS);
  const [editingWorkshop, setEditingWorkshop] = useState<AdminWorkshop | null>(null);
  const [isUploadingPDF, setIsUploadingPDF] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [tempSummary, setTempSummary] = useState('');
  const [isUploadingMap, setIsUploadingMap] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);

  const activeWorkshop = useMemo(() => editingWorkshop ?? createEmptyWorkshop(), [editingWorkshop]);

  const handleEdit = (workshop: AdminWorkshop) => {
    setEditingWorkshop(workshop);
    setTempSummary(workshop.aiSummary);
    setCurrentView('editor');
  };

  const handleCreateNew = () => {
    const emptyWorkshop = createEmptyWorkshop();
    setEditingWorkshop(emptyWorkshop);
    setTempSummary('');
    setCurrentView('editor');
  };

  const handleSimulateAI = () => {
    setIsUploadingPDF(true);
    window.setTimeout(() => {
      setIsUploadingPDF(false);
      setIsGeneratingAI(true);
      window.setTimeout(() => {
        setIsGeneratingAI(false);
        setTempSummary(
          'Đây là nội dung được AI tóm tắt tự động từ file PDF vừa tải lên. Hệ thống đã bóc tách các keyword chính như: Cấu trúc dữ liệu, Thuật toán, Ứng dụng thực tế.'
        );
      }, 2000);
    }, 1500);
  };

  const handleSimulateUploadMap = () => {
    setIsUploadingMap(true);
    window.setTimeout(() => {
      setIsUploadingMap(false);
      setEditingWorkshop((current) => (current ? { ...current, roomMapUrl: DEFAULT_ROOM_MAP_URL } : current));
    }, 1500);
  };

  const handleSimulateUploadCover = () => {
    setIsUploadingCover(true);
    window.setTimeout(() => {
      setIsUploadingCover(false);
      setEditingWorkshop((current) => (current ? { ...current, coverUrl: DEFAULT_COVER_URL } : current));
    }, 1500);
  };

  const handleSaveWorkshop = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!editingWorkshop) {
      return;
    }

    const normalizedWorkshop: AdminWorkshop = {
      ...editingWorkshop,
      capacity: Math.max(editingWorkshop.capacity, 0),
      seatsRemaining: Math.min(Math.max(editingWorkshop.seatsRemaining, 0), Math.max(editingWorkshop.capacity, 0)),
      isFree: editingWorkshop.feeVnd === 0,
      aiSummary: tempSummary
    };

    if (normalizedWorkshop.id.startsWith('new-')) {
      setWorkshops((current) => [...current, { ...normalizedWorkshop, id: `w${Date.now()}` }]);
    } else {
      setWorkshops((current) => current.map((workshop) => (workshop.id === normalizedWorkshop.id ? normalizedWorkshop : workshop)));
    }

    setEditingWorkshop(null);
    setCurrentView('workshops');
  };

  const handleDeleteWorkshop = () => {
    if (!editingWorkshop || editingWorkshop.id.startsWith('new-')) {
      setCurrentView('workshops');
      return;
    }

    setWorkshops((current) => current.filter((workshop) => workshop.id !== editingWorkshop.id));
    setEditingWorkshop(null);
    setCurrentView('workshops');
  };

  const handleNavigate = (view: AdminView) => {
    if (view !== 'editor') {
      setEditingWorkshop(null);
    }
    setCurrentView(view);
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] font-[system-ui,-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',sans-serif] flex">
      <Sidebar currentView={currentView} onNavigate={handleNavigate} />
      <MobileAdminNav currentView={currentView} onNavigate={handleNavigate} />
      <main className="flex-1 md:ml-[260px] p-[20px] md:p-[40px] overflow-y-auto min-h-screen pb-[96px]">
        {currentView === 'dashboard' && <DashboardView workshops={workshops} />}
        {currentView === 'workshops' && <WorkshopsView workshops={workshops} onCreateNew={handleCreateNew} onEdit={handleEdit} />}
        {currentView === 'editor' && (
          <EditorView
            editingWorkshop={activeWorkshop}
            isUploadingPDF={isUploadingPDF}
            isGeneratingAI={isGeneratingAI}
            isUploadingMap={isUploadingMap}
            isUploadingCover={isUploadingCover}
            tempSummary={tempSummary}
            onBack={() => setCurrentView('workshops')}
            onCancel={() => setCurrentView('workshops')}
            onDelete={handleDeleteWorkshop}
            onSave={handleSaveWorkshop}
            onUploadCover={handleSimulateUploadCover}
            onUploadMap={handleSimulateUploadMap}
            onGenerateAI={handleSimulateAI}
            onWorkshopChange={setEditingWorkshop}
            onSummaryChange={setTempSummary}
          />
        )}
      </main>
    </div>
  );
}
