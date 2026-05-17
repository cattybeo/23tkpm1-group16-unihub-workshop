import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api-client';
import { 
  Database, FileUp, Loader2, Users, 
  FileText, Ticket, Copy, Zap, 
  ScanLine, CreditCard 
} from 'lucide-react';

export function AdminDashboard() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  
  const [students, setStudents] = useState<any[]>([]);
  const [currentReg, setCurrentReg] = useState<{id: string, qr_token: string} | null>(null);

  const fetchStudents = async () => {
    try {
      const data = await api.get<any[]>('/admin/csv-import/students');
      setStudents(data);
    } catch (err) {
      console.error('Lỗi tải dữ liệu. Có thể do chưa đăng nhập.');
    }
  };

  useEffect(() => {
    fetchStudents();
  }, []);

  const handleSyncCSV = async () => {
    setIsSyncing(true);
    try {
      const res: any = await api.post('/admin/csv-import/import-latest', {});
      alert(`Đồng bộ xong! Nạp mới: ${res.inserted} sinh viên.`);
      await fetchStudents();
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    } finally { setIsSyncing(false); }
  };

  const handleAISummary = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsSummarizing(true);
    try {
      const workshopId = "22222222-2222-2222-2222-222222220003"; 
      await api.post(`/workshops/${workshopId}/summary`, file, { 'Content-Type': 'application/pdf' });
      alert('Tải lên thành công! AI đang tóm tắt chạy ngầm.');
    } catch (err: any) {
      alert('Lỗi AI: ' + err.message);
    } finally {
      setIsSummarizing(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleQuickRegister = async () => {
    setIsRegistering(true);
    try {
      const res: any = await api.post('/registrations', 
        { workshop_id: "22222222-2222-2222-2222-222222220003" },
        { 'Idempotency-Key': self.crypto.randomUUID() }
      );
      setCurrentReg({ id: res.id, qr_token: res.qr_token });
      alert("Đã giữ chỗ thành công! Hãy thực hiện thanh toán ở bước kế tiếp.");
    } catch (err: any) {
      alert('Lỗi giữ chỗ: ' + err.message);
    } finally { setIsRegistering(false); }
  };

  const handleTestPayment = async () => {
    if (!currentReg) return alert("Vui lòng thực hiện Bước 1 trước!");
    
    const fixedIdempotencyKey = "test-payment-key-123"; 
    
    setIsPaying(true);
    try {
      const res = await api.post('/payments', {
        registration_id: currentReg.id,
        amount: 50000,
        card_number: "1234-5678-9012"
      }, { 'Idempotency-Key': fixedIdempotencyKey });
      
      alert("Thanh toán thành công!");
      console.log("Kết quả thanh toán:", res);
    } catch (err: any) {
      alert(`Lỗi: ${err.code} - ${err.message}`);
    } finally { setIsPaying(false); }
  };

  return (
    <div className="max-w-[1000px] mx-auto px-[20px] md:px-[40px] py-[40px] animate-in fade-in duration-500 pb-[100px]">
      
      {/* Header điều hướng */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg text-white flex items-center justify-center font-bold shadow-lg">A</div>
            <span className="text-gray-400 text-sm font-bold uppercase tracking-widest">Hệ thống quản trị</span>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight">Ban Tổ Chức</h1>
        </div>
        <Link to="/scanner" className="flex items-center gap-2 bg-white border border-gray-200 px-6 py-3 rounded-2xl font-bold text-blue-600 shadow-sm hover:shadow-md transition-all active:scale-95">
          <ScanLine size={20} /> Mở máy quét Check-in
        </Link>
      </header>

      {/* --- KHU VỰC 1: TEST THANH TOÁN & GIỮ CHỖ (payment.md) --- */}
      <section className="bg-slate-900 rounded-[32px] p-8 mb-8 text-white shadow-2xl relative overflow-hidden">
        <Zap className="absolute -right-8 -top-8 w-48 h-48 text-white/5 rotate-12" />
        <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-blue-400">
          <Zap size={24} fill="currentColor"/> Test Luồng Thanh toán (Payment Spec)
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Bước 1 */}
          <div className="bg-white/5 p-6 rounded-2xl border border-white/10 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-black bg-blue-500 px-2 py-0.5 rounded-md mb-2 inline-block">BƯỚC 1</span>
              <h3 className="font-bold mb-2">Đăng ký giữ chỗ</h3>
              <p className="text-gray-400 text-xs mb-4 leading-relaxed">Thực hiện Atomic Update để trừ chỗ ngồi và tạo bản đăng ký `pending_payment`.</p>
            </div>
            <button onClick={handleQuickRegister} disabled={isRegistering} className="w-full h-12 bg-white text-slate-900 rounded-xl font-bold text-sm hover:bg-gray-100 disabled:bg-gray-500 transition-all flex items-center justify-center gap-2">
              {isRegistering ? <Loader2 className="animate-spin" size={18}/> : <Ticket size={18}/>}
              Đăng ký vé mới
            </button>
          </div>

          {/* Bước 2 */}
          <div className="bg-white/5 p-6 rounded-2xl border border-white/10 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-black bg-orange-500 px-2 py-0.5 rounded-md mb-2 inline-block">BƯỚC 2</span>
              <h3 className="font-bold mb-2">Thanh toán (Idempotency & CB)</h3>
              <p className="text-gray-400 text-xs mb-4 leading-relaxed">Nhấn nhiều lần để test Idempotency. Nếu chỉnh `.env` lỗi sẽ test được Circuit Breaker.</p>
            </div>
            <button onClick={handleTestPayment} disabled={isPaying || !currentReg} className="w-full h-12 bg-orange-500 text-white rounded-xl font-bold text-sm hover:bg-orange-600 disabled:bg-gray-700 transition-all flex items-center justify-center gap-2">
              {isPaying ? <Loader2 className="animate-spin" size={18}/> : <CreditCard size={18}/>}
              Thử thanh toán (Bấm 2 lần)
            </button>
          </div>
        </div>

        {currentReg && (
          <div className="mt-6 bg-blue-500/10 p-4 rounded-xl border border-blue-500/20 flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-blue-400">QR TOKEN HIỆN TẠI (Dùng cho Check-in):</span>
              <code className="text-sm font-mono text-blue-100 break-all">{currentReg.qr_token}</code>
            </div>
            <button onClick={() => { navigator.clipboard.writeText(currentReg.qr_token); alert("Đã copy!"); }} className="p-3 hover:bg-blue-500/20 rounded-xl transition-colors">
              <Copy size={20} />
            </button>
          </div>
        )}
      </section>

      {/* --- KHU VỰC 2: CSV & AI --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        {/* CSV */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-4"><Database size={24}/></div>
          <h3 className="text-xl font-bold mb-2 text-gray-900">CSV Import</h3>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed flex-1">Nạp danh sách sinh viên từ file hệ thống cũ. Áp dụng Soft Delete để bảo vệ dữ liệu.</p>
          <button onClick={handleSyncCSV} disabled={isSyncing} className="w-full h-14 bg-gray-900 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-black transition-all">
            {isSyncing ? <Loader2 className="animate-spin" size={20}/> : <Database size={20}/>} Chạy Import CSV
          </button>
        </div>

        {/* AI */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col">
          <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center mb-4"><FileText size={24}/></div>
          <h3 className="text-xl font-bold mb-2 text-gray-900">AI Summary</h3>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed flex-1">Tải lên PDF để AI tự động tóm tắt. Kết quả được lưu vĩnh viễn vào Database.</p>
          <label className={`w-full h-14 ${isSummarizing ? 'bg-gray-300' : 'bg-indigo-600'} text-white rounded-2xl font-bold flex items-center justify-center gap-2 cursor-pointer hover:bg-indigo-700 transition-all`}>
            {isSummarizing ? <Loader2 className="animate-spin" size={20}/> : <FileUp size={20}/>} Tải lên PDF
            <input type="file" accept=".pdf" className="hidden" onChange={handleAISummary} disabled={isSummarizing} />
          </label>
        </div>
      </div>

      {/* --- KHU VỰC 3: DATABASE VIEW --- */}
      <section className="bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-gray-400" />
            <h2 className="font-bold text-gray-900">Dữ liệu Sinh viên (Postgres)</h2>
          </div>
          <div className="bg-white px-3 py-1 rounded-full border border-gray-200 text-xs font-bold text-gray-600">
            {students.length} record(s)
          </div>
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          <table className="w-full text-left">
            <thead className="bg-white sticky top-0 text-[11px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-50">
              <tr>
                <th className="px-6 py-4">MSSV</th>
                <th className="px-6 py-4">Họ và Tên</th>
                <th className="px-6 py-4 text-right">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {students.map((s) => (
                <tr key={s.mssv} className="hover:bg-blue-50/30 transition-colors">
                  <td className="px-6 py-4 font-mono text-sm">{s.mssv}</td>
                  <td className="px-6 py-4 font-bold text-gray-800">{s.full_name}</td>
                  <td className="px-6 py-4 text-right">
                    <span className={`text-[10px] font-black px-2 py-1 rounded-md ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {s.is_active ? 'ACTIVE' : 'STALE'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
