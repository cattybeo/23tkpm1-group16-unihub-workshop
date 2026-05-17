import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Home,
  Keyboard,
  LogOut,
  MapPin,
  QrCode,
  RefreshCw,
  Search,
  Settings,
  User,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import {
  clearStaffQueue,
  listPendingCheckIns,
  removePendingCheckIns,
  savePendingCheckIn,
} from '@/lib/staff-storage';
import type {
  OfflineCheckInRecord,
  ScanFeedback,
  StaffStudent,
  StaffWorkshop,
  SyncStatus,
} from '@/types/staff';

const STAFF_CAMERA_REGION_ID = 'unihub-staff-camera';
const CURRENT_TIME_MINUTES = 10 * 60 + 30;

const WORKSHOPS_TODAY: StaffWorkshop[] = [
  {
    id: 'w1',
    title: 'Talkshow: Lộ trình Kỹ sư Phần mềm',
    room: 'Hội trường T',
    startTime: '08:00',
    endTime: '10:00',
    capacity: 350,
    registered: 350,
  },
  {
    id: 'w2',
    title: 'Seminar: Tối ưu hoá Hệ thống phân tán',
    room: 'Giảng đường 1, Tòa nhà I',
    startTime: '09:30',
    endTime: '11:30',
    capacity: 150,
    registered: 142,
  },
  {
    id: 'w3',
    title: 'Chuỗi Kỹ năng: Viết CV và Phỏng vấn',
    room: 'Phòng Lab C.31',
    startTime: '13:30',
    endTime: '16:30',
    capacity: 100,
    registered: 80,
  },
];

const INITIAL_STUDENTS: StaffStudent[] = [
  { mssv: '21127001', name: 'Nguyễn Văn An', status: 'confirmed' },
  { mssv: '21127002', name: 'Trần Thị Bình', status: 'confirmed' },
  { mssv: '21127003', name: 'Lê Hoàng Cường', status: 'pending_payment' },
  { mssv: '21127004', name: 'Phạm Đức Dũng', status: 'confirmed' },
  { mssv: '22127005', name: 'Hoàng Thanh E', status: 'confirmed' },
];

const DEMO_QR_TOKENS: Record<string, { mssv: string; name: string; workshopId: string }> = {
  'qr-an-w2-demo': { mssv: '21127001', name: 'Nguyễn Văn An', workshopId: 'w2' },
  'qr-binh-w2-demo': { mssv: '21127002', name: 'Trần Thị Bình', workshopId: 'w2' },
  'qr-dung-w3-demo': { mssv: '21127004', name: 'Phạm Đức Dũng', workshopId: 'w3' },
};

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function createOfflineRecord(qrToken: string, workshopId: string): OfflineCheckInRecord {
  return {
    client_id: crypto.randomUUID(),
    qr_token: qrToken,
    workshop_id: workshopId,
    scanned_at: new Date().toISOString(),
    status: 'pending',
  };
}

