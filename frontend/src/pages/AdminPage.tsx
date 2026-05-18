import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  CreditCard,
  Database,
  FileUp,
  Image as ImageIcon,
  LayoutDashboard,
  Loader2,
  LogOut,
  Map,
  MonitorPlay,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  TrendingUp,
  Users
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { MarkdownSummary } from '@/components/MarkdownSummary';
import { type WorkshopRow } from '@/types/workshop';

const STORAGE_BUCKET = 'workshop-assets';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type AdminView = 'dashboard' | 'workshops' | 'editor' | 'student-import';
type WorkshopStatus = 'draft' | 'published';
type ImportStatus = 'completed' | 'failed';
type SummaryStatus = 'idle' | 'processing' | 'completed' | 'failed';

interface AdminWorkshop {
  id: string;
  title: string;
  speaker: string;
  start_time: string;
  end_time: string;
  room: string;
  coverUrl: string;
  roomMapUrl: string;
  capacity: number;
  seatsRemaining: number;
  status: WorkshopStatus;
  isFree: boolean;
  feeVnd: number;
  aiSummary: string;
  summaryGeneratedAt: string | null;
  summaryStatus: SummaryStatus;
  summaryAttempts: number;
  summaryErrorCode: string;
  summaryErrorMessage: string;
}

function wsRowToAdmin(w: WorkshopRow): AdminWorkshop {
  return {
    id: w.id,
    title: w.title,
    speaker: w.speaker_name,
    start_time: w.start_time,
    end_time: w.end_time,
    room: w.room,
    coverUrl: w.cover_image_url ?? '',
    roomMapUrl: w.room_map_url ?? '',
    capacity: w.capacity,
    seatsRemaining: w.seats_remaining,
    status: w.is_published ? 'published' : 'draft',
    isFree: w.fee_vnd === 0,
    feeVnd: w.fee_vnd,
    aiSummary: w.summary_md ?? '',
    summaryGeneratedAt: w.summary_generated_at ?? null,
    summaryStatus: w.summary_status ?? (w.summary_md ? 'completed' : 'idle'),
    summaryAttempts: w.summary_attempts ?? 0,
    summaryErrorCode: w.summary_error_code ?? '',
    summaryErrorMessage: w.summary_error_message ?? '',
  };
}

function fmtDate(iso: string) {
  if (!iso) return 'Chưa có ngày';
  return new Date(iso).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function toDateInputValue(iso: string) {
  if (!iso) return '';
  const value = new Date(iso);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toTimeInputValue(iso: string) {
  if (!iso) return '';
  const value = new Date(iso);
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function toIsoFromLocalParts(dateValue: string, timeValue: string) {
  if (!dateValue) return '';
  const normalizedTime = timeValue || '00:00';
  return new Date(`${dateValue}T${normalizedTime}:00`).toISOString();
}

function formatFeeInput(value: number) {
  return Math.max(value, 0).toLocaleString('en-US');
}

function parseFeeInput(value: string) {
  const digitsOnly = value.replace(/[^\d]/g, '');
  return digitsOnly ? Number(digitsOnly) : 0;
}

interface CsvImportLog {
  id: string;
  source_file: string | null;
  source_date: string | null;
  started_at: string;
  finished_at: string | null;
  status: ImportStatus;
  imported_students: number;
  message: string | null;
}

interface StudentImportResult {
  source_file: string | null;
  source_date: string | null;
  status: 'completed' | 'skipped';
  finished_at: string;
  valid: number;
  created: number;
  updated: number;
  deactivated: number;
  skipped: number;
  errors: Array<{ row?: number; mssv: string; reason: string }>;
  message?: string;
}

interface AdminStatsWorkshop {
  id: string;
  title: string;
  room: string;
  start_time: string;
  end_time: string;
  visibility: 'published' | 'hidden' | 'cancelled';
  capacity: number;
  seats_remaining: number;
  confirmed: number;
  pending_payment: number;
  cancelled: number;
  expired: number;
  checkins: number;
  fill_rate: number | null;
  attendance_rate: number | null;
}

interface AdminStats {
  summary: {
    total_workshops: number;
    published_workshops: number;
    hidden_workshops: number;
    cancelled_workshops: number;
    total_capacity: number;
    seats_remaining: number;
    total_confirmed_registrations: number;
    total_pending_payments: number;
    total_checkins: number;
    fill_rate: number | null;
    attendance_rate: number | null;
  };
  workshopStats: AdminStatsWorkshop[];
  registrationTimeline: Array<{ hour: string; count: number }>;
  topWorkshops: AdminStatsWorkshop[];
  csvImport: {
    source_file: string | null;
    imported_at: string;
    imported_count: number;
    status: ImportStatus;
    message: string | null;
  } | null;
  generatedAt: string;
}


const inputClass =
  'w-full h-[48px] px-[16px] bg-[#F9F9F9] border border-[#E5E5EA] rounded-[12px] text-[15px] text-[#1C1C1E] focus:outline-none focus:border-[#007AFF] focus:bg-white transition-colors';

function numberOrZero(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Không thể kết nối backend.';
}

function formatImportTime(value: string | null): string {
  if (!value) return 'Chưa hoàn tất';
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date(value));
}

function getFileName(sourceFile: string | null): string {
  if (!sourceFile) return 'request-body';
  return sourceFile.split('/').pop() ?? sourceFile;
}

function fmtNumber(value: number): string {
  return value.toLocaleString('vi-VN');
}

function fmtPercent(value: number | null): string {
  return value === null ? '--' : `${value}%`;
}

function fmtShortDateTime(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(value));
}

function fmtFullDateTime(value: string | null): string {
  if (!value) return 'Chưa có';
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date(value));
}

function createEmptyWorkshop(): AdminWorkshop {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 9, 0).toISOString();
  const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 11, 0).toISOString();
  return {
    id: `new-${Date.now()}`,
    title: '',
    speaker: '',
    start_time: start,
    end_time: end,
    room: '',
    coverUrl: '',
    roomMapUrl: '',
    capacity: 100,
    seatsRemaining: 100,
    status: 'draft',
    isFree: true,
    feeVnd: 0,
    aiSummary: '',
    summaryGeneratedAt: null,
    summaryStatus: 'idle',
    summaryAttempts: 0,
    summaryErrorCode: '',
    summaryErrorMessage: ''
  };
}

interface SidebarProps {
  currentView: AdminView;
  onNavigate: (view: AdminView) => void;
  onLogout: () => void;
}

