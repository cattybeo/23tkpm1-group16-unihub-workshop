import { useState, useEffect, useCallback } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Wifi, WifiOff, RefreshCw, CheckCircle2, AlertCircle, Clock, ShieldCheck, ShieldAlert, Keyboard, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api-client';
import { getAuthToken } from '@/lib/auth-store';
import { initDB, saveOfflineData } from '@/lib/offline-db';

const STORE_NAME = 'checkins';
const TARGET_WORKSHOP_ID = "22222222-2222-2222-2222-222222220003";

export function ScannerPage() {
  const [status, setStatus] = useState<'idle' | 'success' | 'error' | 'offline_saved'>('idle');
  const [message, setMessage] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [manualToken, setManualToken] = useState('');

  const hasToken = !!getAuthToken();

  const updatePendingCount = useCallback(async () => {
    const db = await initDB();
    const all = await db.getAll(STORE_NAME);
    setPendingCount(all.length);
  }, []);

  useEffect(() => {
    const handleStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', handleStatus);
    window.addEventListener('offline', handleStatus);
    updatePendingCount();

    const scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 }, false);
    scanner.render(async (text) => processCheckin(text), () => {});

    return () => {
      scanner.clear().catch(() => {});
      window.removeEventListener('online', handleStatus);
      window.removeEventListener('offline', handleStatus);
    };
  }, [updatePendingCount]);

  const processCheckin = async (qrToken: string) => {
    if (!qrToken) return;
    if (navigator.onLine) {
      if (!hasToken) {
        setStatus('error');
        setMessage('Vui lòng đăng nhập lại (RAM bị trống)');
        return;
      }
      try {
        await api.post('/check-ins', { qr_token: qrToken, workshop_id: TARGET_WORKSHOP_ID });
        setStatus('success');
        setMessage('Check-in thành công!');
      } catch (err: any) {
        setStatus('error');
        setMessage(err.message || 'Lỗi vé');
      }
    } else {
      await saveOfflineData(qrToken, TARGET_WORKSHOP_ID);
      setStatus('offline_saved');
      setMessage('Đã lưu ngoại tuyến');
      await updatePendingCount(); // Cập nhật số ngay khi lưu
    }
    setTimeout(() => setStatus('idle'), 3000);
  };

  const handleSync = async () => {
    if (!isOnline || syncing || pendingCount === 0) return;
    if (!hasToken) return alert("Hệ thống yêu cầu đăng nhập lại (Rule #7)");

    setSyncing(true);
    try {
        const db = await initDB();
        const records = await db.getAll(STORE_NAME);
        
        const result: any = await api.post('/check-ins/sync', { records });
        
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        
        if (result.synced && result.synced.length > 0) {
        for (const clientId of result.synced) {
            await store.delete(clientId);
        }
        }
        await tx.done;

        const remain = await db.getAll(STORE_NAME);
        setPendingCount(remain.length);

        alert(`Đã xử lý xong ${result.synced.length} vé.`);
    } catch (err: any) {
        console.error("Sync Error:", err);
        alert("Lỗi kết nối. Vui lòng thử lại sau.");
    } finally {
        setSyncing(false);
    }
    };

  return (
    <div className="min-h-screen bg-[#F2F2F7] p-6 animate-in fade-in duration-500">
      <div className="max-w-md mx-auto">
        <header className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold">Máy quét QR</h1>
            <p className="text-sm text-gray-500">Workshop: 12.000 Request</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${isOnline ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {isOnline ? 'Trực tuyến' : 'Ngoại tuyến'}
            </div>
            <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${hasToken ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
              Auth: {hasToken ? 'Sẵn sàng' : 'Trống'}
            </div>
          </div>
        </header>

        <div className="relative bg-black rounded-[32px] overflow-hidden shadow-xl aspect-square mb-6">
          <div id="reader" className="w-full h-full"></div>
          {status !== 'idle' && (
            <div className={`absolute inset-0 flex flex-col items-center justify-center p-8 z-50 animate-in fade-in 
              ${status === 'success' ? 'bg-green-500/90' : status === 'error' ? 'bg-red-500/90' : 'bg-orange-500/90'}`}>
              <p className="text-white font-bold text-xl">{message}</p>
            </div>
          )}
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-sm mb-6 flex gap-2">
          <input 
            type="text" value={manualToken} onChange={(e) => setManualToken(e.target.value)}
            placeholder="Dán token test..." className="flex-1 bg-gray-50 px-4 rounded-xl outline-none text-sm"
          />
          <button onClick={() => { processCheckin(manualToken); setManualToken(''); }} className="bg-blue-600 text-white p-3 rounded-xl"><ArrowRight size={20}/></button>
        </div>

        <button 
          onClick={handleSync}
          disabled={!isOnline || pendingCount === 0 || syncing}
          className="w-full h-16 bg-black text-white rounded-2xl font-bold flex items-center justify-center gap-3 disabled:bg-gray-300 transition-all"
        >
          {syncing ? <RefreshCw className="animate-spin" /> : <RefreshCw />}
          Đồng bộ ngay {pendingCount > 0 ? `(${pendingCount} vé)` : ''}
        </button>
      </div>
    </div>
  );
}