function formatScanTime() {
  return new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

export function StaffPage() {
  const { profile, logout } = useAuth();
  const [mainTab, setMainTab] = useState<'home' | 'settings'>('home');
  const [activeStation, setActiveStation] = useState<StaffWorkshop | null>(null);
  const [stationTab, setStationTab] = useState<'scan' | 'lookup' | 'sync'>('scan');
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [syncQueue, setSyncQueue] = useState<OfflineCheckInRecord[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [scannedToday, setScannedToday] = useState(0);
  const [scanFeedback, setScanFeedback] = useState<ScanFeedback>({ status: 'idle' });
  const [searchQuery, setSearchQuery] = useState('');
  const [localStudents, setLocalStudents] = useState<StaffStudent[]>(INITIAL_STUDENTS);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualToken, setManualToken] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const lastScanRef = useRef('');
  const syncInFlightRef = useRef(false);

  const reloadQueue = useCallback(async () => {
    const records = await listPendingCheckIns();
    setSyncQueue(records.filter(record => record.status === 'pending'));
  }, []);

  const syncPendingRecords = useCallback(async () => {
    if (syncInFlightRef.current) return;
    if (!navigator.onLine) {
      setSyncStatus('error');
      return;
    }

    syncInFlightRef.current = true;
    setSyncStatus('syncing');

    try {
      const records = await listPendingCheckIns();
      const pendingRecords = records.filter(record => record.status === 'pending');

      if (pendingRecords.length === 0) {
        setSyncQueue([]);
        setSyncStatus('idle');
        return;
      }

      await new Promise(resolve => window.setTimeout(resolve, 500));
      await removePendingCheckIns(pendingRecords.map(record => record.client_id));
      setSyncQueue([]);
      setSyncStatus('success');
    } catch {
      setSyncStatus('error');
    } finally {
      syncInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    void reloadQueue();
  }, [reloadQueue]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void syncPendingRecords();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus('idle');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncPendingRecords]);

  useEffect(() => {
    if (scanFeedback.status === 'idle') return undefined;
    const timeoutId = window.setTimeout(() => {
      setScanFeedback({ status: 'idle' });
      lastScanRef.current = '';
    }, 2200);
    return () => window.clearTimeout(timeoutId);
  }, [scanFeedback]);

  const categorizedWorkshops = useMemo(() => {
    const ongoing: StaffWorkshop[] = [];
    const upcoming: StaffWorkshop[] = [];
    const ended: StaffWorkshop[] = [];

    WORKSHOPS_TODAY.forEach(workshop => {
      const start = timeToMinutes(workshop.startTime);
      const end = timeToMinutes(workshop.endTime);

      if (CURRENT_TIME_MINUTES > end) ended.push(workshop);
      else if (CURRENT_TIME_MINUTES >= start && CURRENT_TIME_MINUTES <= end) ongoing.push(workshop);
      else upcoming.push(workshop);
    });

    return { ongoing, upcoming, ended };
  }, []);

  const filteredStudents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (query.length < 2) return [];
    return localStudents.filter(student => (
      student.mssv.includes(query) || student.name.toLowerCase().includes(query)
    ));
  }, [localStudents, searchQuery]);

  const completeSuccessfulScan = useCallback((studentMssv: string, token: string, name: string) => {
    setLocalStudents(students => students.map(student => (
      student.mssv === studentMssv ? { ...student, status: 'checked_in' } : student
    )));
    setScannedToday(count => count + 1);
    setScanFeedback({
      status: 'success',
      title: 'HỢP LỆ',
      message: `${name} · ${formatScanTime()}`,
      token,
    });
  }, []);

  const queueOfflineScan = useCallback(async (token: string, workshopId: string) => {
    const record = createOfflineRecord(token, workshopId);
    await savePendingCheckIn(record);
    await reloadQueue();
    setScannedToday(count => count + 1);
    setScanFeedback({
      status: 'queued',
      title: 'ĐÃ LƯU TẠM',
      message: 'Mất mạng, vé sẽ được đồng bộ khi có kết nối.',
      token,
    });
  }, [reloadQueue]);

  const handleScanToken = useCallback(async (token: string) => {
    if (!activeStation) return;

    const normalizedToken = token.trim();
    if (!normalizedToken) return;

    if (!navigator.onLine || !isOnline) {
      await queueOfflineScan(normalizedToken, activeStation.id);
      return;
    }

    const ticket = DEMO_QR_TOKENS[normalizedToken];
    if (!ticket) {
      setScanFeedback({
        status: 'error',
        title: 'TỪ CHỐI',
        message: 'Mã QR không hợp lệ trong dữ liệu demo.',
      });
      return;
    }

    if (ticket.workshopId !== activeStation.id) {
      setScanFeedback({
        status: 'error',
        title: 'SAI PHÒNG',
        message: 'Vé này thuộc workshop khác.',
      });
      return;
    }

    const student = localStudents.find(item => item.mssv === ticket.mssv);
    if (student?.status === 'pending_payment') {
      setScanFeedback({
        status: 'error',
        title: 'CHƯA THANH TOÁN',
        message: `${ticket.name} chưa có vé confirmed.`,
      });
      return;
    }

    if (student?.status === 'checked_in') {
      setScanFeedback({
        status: 'error',
        title: 'ĐÃ CHECK-IN',
        message: `${ticket.name} đã được ghi nhận trước đó.`,
      });
      return;
    }

    completeSuccessfulScan(ticket.mssv, normalizedToken, ticket.name);
  }, [activeStation, completeSuccessfulScan, isOnline, localStudents, queueOfflineScan]);

  useEffect(() => {
    if (!activeStation || stationTab !== 'scan') return undefined;

    let cancelled = false;
    const html5QrCode = new Html5Qrcode(STAFF_CAMERA_REGION_ID, false);
    let startPromise: Promise<null> | null = null;
    html5QrCodeRef.current = html5QrCode;
    setCameraError(null);
    setIsCameraActive(false);

    Html5Qrcode.getCameras()
      .then(cameras => {
        if (cancelled) return undefined;
        if (cameras.length === 0) {
          setCameraError('Không tìm thấy camera trên thiết bị.');
          throw new Error('No camera available');
        }

        const preferredCamera = cameras.find(camera => /back|rear|environment/i.test(camera.label)) ?? cameras[0];

        startPromise = html5QrCode.start(
          preferredCamera.id,
          { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 },
          decodedText => {
            if (!decodedText || decodedText === lastScanRef.current) return;
            lastScanRef.current = decodedText;
            void handleScanToken(decodedText);
          },
          undefined,
        );
        return startPromise;
      })
      .then(() => {
        if (!cancelled) setIsCameraActive(true);
      })
      .catch(() => {
        if (!cancelled) {
          setCameraError('Không thể mở camera. Hãy cấp quyền camera hoặc nhập mã thủ công.');
          setIsCameraActive(false);
        }
      });

    return () => {
      cancelled = true;
      lastScanRef.current = '';
      const stopCamera = () => {
        if (html5QrCode.isScanning) {
          void html5QrCode.stop().then(() => html5QrCode.clear()).catch(() => undefined);
        } else {
          try {
            html5QrCode.clear();
          } catch {
            undefined;
          }
        }
      };

      if (startPromise) void startPromise.finally(stopCamera);
      else stopCamera();

      html5QrCodeRef.current = null;
      setIsCameraActive(false);
    };
  }, [activeStation, handleScanToken, stationTab]);

  async function handleManualSubmit() {
    if (!manualToken.trim()) return;
    await handleScanToken(manualToken);
    setManualToken('');
  }

  async function handleManualCheckIn(student: StaffStudent) {
    if (!activeStation) return;
    if (student.status === 'pending_payment') {
      setScanFeedback({
        status: 'error',
        title: 'TỪ CHỐI',
        message: `Trạng thái vé hiện tại là ${student.status}.`,
      });
      return;
    }

    if (!navigator.onLine || !isOnline) {
      await queueOfflineScan(`manual:${student.mssv}`, activeStation.id);
    } else {
      completeSuccessfulScan(student.mssv, `manual:${student.mssv}`, student.name);
    }
    setSearchQuery('');
  }

  async function handleClearQueue() {
    await clearStaffQueue();
    setSyncQueue([]);
    setSyncStatus('idle');
  }

  function handleOpenStation(workshop: StaffWorkshop) {
    setActiveStation(workshop);
    setStationTab('scan');
    setMainTab('home');
    setSearchQuery('');
    setScanFeedback({ status: 'idle' });
  }

  function handleCloseStation() {
    setActiveStation(null);
    setStationTab('scan');
    setSearchQuery('');
    setCameraError(null);
  }

  function renderWorkshopSection(title: string, workshops: StaffWorkshop[], variant: 'primary' | 'neutral' | 'muted') {
    if (workshops.length === 0) return null;

    return (
      <section className={variant === 'muted' ? 'opacity-60 grayscale-[45%]' : ''}>
        <h2 className={`mb-[12px] flex items-center gap-[7px] text-[13px] font-bold uppercase tracking-normal ${
          variant === 'primary' ? 'text-[#007AFF]' : 'text-[#636366]'
        }`}>
          {variant === 'primary' && <span className="h-[8px] w-[8px] rounded-full bg-[#007AFF] animate-pulse" />}
          {title}
        </h2>
        <div className="space-y-[14px]">
          {workshops.map(workshop => (
            <button
              key={workshop.id}
              type="button"
              onClick={() => handleOpenStation(workshop)}
              disabled={variant === 'muted'}
              className={`w-full rounded-[20px] border p-[18px] text-left transition active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-[#007AFF]/15 ${
                variant === 'primary'
                  ? 'border-[#007AFF]/25 bg-white shadow-[0_8px_26px_rgba(0,122,255,0.10)]'
                  : 'border-[#E5E5EA] bg-white shadow-sm disabled:bg-transparent'
              }`}
            >
              <h3 className="mb-[12px] text-[17px] font-bold leading-tight tracking-normal text-[#1C1C1E]">
                {workshop.title}
              </h3>
              <div className="mb-[16px] space-y-[8px]">
                <p className="flex items-center gap-[8px] text-[14px] font-semibold text-[#1C1C1E]">
                  <Clock className="h-[16px] w-[16px] shrink-0 text-[#8E8E93]" aria-hidden="true" />
                  {workshop.startTime} - {workshop.endTime}
                </p>
                <p className="flex items-center gap-[8px] text-[14px] font-medium text-[#1C1C1E]">
                  <MapPin className="h-[16px] w-[16px] shrink-0 text-[#8E8E93]" aria-hidden="true" />
                  <span className="truncate">{workshop.room}</span>
                </p>
              </div>
              {variant !== 'muted' && (
                <div className="flex items-center justify-between border-t border-[#F2F2F7] pt-[14px]">
                  <span className="text-[14px] font-semibold text-[#007AFF]">Vào trạm Check-in</span>
                  <ChevronRight className="h-[20px] w-[20px] text-[#007AFF]" aria-hidden="true" />
                </div>
              )}
            </button>
          ))}
        </div>
      </section>
    );
  }

  const syncButtonDisabled = syncQueue.length === 0 || !isOnline || syncStatus === 'syncing';

  return (
    <div className="min-h-[100dvh] bg-black font-[system-ui,-apple-system,BlinkMacSystemFont,'SF_Pro_Text','Helvetica_Neue',sans-serif] text-[#1C1C1E] md:flex md:items-center md:justify-center">
      <style>
        {`@keyframes unihub-scan-line {
          0% { transform: translateY(0); opacity: 0; }
          12% { opacity: 1; }
          88% { opacity: 1; }
          100% { transform: translateY(272px); opacity: 0; }
        }`}
      </style>

      <div className="relative mx-auto flex h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-white md:h-[852px] md:rounded-[32px] md:shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
        {!activeStation ? (
          <>
            <main className="min-h-0 flex-1 overflow-y-auto bg-[#F2F2F7] pb-[calc(86px+env(safe-area-inset-bottom))]">
              {mainTab === 'home' ? (
                <>
                  <header className="sticky top-0 z-10 border-b border-[#E5E5EA] bg-white px-[20px] pb-[18px] pt-[calc(52px+env(safe-area-inset-top))]">
                    <h1 className="text-[34px] font-bold tracking-normal text-[#1C1C1E]">Sự kiện hôm nay</h1>
                    <p className="mt-[4px] text-[15px] font-medium text-[#8E8E93]">
                      Chọn một trạm để bắt đầu check-in.
                    </p>
                  </header>
                  <div className="space-y-[30px] p-[20px]">
                    {renderWorkshopSection('Đang diễn ra', categorizedWorkshops.ongoing, 'primary')}
                    {renderWorkshopSection('Sắp diễn ra', categorizedWorkshops.upcoming, 'neutral')}
                    {renderWorkshopSection('Đã kết thúc', categorizedWorkshops.ended, 'muted')}
                  </div>
                </>
              ) : (
                <>
                  <header className="border-b border-[#E5E5EA] bg-white px-[20px] pb-[18px] pt-[calc(52px+env(safe-area-inset-top))]">
                    <h1 className="text-[34px] font-bold tracking-normal text-[#1C1C1E]">Cài đặt</h1>
                  </header>
                  <div className="space-y-[20px] p-[20px]">
                    <section className="flex items-center gap-[16px] rounded-[20px] border border-[#E5E5EA] bg-white p-[18px] shadow-sm">
                      <div className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full bg-[#007AFF]/10 text-[#007AFF]">
                        <User className="h-[28px] w-[28px]" aria-hidden="true" />
                      </div>
                      <div>
                        <p className="text-[20px] font-bold leading-tight text-[#1C1C1E]">
                          {profile?.display_name ?? 'Nhân sự Check-in'}
                        </p>
                        <p className="mt-[3px] text-[15px] font-medium text-[#8E8E93]">
                          {profile?.role === 'organizer' ? 'Ban tổ chức' : 'Nhân sự Check-in'}
                        </p>
                      </div>
                    </section>

                    <section className="overflow-hidden rounded-[20px] border border-[#E5E5EA] bg-white shadow-sm">
                      <div className="flex items-center justify-between border-b border-[#F2F2F7] p-[18px]">
                        <div className="flex items-center gap-[12px]">
                          {isOnline ? (
                            <Wifi className="h-[20px] w-[20px] text-[#34C759]" aria-hidden="true" />
                          ) : (
                            <WifiOff className="h-[20px] w-[20px] text-[#FF3B30]" aria-hidden="true" />
                          )}
                          <span className="text-[16px] font-semibold text-[#1C1C1E]">Kết nối mạng</span>
                        </div>
                        <span className={`text-[15px] font-bold ${isOnline ? 'text-[#34C759]' : 'text-[#FF3B30]'}`}>
                          {isOnline ? 'Online' : 'Offline'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-[18px]">
                        <div className="flex items-center gap-[12px]">
                          <RefreshCw className={`h-[20px] w-[20px] ${syncQueue.length > 0 ? 'text-[#FF9500]' : 'text-[#8E8E93]'}`} aria-hidden="true" />
                          <span className="text-[16px] font-semibold text-[#1C1C1E]">Dữ liệu chờ đồng bộ</span>
                        </div>
                        <span className="text-[17px] font-bold text-[#FF9500]">{syncQueue.length}</span>
                      </div>
                    </section>

                    <button
                      type="button"
                      onClick={() => void logout()}
                      className="flex min-h-[54px] w-full items-center justify-center gap-[12px] rounded-[18px] border border-[#E5E5EA] bg-white p-[16px] text-[17px] font-semibold text-[#FF3B30] shadow-sm transition active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-[#FF3B30]/15"
                    >
                      <LogOut className="h-[20px] w-[20px]" aria-hidden="true" />
                      Đăng xuất
                    </button>
                  </div>
                </>
              )}
            </main>

            <nav className="absolute bottom-0 left-0 right-0 z-40 flex border-t border-[#E5E5EA] bg-white/90 px-[24px] pb-[calc(10px+env(safe-area-inset-bottom))] pt-[8px] backdrop-blur-xl">
              <button
                type="button"
                onClick={() => setMainTab('home')}
                className={`flex h-[56px] flex-1 flex-col items-center justify-center gap-[4px] rounded-[12px] text-[11px] font-semibold focus:outline-none focus:ring-4 focus:ring-[#007AFF]/15 ${mainTab === 'home' ? 'text-[#007AFF]' : 'text-[#8E8E93]'}`}
              >
                <Home className="h-[24px] w-[24px]" aria-hidden="true" />
                Trang chủ
              </button>
              <button
                type="button"
                onClick={() => setMainTab('settings')}
                className={`flex h-[56px] flex-1 flex-col items-center justify-center gap-[4px] rounded-[12px] text-[11px] font-semibold focus:outline-none focus:ring-4 focus:ring-[#007AFF]/15 ${mainTab === 'settings' ? 'text-[#007AFF]' : 'text-[#8E8E93]'}`}
              >
                <Settings className="h-[24px] w-[24px]" aria-hidden="true" />
                Cài đặt
              </button>
            </nav>
          </>
        ) : (
          <>
            <header className="shrink-0 border-b border-[#E5E5EA] bg-white pt-[env(safe-area-inset-top)]">
              <div className="flex h-[48px] items-center justify-between px-[12px]">
                <button
                  type="button"
                  onClick={handleCloseStation}
                  className="flex h-[44px] items-center rounded-[12px] px-[6px] text-[17px] font-medium text-[#007AFF] focus:outline-none focus:ring-4 focus:ring-[#007AFF]/15"
                >
                  <ChevronLeft className="h-[25px] w-[25px]" aria-hidden="true" />
                  Quay lại
                </button>
                <span className={`rounded-full px-[10px] py-[5px] text-[11px] font-bold ${isOnline ? 'bg-[#34C759]/10 text-[#248A3D]' : 'bg-[#FF3B30]/10 text-[#D70015]'}`}>
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              <div className="px-[20px] pb-[14px]">
                <h1 className="line-clamp-1 text-[20px] font-bold leading-tight tracking-normal text-[#1C1C1E]">
                  {activeStation.title}
                </h1>
                <p className="mt-[3px] flex items-center gap-[5px] text-[13px] font-medium text-[#8E8E93]">
                  <MapPin className="h-[13px] w-[13px]" aria-hidden="true" />
                  {activeStation.room}
                </p>
              </div>
            </header>

            <main className="min-h-0 flex-1 overflow-hidden">
              {stationTab === 'scan' && (
                <section className="relative flex h-full flex-col bg-[#1C1C1E]">
                  <div className="relative min-h-0 flex-1 overflow-hidden">
                    <div id={STAFF_CAMERA_REGION_ID} className="h-full w-full bg-[#1C1C1E]" />
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="relative h-[280px] w-[280px]">
                        <div className="absolute left-0 top-0 h-[42px] w-[42px] rounded-tl-[14px] border-l-[4px] border-t-[4px] border-[#34C759]" />
                        <div className="absolute right-0 top-0 h-[42px] w-[42px] rounded-tr-[14px] border-r-[4px] border-t-[4px] border-[#34C759]" />
                        <div className="absolute bottom-0 left-0 h-[42px] w-[42px] rounded-bl-[14px] border-b-[4px] border-l-[4px] border-[#34C759]" />
                        <div className="absolute bottom-0 right-0 h-[42px] w-[42px] rounded-br-[14px] border-b-[4px] border-r-[4px] border-[#34C759]" />
                        <div className="absolute left-0 top-0 h-[2px] w-full bg-[#34C759] shadow-[0_0_16px_#34C759]" style={{ animation: 'unihub-scan-line 2s ease-in-out infinite' }} />
                      </div>
                    </div>

                    {!isCameraActive && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1C1C1E] px-[28px] text-center">
                        <QrCode className="mb-[16px] h-[54px] w-[54px] text-white/30" aria-hidden="true" />
                        <h2 className="text-[20px] font-bold text-white">Đang mở camera</h2>
                        <p className="mt-[8px] text-[14px] leading-6 text-white/65">
                          {cameraError ?? 'Hãy cấp quyền camera để quét mã QR.'}
                        </p>
                      </div>
                    )}

                    <div className="absolute bottom-[18px] left-[16px] right-[16px] rounded-[18px] border border-white/15 bg-black/55 p-[14px] backdrop-blur-xl">
                      <label htmlFor="manual-token" className="mb-[8px] flex items-center gap-[8px] text-[13px] font-semibold text-white/80">
                        <Keyboard className="h-[16px] w-[16px]" aria-hidden="true" />
                        Nhập token khi camera lỗi
                      </label>
                      <div className="flex gap-[8px]">
                        <input
                          id="manual-token"
                          value={manualToken}
                          onChange={event => setManualToken(event.target.value)}
                          placeholder="qr-an-w2-demo"
                          className="min-h-[44px] min-w-0 flex-1 rounded-[12px] border border-white/15 bg-white/12 px-[12px] text-[15px] font-medium text-white placeholder:text-white/40 focus:outline-none focus:ring-4 focus:ring-[#34C759]/25"
                        />
                        <button
                          type="button"
                          onClick={() => void handleManualSubmit()}
                          className="min-h-[44px] rounded-[12px] bg-white px-[14px] text-[14px] font-bold text-[#1C1C1E] transition active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-white/25"
                        >
                          Quét
                        </button>
                      </div>
                    </div>

                    {scanFeedback.status !== 'idle' && (
                      <div className={`absolute inset-0 z-20 flex flex-col items-center justify-center px-[32px] text-center backdrop-blur-md ${
                        scanFeedback.status === 'success'
                          ? 'bg-[#34C759]/95'
                          : scanFeedback.status === 'queued'
                            ? 'bg-[#FF9500]/95'
                            : 'bg-[#FF3B30]/95'
                      }`}>
                        {scanFeedback.status === 'success' && <CheckCircle2 className="mb-[16px] h-[82px] w-[82px] text-white" aria-hidden="true" />}
                        {scanFeedback.status === 'queued' && <RefreshCw className="mb-[16px] h-[82px] w-[82px] text-white" aria-hidden="true" />}
                        {scanFeedback.status === 'error' && <XCircle className="mb-[16px] h-[82px] w-[82px] text-white" aria-hidden="true" />}
                        <h2 className="mb-[8px] text-[31px] font-bold tracking-normal text-white">{scanFeedback.title}</h2>
                        <p className="text-[16px] font-semibold leading-6 text-white/90">{scanFeedback.message}</p>
                        {'token' in scanFeedback && (
                          <p className="mt-[12px] max-w-full break-all rounded-full bg-white/15 px-[12px] py-[6px] font-mono text-[13px] text-white">
                            {scanFeedback.token}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <footer className="flex shrink-0 items-center justify-between border-t border-white/10 bg-black px-[24px] pb-[calc(18px+env(safe-area-inset-bottom))] pt-[18px]">
                    <div>
                      <p className="text-[12px] font-bold uppercase tracking-normal text-[#8E8E93]">Đã quét</p>
                      <p className="mt-[4px] text-[28px] font-bold leading-none text-white">{scannedToday}</p>
                    </div>
                    <p className="text-right text-[12px] font-medium leading-5 text-white/55">
                      Demo token<br />qr-an-w2-demo
                    </p>
                  </footer>
                </section>
              )}

              {stationTab === 'lookup' && (
                <section className="h-full overflow-y-auto bg-[#F2F2F7] p-[16px] pb-[calc(86px+env(safe-area-inset-bottom))]">
                  <h2 className="mb-[16px] text-[22px] font-bold tracking-normal text-[#1C1C1E]">Tra mã sinh viên</h2>
                  <label htmlFor="student-search" className="mb-[8px] block text-[13px] font-bold uppercase tracking-normal text-[#636366]">
                    MSSV hoặc tên
                  </label>
                  <div className="relative mb-[22px]">
                    <Search className="absolute left-[15px] top-1/2 h-[20px] w-[20px] -translate-y-1/2 text-[#8E8E93]" aria-hidden="true" />
                    <input
                      id="student-search"
                      type="search"
                      value={searchQuery}
                      onChange={event => setSearchQuery(event.target.value)}
                      placeholder="Nhập ít nhất 2 ký tự"
                      className="h-[56px] w-full rounded-[16px] border border-[#E5E5EA] bg-white pl-[48px] pr-[16px] text-[17px] font-medium text-[#1C1C1E] shadow-sm placeholder:text-[#8E8E93] focus:outline-none focus:ring-4 focus:ring-[#007AFF]/15"
                    />
                  </div>

                  {searchQuery.length > 0 && searchQuery.length < 2 && (
                    <p className="text-center text-[14px] font-medium text-[#8E8E93]">Nhập ít nhất 2 ký tự để tìm kiếm.</p>
                  )}

                  {searchQuery.length >= 2 && (
                    <div className="overflow-hidden rounded-[18px] border border-[#E5E5EA] bg-white">
                      {filteredStudents.length > 0 ? filteredStudents.map(student => (
                        <div key={student.mssv} className="flex items-center justify-between gap-[12px] border-b border-[#F2F2F7] p-[16px] last:border-0">
                          <div className="min-w-0">
                            <p className="truncate text-[17px] font-bold text-[#1C1C1E]">{student.name}</p>
                            <p className="mt-[2px] font-mono text-[14px] text-[#8E8E93]">{student.mssv}</p>
                          </div>
                          {student.status === 'checked_in' ? (
                            <span className="flex min-h-[36px] items-center gap-[5px] rounded-[10px] bg-[#34C759]/10 px-[10px] text-[13px] font-semibold text-[#248A3D]">
                              <CheckCircle2 className="h-[17px] w-[17px]" aria-hidden="true" />
                              Đã vào
                            </span>
                          ) : student.status === 'confirmed' ? (
                            <button
                              type="button"
                              onClick={() => void handleManualCheckIn(student)}
                              className="min-h-[44px] shrink-0 rounded-[12px] bg-[#007AFF] px-[14px] text-[14px] font-bold text-white transition active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-[#007AFF]/20"
                            >
                              Check-in
                            </button>
                          ) : (
                            <span className="min-h-[36px] shrink-0 rounded-[10px] bg-[#FF9500]/10 px-[10px] py-[9px] text-[13px] font-semibold text-[#A05A00]">
                              Chưa đóng tiền
                            </span>
                          )}
                        </div>
                      )) : (
                        <div className="p-[32px] text-center">
                          <AlertTriangle className="mx-auto mb-[12px] h-[32px] w-[32px] text-[#8E8E93]" aria-hidden="true" />
                          <p className="text-[15px] font-semibold text-[#1C1C1E]">Không tìm thấy sinh viên</p>
                          <p className="mt-[4px] text-[13px] text-[#8E8E93]">Dữ liệu offline không chứa MSSV này.</p>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}

              {stationTab === 'sync' && (
                <section className="flex h-full flex-col bg-[#F2F2F7] p-[20px] pb-[calc(96px+env(safe-area-inset-bottom))]">
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
                    <div className={`mb-[18px] flex h-[72px] w-[72px] items-center justify-center rounded-[20px] ${
                      syncQueue.length > 0 ? 'bg-[#FF9500]/10 text-[#FF9500]' : 'bg-[#E5E5EA] text-[#8E8E93]'
                    }`}>
                      <RefreshCw className={`h-[38px] w-[38px] ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} aria-hidden="true" />
                    </div>
                    <h2 className="mb-[8px] text-[24px] font-bold tracking-normal text-[#1C1C1E]">
                      {syncQueue.length} vé chờ đồng bộ
                    </h2>
                    <p className="mb-[22px] max-w-[300px] text-[15px] leading-6 text-[#636366]">
                      Dữ liệu được lưu trong IndexedDB và chỉ đồng bộ khi app đang mở.
                    </p>
                    <button
                      type="button"
                      onClick={() => void syncPendingRecords()}
                      disabled={syncButtonDisabled}
                      className="min-h-[48px] rounded-[14px] bg-[#007AFF] px-[24px] text-[16px] font-bold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 focus:outline-none focus:ring-4 focus:ring-[#007AFF]/20"
                    >
                      {syncStatus === 'syncing' ? 'Đang đồng bộ...' : 'Đồng bộ ngay'}
                    </button>
                    {syncStatus === 'success' && (
                      <p className="mt-[14px] text-[14px] font-semibold text-[#248A3D]">Đã đồng bộ dữ liệu demo.</p>
                    )}
                    {syncStatus === 'error' && (
                      <p className="mt-[14px] text-[14px] font-semibold text-[#D70015]">Chưa thể đồng bộ. Kiểm tra kết nối mạng.</p>
                    )}
                    {syncQueue.length > 0 && (
                      <button
                        type="button"
                        onClick={() => void handleClearQueue()}
                        className="mt-[18px] min-h-[44px] rounded-[12px] px-[14px] text-[14px] font-semibold text-[#D70015] focus:outline-none focus:ring-4 focus:ring-[#FF3B30]/15"
                      >
                        Xóa hàng đợi demo
                      </button>
                    )}
                  </div>
                </section>
              )}
            </main>

            <nav className="z-30 flex shrink-0 border-t border-[#E5E5EA] bg-white px-[14px] pb-[calc(9px+env(safe-area-inset-bottom))] pt-[8px]">
              <button
                type="button"
                onClick={() => setStationTab('scan')}
                className={`flex h-[56px] flex-1 flex-col items-center justify-center gap-[4px] rounded-[12px] text-[11px] font-semibold focus:outline-none focus:ring-4 focus:ring-[#007AFF]/15 ${stationTab === 'scan' ? 'text-[#007AFF]' : 'text-[#8E8E93]'}`}
              >
                <QrCode className="h-[24px] w-[24px]" aria-hidden="true" />
                Quét mã
              </button>
              <button
                type="button"
                onClick={() => setStationTab('lookup')}
                className={`flex h-[56px] flex-1 flex-col items-center justify-center gap-[4px] rounded-[12px] text-[11px] font-semibold focus:outline-none focus:ring-4 focus:ring-[#007AFF]/15 ${stationTab === 'lookup' ? 'text-[#007AFF]' : 'text-[#8E8E93]'}`}
              >
                <Search className="h-[24px] w-[24px]" aria-hidden="true" />
                Tra mã
              </button>
              <button
                type="button"
                onClick={() => setStationTab('sync')}
                className={`relative flex h-[56px] flex-1 flex-col items-center justify-center gap-[4px] rounded-[12px] text-[11px] font-semibold focus:outline-none focus:ring-4 focus:ring-[#007AFF]/15 ${stationTab === 'sync' ? 'text-[#007AFF]' : 'text-[#8E8E93]'}`}
              >
                <span className="relative">
                  <RefreshCw className="h-[24px] w-[24px]" aria-hidden="true" />
                  {syncQueue.length > 0 && (
                    <span className="absolute -right-[3px] -top-[3px] h-[12px] w-[12px] rounded-full border-[2px] border-white bg-[#FF3B30]" />
                  )}
                </span>
                Đồng bộ
              </button>
            </nav>
          </>
        )}
      </div>
    </div>
  );
}