function Sidebar({ currentView, onNavigate, onLogout }: SidebarProps) {
  const isWorkshopActive = currentView === 'workshops' || currentView === 'editor';

  return (
    <aside className="w-[260px] bg-[#F9F9F9] border-r border-[#E5E5EA] h-screen fixed left-0 top-0 hidden md:flex flex-col z-20">
      <div className="h-[80px] flex items-center px-[24px] border-b border-[#E5E5EA] bg-white">
        <div className="font-bold text-[20px] tracking-tight text-[#1C1C1E] flex items-center gap-[12px]">
          <svg width="38" height="38" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" style={{fillRule:'evenodd',clipRule:'evenodd'}}>
            <rect x="0" y="0" width="1024" height="1024" fill="#007aff"/>
            <text x="86.147" y="464.329" style={{fontFamily:"'D-DIN-Bold','D-DIN',sans-serif",fontWeight:700,fontSize:'443.576px',fill:'#fff'}}>UNI</text>
            <text x="90.624" y="863.079" style={{fontFamily:"'D-DIN-Bold','D-DIN',sans-serif",fontWeight:700,fontSize:'443.576px',fill:'#fff'}}>HUB</text>
          </svg>
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
        <button
          type="button"
          onClick={() => onNavigate('student-import')}
          className={`w-full flex items-center gap-[12px] px-[16px] py-[12px] rounded-[12px] text-[15px] font-medium transition-all duration-200 ${
            currentView === 'student-import'
              ? 'bg-[#007AFF] text-white shadow-[0_4px_12px_rgba(0,122,255,0.25)]'
              : 'text-[#5C5C5E] hover:bg-[#007AFF]/10 hover:text-[#007AFF]'
          }`}
        >
          <Database className="w-[20px] h-[20px]" /> Nhập TT sinh viên
        </button>
      </nav>

      <div className="p-[20px] border-t border-[#E5E5EA] bg-white">
        <button
          type="button"
          onClick={onLogout}
          className="w-full min-h-[48px] flex items-center gap-[12px] px-[16px] py-[12px] rounded-[14px] text-[15px] font-semibold text-[#8E8E93] bg-[#F9F9F9] border border-[#E5E5EA] hover:text-[#FF3B30] hover:bg-[#FF3B30]/5 hover:border-[#FF3B30]/15 transition-colors"
        >
          <LogOut className="w-[18px] h-[18px]" />
          Đăng xuất
        </button>
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
      <button
        type="button"
        onClick={() => onNavigate('student-import')}
        className={`flex-1 h-[52px] flex flex-col items-center justify-center gap-[4px] text-[11px] font-semibold ${
          currentView === 'student-import' ? 'text-[#007AFF]' : 'text-[#8E8E93]'
        }`}
      >
        <Database className="w-[22px] h-[22px]" />
        Sinh viên
      </button>
    </nav>
  );
}

interface DashboardViewProps {
  stats: AdminStats;
  onRefresh: () => void;
  errorMessage: string | null;
  isRefreshing: boolean;
}

function DashboardView({ stats, onRefresh, errorMessage, isRefreshing }: DashboardViewProps) {
  const maxTimelineCount = Math.max(...stats.registrationTimeline.map((bucket) => bucket.count), 1);

  return (
    <div className="animate-in fade-in duration-300 max-w-[1200px]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[12px] mb-[28px]">
        <div>
          <h1 className="text-[28px] md:text-[32px] font-bold text-[#1C1C1E] tracking-tight">Thống kê hệ thống</h1>
          <p className="text-[13px] text-[#8E8E93] mt-[6px]">Tạo lúc {formatImportTime(stats.generatedAt)}</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="w-full sm:w-fit h-[44px] px-[14px] rounded-[12px] bg-white border border-[#E5E5EA] text-[14px] font-semibold text-[#007AFF] flex items-center justify-center gap-[8px] disabled:text-[#8E8E93]"
        >
          <RefreshCw className={`w-[17px] h-[17px] ${isRefreshing ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>

      {errorMessage && (
        <div className="mb-[20px] bg-[#FF3B30]/10 border border-[#FF3B30]/20 rounded-[16px] p-[16px] flex items-start gap-[10px] text-[#B42318]">
          <AlertTriangle className="w-[20px] h-[20px] shrink-0 mt-[1px]" />
          <p className="text-[14px] font-medium">{errorMessage}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-[20px] mb-[28px]">
        <div className="bg-white p-[20px] rounded-[20px] shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-[#E5E5EA] flex flex-col justify-between min-h-[132px]">
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-medium text-[#8E8E93]">Workshop</p>
            <div className="w-[32px] h-[32px] rounded-[8px] bg-[#34C759]/10 flex items-center justify-center">
              <CreditCard className="w-[16px] h-[16px] text-[#34C759]" />
            </div>
          </div>
          <div>
            <h3 className="text-[28px] font-bold text-[#1C1C1E] leading-none mb-[8px]">
              {fmtNumber(stats.summary.total_workshops)}
            </h3>
            <p className="text-[12px] text-[#34C759] font-medium flex items-center gap-[4px]">
              <TrendingUp className="w-[12px] h-[12px]" /> {fmtNumber(stats.summary.published_workshops)} đang mở
            </p>
          </div>
        </div>

        <div className="bg-white p-[20px] rounded-[20px] shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-[#E5E5EA] flex flex-col justify-between min-h-[132px]">
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-medium text-[#8E8E93]">Đăng ký xác nhận</p>
            <div className="w-[32px] h-[32px] rounded-[8px] bg-[#007AFF]/10 flex items-center justify-center">
              <Users className="w-[16px] h-[16px] text-[#007AFF]" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-[8px]">
              <h3 className="text-[28px] font-bold text-[#1C1C1E] leading-none mb-[8px]">
                {fmtNumber(stats.summary.total_confirmed_registrations)}
              </h3>
              <span className="text-[14px] text-[#8E8E93] font-medium">/ {fmtNumber(stats.summary.total_capacity)} chỗ</span>
            </div>
            <p className="text-[12px] text-[#FF9500] font-medium">
              {fmtNumber(stats.summary.total_pending_payments)} đang chờ thanh toán
            </p>
          </div>
        </div>

        <div className="bg-white p-[20px] rounded-[20px] shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-[#E5E5EA] flex flex-col justify-between min-h-[132px]">
          <div className="flex items-center justify-between relative z-10">
            <p className="text-[14px] font-medium text-[#8E8E93]">Tỷ lệ lấp đầy</p>
            <div className="w-[32px] h-[32px] rounded-[8px] bg-[#5E5CE6]/10 flex items-center justify-center">
              <Activity className="w-[16px] h-[16px] text-[#5E5CE6]" />
            </div>
          </div>
          <div className="relative z-10">
            <h3 className="text-[28px] font-bold text-[#1C1C1E] leading-none mb-[12px]">
              {fmtPercent(stats.summary.fill_rate)}
            </h3>
            <p className="text-[12px] text-[#8E8E93] font-medium">{fmtNumber(stats.summary.seats_remaining)} chỗ còn trống</p>
          </div>
        </div>

        <div className="bg-white p-[20px] rounded-[20px] shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-[#E5E5EA] flex flex-col justify-between min-h-[132px]">
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-medium text-[#8E8E93]">Check-in</p>
            <div className="w-[32px] h-[32px] rounded-[8px] bg-[#34C759]/10 flex items-center justify-center">
              <CheckCircle2 className="w-[16px] h-[16px] text-[#34C759]" />
            </div>
          </div>
          <div>
            <h3 className="text-[28px] font-bold text-[#1C1C1E] leading-none mb-[8px]">
              {fmtNumber(stats.summary.total_checkins)}
            </h3>
            <p className="text-[12px] text-[#8E8E93] font-medium">Tỷ lệ tham dự {fmtPercent(stats.summary.attendance_rate)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)] gap-[20px] mb-[28px]">
        <section className="bg-white rounded-[20px] border border-[#E5E5EA] shadow-[0_2px_12px_rgba(0,0,0,0.02)] overflow-hidden">
          <div className="px-[20px] py-[16px] border-b border-[#E5E5EA] bg-[#F9F9F9]">
            <h2 className="text-[17px] font-bold text-[#1C1C1E]">Lượt đăng ký theo giờ</h2>
          </div>
          <div className="p-[20px] space-y-[12px]">
            {stats.registrationTimeline.length === 0 ? (
              <p className="text-[14px] text-[#8E8E93] text-center py-[24px]">Chưa có dữ liệu đăng ký.</p>
            ) : stats.registrationTimeline.slice(-8).map((bucket) => (
              <div key={bucket.hour} className="grid grid-cols-[92px_minmax(0,1fr)_44px] items-center gap-[12px]">
                <span className="text-[13px] font-medium text-[#8E8E93]">{fmtShortDateTime(bucket.hour)}</span>
                <div className="h-[8px] bg-[#E5E5EA] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#007AFF] rounded-full"
                    style={{ width: `${Math.max((bucket.count / maxTimelineCount) * 100, 6)}%` }}
                  />
                </div>
                <span className="text-[13px] font-bold text-[#1C1C1E] text-right">{fmtNumber(bucket.count)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-[20px] border border-[#E5E5EA] shadow-[0_2px_12px_rgba(0,0,0,0.02)] overflow-hidden">
          <div className="px-[20px] py-[16px] border-b border-[#E5E5EA] bg-[#F9F9F9]">
            <h2 className="text-[17px] font-bold text-[#1C1C1E]">CSV import gần nhất</h2>
          </div>
          <div className="p-[20px]">
            {stats.csvImport ? (
              <div>
                <div className="flex items-center justify-between gap-[12px] mb-[18px]">
                  <div className="w-[40px] h-[40px] rounded-[10px] bg-[#007AFF]/10 flex items-center justify-center">
                    <Database className="w-[20px] h-[20px] text-[#007AFF]" />
                  </div>
                  <span className={`px-[10px] py-[5px] rounded-full text-[12px] font-bold ${
                    stats.csvImport.status === 'completed' ? 'bg-[#34C759]/10 text-[#1F7A3D]' : 'bg-[#FF3B30]/10 text-[#B42318]'
                  }`}>
                    {stats.csvImport.status === 'completed' ? 'Hoàn tất' : 'Lỗi'}
                  </span>
                </div>
                <p className="text-[24px] font-bold text-[#1C1C1E] leading-none mb-[8px]">
                  {fmtNumber(stats.csvImport.imported_count)}
                  <span className="text-[13px] text-[#8E8E93] font-medium ml-[6px]">sinh viên</span>
                </p>
                <p className="text-[13px] text-[#8E8E93] font-medium">{formatImportTime(stats.csvImport.imported_at)}</p>
                <p className="text-[13px] text-[#8E8E93] mt-[8px] truncate">{getFileName(stats.csvImport.source_file)}</p>
              </div>
            ) : (
              <p className="text-[14px] text-[#8E8E93] text-center py-[24px]">Chưa có log import.</p>
            )}
          </div>
        </section>
      </div>

      <h2 className="text-[20px] font-bold text-[#1C1C1E] mb-[16px]">Thống kê từng workshop</h2>
      <div className="bg-white rounded-[20px] border border-[#E5E5EA] shadow-[0_2px_12px_rgba(0,0,0,0.02)] overflow-hidden">
        {stats.workshopStats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-[48px] px-[24px] text-center">
            <div className="w-[56px] h-[56px] rounded-[16px] bg-[#F2F2F7] flex items-center justify-center mb-[16px]">
              <CreditCard className="w-[24px] h-[24px] text-[#C7C7CC]" />
            </div>
            <p className="text-[15px] font-semibold text-[#1C1C1E] mb-[6px]">Chưa có workshop nào</p>
            <p className="text-[13px] text-[#8E8E93]">Tạo workshop đầu tiên để xem số liệu tại đây.</p>
          </div>
        ) : stats.workshopStats.map((workshop) => {
          return (
            <div key={workshop.id} className="p-[20px] border-b border-[#F2F2F7] last:border-0 flex flex-col md:flex-row md:items-center md:justify-between gap-[14px]">
              <div className="flex-1 md:pr-[32px] min-w-0">
                <p className="text-[15px] font-semibold text-[#1C1C1E] mb-[8px] truncate">{workshop.title}</p>
                <div className="flex flex-col sm:flex-row sm:items-center gap-[10px] sm:gap-[12px] mb-[8px]">
                  <div className="h-[6px] w-full max-w-[300px] bg-[#E5E5EA] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${workshop.fill_rate !== null && workshop.fill_rate >= 100 ? 'bg-[#FF3B30]' : 'bg-[#007AFF]'}`}
                      style={{ width: `${Math.min(workshop.fill_rate ?? 0, 100)}%` }}
                    />
                  </div>
                  <span className="text-[13px] font-medium text-[#8E8E93]">
                    {fmtNumber(workshop.confirmed)}/{fmtNumber(workshop.capacity)} xác nhận
                  </span>
                </div>
                <p className="text-[13px] text-[#8E8E93] truncate">{workshop.room} · {fmtShortDateTime(workshop.start_time)}</p>
              </div>
              <div className="grid grid-cols-3 gap-[12px] md:min-w-[260px]">
                <div>
                  <p className="text-[12px] text-[#8E8E93] font-medium">Check-in</p>
                  <p className="text-[14px] text-[#1C1C1E] font-bold">{fmtNumber(workshop.checkins)}</p>
                </div>
                <div>
                  <p className="text-[12px] text-[#8E8E93] font-medium">Lấp đầy</p>
                  <p className="text-[14px] text-[#1C1C1E] font-bold">{fmtPercent(workshop.fill_rate)}</p>
                </div>
                <div>
                  <p className="text-[12px] text-[#8E8E93] font-medium">Tham dự</p>
                  <p className="text-[14px] text-[#1C1C1E] font-bold">{fmtPercent(workshop.attendance_rate)}</p>
                </div>
              </div>
              <div className="md:text-right">
                <span
                  className={`px-[10px] py-[4px] rounded-[6px] text-[12px] font-bold ${
                    workshop.visibility === 'published'
                      ? 'bg-[#34C759]/10 text-[#1F7A3D]'
                      : workshop.visibility === 'cancelled'
                        ? 'bg-[#FF3B30]/10 text-[#B42318]'
                        : 'bg-[#E5E5EA] text-[#8E8E93]'
                  }`}
                >
                  {workshop.visibility === 'published' ? 'Đang mở' : workshop.visibility === 'cancelled' ? 'Đã hủy' : 'Đang ẩn'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StudentImportView() {
  const [logs, setLogs] = useState<CsvImportLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<StudentImportResult | null>(null);

  const latestLog = logs[0];

  const loadLogs = async () => {
    setIsLoadingLogs(true);
    try {
      setLogs(await api.get<CsvImportLog[]>('/admin/csv-import/logs?limit=8'));
    } catch (error) {
      console.warn('Không thể tải log import:', error);
      setLogs([]);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    void loadLogs();
  }, []);

  const handleManualImport = async () => {
    setIsImporting(true);
    setErrorMessage(null);
    setLastResult(null);
    try {
      const result = await api.post<StudentImportResult>('/admin/csv-import', {});
      setLastResult(result);
      await loadLogs();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="animate-in fade-in duration-300 max-w-[1100px]">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-[18px] mb-[28px]">
        <div>
          <h1 className="text-[28px] md:text-[32px] font-bold text-[#1C1C1E] tracking-tight">Nhập TT sinh viên</h1>
          <p className="text-[15px] text-[#8E8E93] mt-[8px] max-w-[680px]">
            Import danh sách sinh viên từ file nightly CSV của hệ thống cũ.
          </p>
        </div>
        <button
          type="button"
          onClick={handleManualImport}
          disabled={isImporting}
          className="w-full sm:w-fit min-h-[48px] bg-[#007AFF] hover:bg-[#006DEB] disabled:bg-[#8E8E93] text-white px-[20px] py-[12px] rounded-[14px] font-semibold flex items-center justify-center gap-[8px] transition-colors shadow-[0_4px_12px_rgba(0,122,255,0.2)]"
        >
          <RefreshCw className={`w-[20px] h-[20px] ${isImporting ? 'animate-spin' : ''}`} />
          {isImporting ? 'Đang import...' : 'Import thủ công'}
        </button>
      </div>

      {errorMessage && (
        <div className="mb-[20px] bg-[#FF3B30]/10 border border-[#FF3B30]/20 rounded-[16px] p-[16px] flex items-start gap-[10px] text-[#B42318]">
          <AlertTriangle className="w-[20px] h-[20px] shrink-0 mt-[1px]" />
          <p className="text-[14px] font-medium">{errorMessage}</p>
        </div>
      )}

      {lastResult && (
        <div className={`mb-[20px] border rounded-[16px] p-[16px] flex items-start gap-[10px] ${
          lastResult.status === 'skipped'
            ? 'bg-[#FF9500]/10 border-[#FF9500]/20 text-[#9A5A00]'
            : 'bg-[#34C759]/10 border-[#34C759]/20 text-[#1F7A3D]'
        }`}>
          {lastResult.status === 'skipped' ? (
            <Clock3 className="w-[20px] h-[20px] shrink-0 mt-[1px]" />
          ) : (
            <CheckCircle2 className="w-[20px] h-[20px] shrink-0 mt-[1px]" />
          )}
          <div>
            <p className="text-[14px] font-bold">
              {lastResult.status === 'skipped'
                ? 'File đã được xử lý trước đó'
                : `Đã import ${lastResult.valid} sinh viên`}
            </p>
            <p className="text-[13px] mt-[2px]">
              {lastResult.status === 'skipped'
                ? 'Không chạy lại import.'
                : `Hoàn tất lúc ${formatImportTime(lastResult.finished_at)}.`}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-[20px] mb-[28px]">
        <section className="bg-white rounded-[20px] border border-[#E5E5EA] p-[20px] shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between mb-[24px]">
            <p className="text-[14px] font-medium text-[#8E8E93]">Lần import gần nhất</p>
            <div className="w-[32px] h-[32px] rounded-[8px] bg-[#007AFF]/10 flex items-center justify-center">
              <Database className="w-[16px] h-[16px] text-[#007AFF]" />
            </div>
          </div>
          <h2 className="text-[30px] font-bold text-[#1C1C1E] leading-none">
            {latestLog ? latestLog.imported_students.toLocaleString('vi-VN') : '--'}
          </h2>
          <p className="text-[13px] text-[#8E8E93] font-medium mt-[10px]">sinh viên được import</p>
        </section>

        <section className="bg-white rounded-[20px] border border-[#E5E5EA] p-[20px] shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between mb-[24px]">
            <p className="text-[14px] font-medium text-[#8E8E93]">Thời gian hoàn tất</p>
            <div className="w-[32px] h-[32px] rounded-[8px] bg-[#34C759]/10 flex items-center justify-center">
              <Clock3 className="w-[16px] h-[16px] text-[#34C759]" />
            </div>
          </div>
          <h2 className="text-[20px] font-bold text-[#1C1C1E] leading-snug">
            {latestLog ? formatImportTime(latestLog.finished_at ?? latestLog.started_at) : 'Chưa có log'}
          </h2>
          <p className="text-[13px] text-[#8E8E93] font-medium mt-[10px]">
            {latestLog ? getFileName(latestLog.source_file) : 'Chưa chạy import'}
          </p>
        </section>

        <section className="bg-white rounded-[20px] border border-[#E5E5EA] p-[20px] shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between mb-[24px]">
            <p className="text-[14px] font-medium text-[#8E8E93]">Trạng thái dữ liệu</p>
            <div className="w-[32px] h-[32px] rounded-[8px] bg-[#FF9500]/10 flex items-center justify-center">
              <CheckCircle2 className="w-[16px] h-[16px] text-[#FF9500]" />
            </div>
          </div>
          <h2 className="text-[20px] font-bold text-[#1C1C1E] leading-snug">
            {latestLog ? (latestLog.status === 'completed' ? 'Đã đồng bộ' : latestLog.status) : 'Đang chờ import'}
          </h2>
          <p className="text-[13px] text-[#8E8E93] font-medium mt-[10px]">
            {latestLog ? (latestLog.message ?? getFileName(latestLog.source_file)) : 'Không có log để hiển thị'}
          </p>
        </section>
      </div>

      <section className="bg-white rounded-[24px] border border-[#E5E5EA] overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
        <div className="px-[20px] md:px-[24px] py-[18px] border-b border-[#E5E5EA] bg-[#F9F9F9] flex items-center justify-between gap-[12px]">
          <h2 className="text-[17px] font-bold text-[#1C1C1E]">Log import gần đây</h2>
          <button
            type="button"
            onClick={() => void loadLogs()}
            disabled={isLoadingLogs}
            className="h-[40px] px-[12px] rounded-[10px] text-[13px] font-semibold text-[#007AFF] bg-white border border-[#E5E5EA] flex items-center gap-[6px] disabled:text-[#8E8E93]"
          >
            <RefreshCw className={`w-[16px] h-[16px] ${isLoadingLogs ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>

        <div className="divide-y divide-[#E5E5EA]">
          {isLoadingLogs ? (
            <div className="px-[24px] py-[40px] flex items-center justify-center gap-[10px] text-[#8E8E93]">
              <Activity className="w-[20px] h-[20px] animate-spin" />
              <span className="text-[14px] font-medium">Đang tải log import...</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="px-[24px] py-[40px] text-center">
              <p className="text-[15px] font-semibold text-[#1C1C1E]">Chưa có lần import nào</p>
              <p className="text-[13px] text-[#8E8E93] mt-[6px]">Bấm import thủ công để chạy file nightly CSV mới nhất.</p>
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="px-[20px] md:px-[24px] py-[18px] grid grid-cols-1 lg:grid-cols-12 gap-[12px] lg:items-center">
                <div className="lg:col-span-4 min-w-0">
                  <p className="text-[15px] font-semibold text-[#1C1C1E] truncate">{getFileName(log.source_file)}</p>
                  <p className="text-[13px] text-[#8E8E93] mt-[2px]">Import lúc {formatImportTime(log.finished_at ?? log.started_at)}</p>
                </div>
                <div className="lg:col-span-3">
                  <p className="text-[14px] font-bold text-[#1C1C1E]">{log.imported_students.toLocaleString('vi-VN')} sinh viên</p>
                  <p className="text-[12px] text-[#8E8E93] mt-[2px]">Nguồn nightly CSV</p>
                </div>
                <div className="lg:col-span-3">
                  <p className="text-[13px] text-[#8E8E93] truncate">{log.message ?? 'Đã ghi log tối giản'}</p>
                </div>
                <div className="lg:col-span-2 lg:text-right">
                  <span className={`inline-flex px-[10px] py-[5px] rounded-full text-[12px] font-bold ${
                    log.status === 'completed'
                      ? 'bg-[#34C759]/10 text-[#1F7A3D]'
                      : log.status === 'failed'
                        ? 'bg-[#FF3B30]/10 text-[#B42318]'
                        : 'bg-[#FF9500]/10 text-[#9A5A00]'
                  }`}>
                    {log.status === 'completed' ? 'Hoàn tất' : log.status === 'failed' ? 'Lỗi' : log.status}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
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
          {workshops.length === 0 && (
            <div className="px-[24px] py-[48px] text-center">
              <p className="text-[17px] font-semibold text-[#1C1C1E] mb-[8px]">Chưa có workshop nào</p>
              <p className="text-[14px] text-[#8E8E93]">Tạo workshop mới để bắt đầu.</p>
            </div>
          )}
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
                  <p className="text-[14px] text-[#1C1C1E] font-medium">{fmtDate(workshop.start_time)}</p>
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
  coverPreviewUrl: string;
  roomMapPreviewUrl: string;
  fileError: string | null;
  isSaving: boolean;
  onBack: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onCoverFileSelected: (file: File | null) => void;
  onRoomMapFileSelected: (file: File | null) => void;
  onSummaryPdfSelected: (file: File | null) => void;
  onClearCover: () => void;
  onClearRoomMap: () => void;
  onWorkshopChange: (workshop: AdminWorkshop) => void;
  summaryUploadError: string | null;
  isSummarizing: boolean;
}

function EditorView({
  editingWorkshop,
  coverPreviewUrl,
  roomMapPreviewUrl,
  fileError,
  isSaving,
  onBack,
  onCancel,
  onDelete,
  onSave,
  onCoverFileSelected,
  onRoomMapFileSelected,
  onSummaryPdfSelected,
  onClearCover,
  onClearRoomMap,
  onWorkshopChange,
  summaryUploadError,
  isSummarizing,
}: EditorViewProps) {
  const isNew = editingWorkshop.id.startsWith('new-');
  const canEditVisibility = isNew || editingWorkshop.status === 'draft';
  const startDate = toDateInputValue(editingWorkshop.start_time);
  const startTime = toTimeInputValue(editingWorkshop.start_time);
  const endDate = toDateInputValue(editingWorkshop.end_time);
  const endTime = toTimeInputValue(editingWorkshop.end_time);
  const attemptsRemaining = Math.max(3 - editingWorkshop.summaryAttempts, 0);
  const isSummaryProcessing = editingWorkshop.summaryStatus === 'processing' || isSummarizing;
  const isSummaryLimitReached = attemptsRemaining === 0 && !isSummaryProcessing;

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
                placeholder="VD: Workshop Nhập môn Machine Learning"
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
                  placeholder="VD: Khoa CNTT, TS. Nguyễn Văn A"
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-[20px]">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-[16px] rounded-[20px] border border-[#E5E5EA] bg-[#FCFCFD] p-[18px] lg:col-span-2">
                <div className="space-y-[12px]">
                  <div className="flex items-center gap-[8px]">
                    <div className="w-[32px] h-[32px] rounded-[10px] bg-[#007AFF]/10 flex items-center justify-center">
                      <CalendarRange className="w-[16px] h-[16px] text-[#007AFF]" />
                    </div>
                    <div>
                      <label className="block text-[14px] font-medium text-[#1C1C1E]">
                        Bắt đầu <span className="text-[#FF3B30]">*</span>
                      </label>
                      <p className="text-[12px] text-[#8E8E93]">Ngày và giờ khai mạc</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_130px] gap-[12px]">
                    <input
                      type="date"
                      value={startDate}
                      onChange={(event) =>
                        onWorkshopChange({
                          ...editingWorkshop,
                          start_time: toIsoFromLocalParts(event.target.value, startTime),
                        })}
                      required
                      className={inputClass}
                    />
                    <input
                      type="time"
                      value={startTime}
                      onChange={(event) =>
                        onWorkshopChange({
                          ...editingWorkshop,
                          start_time: toIsoFromLocalParts(startDate, event.target.value),
                        })}
                      required
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="space-y-[12px]">
                  <div className="flex items-center gap-[8px]">
                    <div className="w-[32px] h-[32px] rounded-[10px] bg-[#34C759]/10 flex items-center justify-center">
                      <Clock3 className="w-[16px] h-[16px] text-[#34C759]" />
                    </div>
                    <div>
                      <label className="block text-[14px] font-medium text-[#1C1C1E]">
                        Kết thúc <span className="text-[#FF3B30]">*</span>
                      </label>
                      <p className="text-[12px] text-[#8E8E93]">Ngày và giờ bế mạc</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_130px] gap-[12px]">
                    <input
                      type="date"
                      value={endDate}
                      onChange={(event) =>
                        onWorkshopChange({
                          ...editingWorkshop,
                          end_time: toIsoFromLocalParts(event.target.value, endTime),
                        })}
                      required
                      className={inputClass}
                    />
                    <input
                      type="time"
                      value={endTime}
                      onChange={(event) =>
                        onWorkshopChange({
                          ...editingWorkshop,
                          end_time: toIsoFromLocalParts(endDate, event.target.value),
                        })}
                      required
                      className={inputClass}
                    />
                  </div>
                </div>
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
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatFeeInput(editingWorkshop.feeVnd)}
                    onChange={(event) => {
                      const feeVnd = parseFeeInput(event.target.value);
                      onWorkshopChange({ ...editingWorkshop, feeVnd, isFree: feeVnd === 0 });
                    }}
                    className={`${inputClass} pr-[72px]`}
                  />
                  <span className="absolute right-[16px] top-1/2 -translate-y-1/2 text-[12px] font-semibold text-[#8E8E93]">
                    VNĐ
                  </span>
                </div>
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
              {coverPreviewUrl ? (
                <div className="relative w-full aspect-video rounded-[16px] overflow-hidden border border-[#E5E5EA] bg-[#F9F9F9] group">
                  <img src={coverPreviewUrl} alt="Ảnh bìa sự kiện" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button
                      type="button"
                      onClick={onClearCover}
                      className="bg-white px-[16px] py-[8px] rounded-[8px] text-[#FF3B30] font-medium shadow-lg transition-transform hover:scale-105 flex items-center gap-[8px]"
                    >
                      <Trash2 className="w-[16px] h-[16px]" /> Đổi ảnh
                    </button>
                  </div>
                </div>
              ) : (
                <label className="w-full aspect-video border-2 border-dashed border-[#E5E5EA] rounded-[16px] flex flex-col items-center justify-center text-[#8E8E93] hover:bg-[#F9F9F9] hover:border-[#007AFF] hover:text-[#007AFF] transition-colors cursor-pointer">
                  <ImageIcon className="w-[32px] h-[32px] mb-[12px]" />
                  <span className="text-[14px] font-medium text-[#1C1C1E] mb-[4px]">Tải lên ảnh bìa</span>
                  <span className="text-[12px]">.JPG, .PNG, .WEBP (Max 5MB)</span>
                  <input
                    type="file"
                    accept={ALLOWED_IMAGE_TYPES.join(',')}
                    className="hidden"
                    onChange={(event) => onCoverFileSelected(event.target.files?.[0] ?? null)}
                  />
                </label>
              )}
            </div>

            <div>
              <label className="flex items-center gap-[8px] text-[15px] font-bold text-[#1C1C1E] mb-[8px]">
                <Map className="w-[18px] h-[18px] text-[#FF9500]" /> Sơ đồ tìm đường
              </label>
              {roomMapPreviewUrl ? (
                <div className="relative w-full aspect-video rounded-[16px] overflow-hidden border border-[#E5E5EA] bg-[#F9F9F9] group">
                  <img src={roomMapPreviewUrl} alt="Sơ đồ tìm đường" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button
                      type="button"
                      onClick={onClearRoomMap}
                      className="bg-white px-[16px] py-[8px] rounded-[8px] text-[#FF3B30] font-medium shadow-lg transition-transform hover:scale-105 flex items-center gap-[8px]"
                    >
                      <Trash2 className="w-[16px] h-[16px]" /> Gỡ ảnh
                    </button>
                  </div>
                </div>
              ) : (
                <label className="w-full aspect-video border-2 border-dashed border-[#E5E5EA] rounded-[16px] flex flex-col items-center justify-center text-[#8E8E93] hover:bg-[#F9F9F9] hover:border-[#FF9500] hover:text-[#FF9500] transition-colors cursor-pointer">
                  <ImageIcon className="w-[32px] h-[32px] mb-[12px]" />
                  <span className="text-[14px] font-medium text-[#1C1C1E] mb-[4px]">Tải lên sơ đồ phòng</span>
                  <span className="text-[12px]">.JPG, .PNG, .WEBP (Max 5MB)</span>
                  <input
                    type="file"
                    accept={ALLOWED_IMAGE_TYPES.join(',')}
                    className="hidden"
                    onChange={(event) => onRoomMapFileSelected(event.target.files?.[0] ?? null)}
                  />
                </label>
              )}
            </div>
          </div>
          {fileError && (
            <p className="text-[13px] text-[#FF3B30] mt-[16px]">{fileError}</p>
          )}
        </section>

        <section className="bg-white p-[24px] md:p-[32px] rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-[#E5E5EA]">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-[18px] mb-[22px]">
            <div className="min-w-0">
              <div className="flex items-center gap-[8px] mb-[8px]">
                <Sparkles className="w-[18px] h-[18px] text-[#5E5CE6]" />
                <h2 className="text-[18px] font-bold text-[#1C1C1E]">AI Summary</h2>
              </div>
              <p className="text-[13px] text-[#8E8E93] leading-relaxed">
                Upload PDF tối đa 5MB. Kết quả được cache vào workshop và hiển thị trên trang sinh viên.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-[10px]">
              <span className={`min-h-[32px] px-[10px] py-[6px] rounded-full text-[12px] font-bold inline-flex items-center justify-center ${
                editingWorkshop.summaryStatus === 'completed'
                  ? 'bg-[#34C759]/10 text-[#1F7A3D]'
                  : editingWorkshop.summaryStatus === 'failed'
                    ? 'bg-[#FF3B30]/10 text-[#B42318]'
                    : editingWorkshop.summaryStatus === 'processing'
                      ? 'bg-[#FF9500]/10 text-[#9A5A00]'
                      : 'bg-[#E5E5EA] text-[#636366]'
              }`}>
                {editingWorkshop.summaryStatus === 'completed'
                  ? 'Đã tóm tắt'
                  : editingWorkshop.summaryStatus === 'failed'
                    ? 'Có lỗi'
                    : editingWorkshop.summaryStatus === 'processing'
                      ? 'Đang xử lý'
                      : 'Chưa có'}
              </span>
              <label className={`min-h-[44px] px-[16px] py-[10px] rounded-[12px] text-[14px] font-semibold flex items-center justify-center gap-[8px] transition-colors ${
                isNew || isSummaryLimitReached || isSummaryProcessing
                  ? 'bg-[#E5E5EA] text-[#8E8E93] cursor-not-allowed'
                  : 'bg-[#5E5CE6] text-white hover:bg-[#4D4BCF] cursor-pointer shadow-[0_4px_12px_rgba(94,92,230,0.22)]'
              }`}>
                {isSummaryProcessing ? <Loader2 className="w-[18px] h-[18px] animate-spin" /> : <FileUp className="w-[18px] h-[18px]" />}
                {isSummaryProcessing ? 'Đang tóm tắt...' : editingWorkshop.aiSummary ? 'Tóm tắt lại' : 'Upload PDF'}
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  disabled={isNew || isSummaryLimitReached || isSummaryProcessing}
                  onChange={(event) => {
                    onSummaryPdfSelected(event.target.files?.[0] ?? null);
                    event.currentTarget.value = '';
                  }}
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-[12px] mb-[18px]">
            <div className="rounded-[14px] bg-[#F9F9F9] border border-[#E5E5EA] p-[14px]">
              <p className="text-[12px] text-[#8E8E93] font-semibold mb-[4px]">Số lần đã dùng</p>
              <p className="text-[18px] font-bold text-[#1C1C1E]">{editingWorkshop.summaryAttempts}/3</p>
            </div>
            <div className="rounded-[14px] bg-[#F9F9F9] border border-[#E5E5EA] p-[14px]">
              <p className="text-[12px] text-[#8E8E93] font-semibold mb-[4px]">Còn lại</p>
              <p className="text-[18px] font-bold text-[#1C1C1E]">{attemptsRemaining}</p>
            </div>
            <div className="rounded-[14px] bg-[#F9F9F9] border border-[#E5E5EA] p-[14px]">
              <p className="text-[12px] text-[#8E8E93] font-semibold mb-[4px]">Cập nhật</p>
              <p className="text-[14px] font-bold text-[#1C1C1E]">{fmtFullDateTime(editingWorkshop.summaryGeneratedAt)}</p>
            </div>
          </div>

          {isNew && (
            <div className="rounded-[14px] bg-[#FF9500]/10 border border-[#FF9500]/20 p-[14px] mb-[16px] flex items-start gap-[10px]">
              <AlertTriangle className="w-[18px] h-[18px] text-[#9A5A00] shrink-0 mt-[1px]" />
              <p className="text-[13px] text-[#7A4B00] leading-relaxed">Lưu workshop trước, sau đó upload PDF để tạo AI Summary.</p>
            </div>
          )}

          {(summaryUploadError || editingWorkshop.summaryErrorMessage) && (
            <div className="rounded-[14px] bg-[#FF3B30]/10 border border-[#FF3B30]/20 p-[14px] mb-[16px] flex items-start gap-[10px]">
              <AlertTriangle className="w-[18px] h-[18px] text-[#B42318] shrink-0 mt-[1px]" />
              <p className="text-[13px] text-[#B42318] leading-relaxed">
                {summaryUploadError ?? editingWorkshop.summaryErrorMessage}
                {editingWorkshop.summaryErrorCode ? ` (${editingWorkshop.summaryErrorCode})` : ''}
              </p>
            </div>
          )}

          {editingWorkshop.aiSummary ? (
            <div className="rounded-[16px] bg-[#F7F7FF] border border-[#5E5CE6]/15 p-[18px]">
              <MarkdownSummary content={editingWorkshop.aiSummary} compact />
            </div>
          ) : (
            <div className="rounded-[16px] bg-[#F9F9F9] border border-dashed border-[#D1D1D6] p-[22px] text-center">
              <p className="text-[14px] font-semibold text-[#3A3A3C]">Chưa có bản tóm tắt</p>
              <p className="text-[12px] text-[#8E8E93] mt-[4px]">Sau khi pipeline hoàn tất, bản tóm tắt sẽ xuất hiện tại đây.</p>
            </div>
          )}
        </section>

        <div className="bg-white p-[16px] md:p-[20px] rounded-[24px] shadow-[0_8px_30px_rgba(0,0,0,0.08)] border border-[#E5E5EA] flex flex-col md:flex-row md:items-center md:justify-between gap-[16px] sticky bottom-[74px] md:bottom-[24px] z-40">
          <div className="flex flex-col sm:flex-row sm:items-center gap-[10px] sm:gap-[12px]">
            <div>
              <span className="block text-[14px] font-medium text-[#1C1C1E]">Hiển thị với sinh viên</span>
              <p className="text-[12px] text-[#8E8E93] mt-[2px]">Workshop vẫn được lưu trong hệ thống.</p>
            </div>
            {canEditVisibility ? (
              <select
                value={editingWorkshop.status}
                onChange={(event) => onWorkshopChange({ ...editingWorkshop, status: event.target.value as WorkshopStatus })}
                className="bg-[#F2F2F7] border-none rounded-[10px] px-[16px] py-[10px] text-[14px] font-bold text-[#1C1C1E] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 cursor-pointer"
              >
                <option value="draft">Ẩn khỏi trang sinh viên</option>
                <option value="published">Mở đăng ký ngay</option>
              </select>
            ) : (
              <span className="inline-flex items-center px-[12px] py-[10px] rounded-[10px] bg-[#34C759]/10 text-[14px] font-bold text-[#1F7A3D]">
                Đang mở đăng ký
              </span>
            )}
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
              disabled={isSaving}
              className="flex-1 md:flex-none px-[32px] py-[12px] rounded-[12px] text-[15px] font-semibold text-white bg-[#007AFF] hover:bg-[#006DEB] transition-colors shadow-[0_4px_12px_rgba(0,122,255,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return 'Chỉ chấp nhận JPEG, PNG hoặc WebP.';
  if (file.size > MAX_IMAGE_BYTES) return 'Ảnh vượt quá 5MB.';
  return null;
}

function validatePdfFile(file: File): string | null {
  const hasPdfName = file.name.toLowerCase().endsWith('.pdf');
  if (file.type && file.type !== 'application/pdf') return 'Chỉ chấp nhận file PDF.';
  if (!hasPdfName) return 'File phải có đuôi .pdf.';
  if (file.size > MAX_PDF_BYTES) return 'PDF vượt quá 5MB.';
  return null;
}

interface SummaryStartResult {
  workshop_id: string;
  status: 'processing';
  attempts_used: number;
  attempts_remaining: number;
}

async function uploadWorkshopAsset(
  workshopId: string,
  slot: 'cover' | 'room-map',
  file: File,
  accessToken: string,
): Promise<string> {
  const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
  const path = `${workshopId}/${slot}.${ext}`;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${STORAGE_BUCKET}/${path}`;

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'apikey': anonKey,
      'Content-Type': file.type,
      'x-upsert': 'true',
    },
    body: file,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Tải ảnh thất bại: ${body}`);
  }

  return `${supabaseUrl}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
}

export function AdminPage() {
  const { logout, session } = useAuth();
  const navigate = useNavigate();
  const [currentView, setCurrentView] = useState<AdminView>('dashboard');
  const [workshops, setWorkshops] = useState<AdminWorkshop[]>([]);
  const [wsLoading, setWsLoading] = useState(true);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [editingWorkshop, setEditingWorkshop] = useState<AdminWorkshop | null>(null);
  const [pendingCoverFile, setPendingCoverFile] = useState<File | null>(null);
  const [pendingRoomMapFile, setPendingRoomMapFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [summaryUploadError, setSummaryUploadError] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const activeWorkshop = useMemo(() => editingWorkshop ?? createEmptyWorkshop(), [editingWorkshop]);

  const pendingCoverPreviewUrl = useMemo(
    () => (pendingCoverFile ? URL.createObjectURL(pendingCoverFile) : null),
    [pendingCoverFile],
  );
  const pendingRoomMapPreviewUrl = useMemo(
    () => (pendingRoomMapFile ? URL.createObjectURL(pendingRoomMapFile) : null),
    [pendingRoomMapFile],
  );
  useEffect(() => {
    return () => { if (pendingCoverPreviewUrl) URL.revokeObjectURL(pendingCoverPreviewUrl); };
  }, [pendingCoverPreviewUrl]);
  useEffect(() => {
    return () => { if (pendingRoomMapPreviewUrl) URL.revokeObjectURL(pendingRoomMapPreviewUrl); };
  }, [pendingRoomMapPreviewUrl]);

  const coverPreviewUrl = pendingCoverPreviewUrl ?? activeWorkshop.coverUrl;
  const roomMapPreviewUrl = pendingRoomMapPreviewUrl ?? activeWorkshop.roomMapUrl;

  const loadWorkshops = useCallback(async () => {
    setWsLoading(true);
    try {
      const rows = await api.get<WorkshopRow[]>('/workshops');
      const mapped = rows.map(wsRowToAdmin);
      setWorkshops(mapped);
      setEditingWorkshop((current) => {
        if (!current || current.id.startsWith('new-')) return current;
        return mapped.find(workshop => workshop.id === current.id) ?? current;
      });
    } catch {
      // silently keep empty — error shown in view
    } finally {
      setWsLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      setStats(await api.get<AdminStats>('/admin/stats'));
    } catch (error) {
      setStatsError(getErrorMessage(error));
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkshops();
    void loadStats();
  }, [loadStats, loadWorkshops]);

  useEffect(() => {
    const channel = supabase
      .channel('admin-workshop-summary')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'workshops' },
        () => { void loadWorkshops(); },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadWorkshops]);

  useEffect(() => {
    if (!workshops.some(workshop => workshop.summaryStatus === 'processing')) return undefined;
    const timer = window.setInterval(() => { void loadWorkshops(); }, 3_000);
    return () => window.clearInterval(timer);
  }, [loadWorkshops, workshops]);

  const resetEditorState = () => {
    setPendingCoverFile(null);
    setPendingRoomMapFile(null);
    setFileError(null);
    setSummaryUploadError(null);
  };

  const handleEdit = (workshop: AdminWorkshop) => {
    setEditingWorkshop(workshop);
    resetEditorState();
    setCurrentView('editor');
  };

  const handleCreateNew = () => {
    setEditingWorkshop(createEmptyWorkshop());
    resetEditorState();
    setCurrentView('editor');
  };

  const handleCoverFileSelected = (file: File | null) => {
    setFileError(null);
    if (!file) { setPendingCoverFile(null); return; }
    const err = validateImageFile(file);
    if (err) { setFileError(err); return; }
    setPendingCoverFile(file);
  };

  const handleRoomMapFileSelected = (file: File | null) => {
    setFileError(null);
    if (!file) { setPendingRoomMapFile(null); return; }
    const err = validateImageFile(file);
    if (err) { setFileError(err); return; }
    setPendingRoomMapFile(file);
  };

  const handleSummaryPdfSelected = async (file: File | null) => {
    setSummaryUploadError(null);
    if (!file || !editingWorkshop) return;

    if (editingWorkshop.id.startsWith('new-')) {
      setSummaryUploadError('Lưu workshop trước khi upload PDF.');
      return;
    }

    const err = validatePdfFile(file);
    if (err) {
      setSummaryUploadError(err);
      return;
    }

    setIsSummarizing(true);
    setEditingWorkshop((current) => current ? { ...current, summaryStatus: 'processing' } : current);
    try {
      const result = await api.post<SummaryStartResult>(
        `/workshops/${editingWorkshop.id}/summary`,
        file,
        { 'Content-Type': 'application/pdf' },
      );
      setEditingWorkshop((current) => current ? {
        ...current,
        summaryStatus: result.status,
        summaryAttempts: result.attempts_used,
      } : current);
      await loadWorkshops();
    } catch (error) {
      setSummaryUploadError(getErrorMessage(error));
      await loadWorkshops();
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleClearCover = () => {
    setPendingCoverFile(null);
    setEditingWorkshop((current) => (current ? { ...current, coverUrl: '' } : current));
  };

  const handleClearRoomMap = () => {
    setPendingRoomMapFile(null);
    setEditingWorkshop((current) => (current ? { ...current, roomMapUrl: '' } : current));
  };

  const handleSaveWorkshop = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingWorkshop || isSaving) return;

    setIsSaving(true);
    setFileError(null);

    const isNew = editingWorkshop.id.startsWith('new-');
    const basePayload = {
      title:        editingWorkshop.title,
      speaker_name: editingWorkshop.speaker,
      room:         editingWorkshop.room,
      start_time:   editingWorkshop.start_time,
      end_time:     editingWorkshop.end_time,
      capacity:     Math.max(editingWorkshop.capacity, 1),
      fee_vnd:      Math.max(editingWorkshop.feeVnd, 0),
    };

    try {
      let saved: WorkshopRow;
      if (isNew) {
        saved = await api.post<WorkshopRow>('/workshops', basePayload);
      } else {
        saved = await api.patch<WorkshopRow>(`/workshops/${editingWorkshop.id}`, basePayload);
      }

      const assetPatch: Record<string, string> = {};
      if (pendingCoverFile) {
        assetPatch.cover_image_url = await uploadWorkshopAsset(saved.id, 'cover', pendingCoverFile, session?.access_token ?? '');
      } else if (!isNew && editingWorkshop.coverUrl && editingWorkshop.coverUrl !== '') {
        // keep existing — no action needed
      }
      if (pendingRoomMapFile) {
        assetPatch.room_map_url = await uploadWorkshopAsset(saved.id, 'room-map', pendingRoomMapFile, session?.access_token ?? '');
      }
      if (Object.keys(assetPatch).length > 0) {
        saved = await api.patch<WorkshopRow>(`/workshops/${saved.id}`, assetPatch);
      }

      if (editingWorkshop.status === 'published') {
        try {
          saved = await api.patch<WorkshopRow>(`/workshops/${saved.id}/publish`, {});
        } catch { /* already published or cancelled */ }
      }

      resetEditorState();
      await Promise.all([loadWorkshops(), loadStats()]);
      setEditingWorkshop(null);
      setCurrentView('workshops');
    } catch (err) {
      const e = err as { message?: string };
      alert(e.message ?? 'Lưu workshop thất bại.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteWorkshop = async () => {
    if (!editingWorkshop || editingWorkshop.id.startsWith('new-')) {
      setCurrentView('workshops');
      return;
    }
    try {
      await api.delete<WorkshopRow>(`/workshops/${editingWorkshop.id}`);
    } catch {
      // best-effort — reload anyway
    }
    resetEditorState();
    await Promise.all([loadWorkshops(), loadStats()]);
    setEditingWorkshop(null);
    setCurrentView('workshops');
  };

  const handleNavigate = (view: AdminView) => {
    if (view !== 'editor') {
      setEditingWorkshop(null);
      resetEditorState();
    }
    setCurrentView(view);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] font-[system-ui,-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',sans-serif] flex">
      <Sidebar currentView={currentView} onNavigate={handleNavigate} onLogout={handleLogout} />
      <MobileAdminNav currentView={currentView} onNavigate={handleNavigate} />
      <main className="flex-1 md:ml-[260px] p-[20px] md:p-[40px] overflow-y-auto min-h-screen pb-[96px]">
        {currentView === 'dashboard' && (statsLoading && !stats ? (
          <div className="flex justify-center py-[80px]">
            <div className="w-8 h-8 border-4 border-[#007AFF] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : stats ? (
          <DashboardView
            stats={stats}
            onRefresh={() => void loadStats()}
            errorMessage={statsError}
            isRefreshing={statsLoading}
          />
        ) : (
          <div className="max-w-[900px] bg-[#FF3B30]/10 border border-[#FF3B30]/20 rounded-[16px] p-[16px] flex items-start gap-[10px] text-[#B42318]">
            <AlertTriangle className="w-[20px] h-[20px] shrink-0 mt-[1px]" />
            <p className="text-[14px] font-medium">{statsError ?? 'Không tải được thống kê.'}</p>
          </div>
        ))}
        {currentView === 'workshops' && (wsLoading ? (
          <div className="flex justify-center py-[80px]">
            <div className="w-8 h-8 border-4 border-[#007AFF] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : <WorkshopsView workshops={workshops} onCreateNew={handleCreateNew} onEdit={handleEdit} />)}
        {currentView === 'student-import' && <StudentImportView />}
        {currentView === 'editor' && (
          <EditorView
            editingWorkshop={activeWorkshop}
            coverPreviewUrl={coverPreviewUrl}
            roomMapPreviewUrl={roomMapPreviewUrl}
            fileError={fileError}
            isSaving={isSaving}
            onBack={() => setCurrentView('workshops')}
            onCancel={() => setCurrentView('workshops')}
            onDelete={handleDeleteWorkshop}
            onSave={handleSaveWorkshop}
            onCoverFileSelected={handleCoverFileSelected}
            onRoomMapFileSelected={handleRoomMapFileSelected}
            onSummaryPdfSelected={handleSummaryPdfSelected}
            onClearCover={handleClearCover}
            onClearRoomMap={handleClearRoomMap}
            onWorkshopChange={setEditingWorkshop}
            summaryUploadError={summaryUploadError}
            isSummarizing={isSummarizing}
          />
        )}
      </main>
    </div>
  );
}
