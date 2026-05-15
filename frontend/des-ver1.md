import React, { useState } from 'react';
import {
  Search, MapPin, Clock,
  QrCode, CheckCircle2, AlertCircle, ChevronLeft, Ticket,
  Calendar
} from 'lucide-react';

// --- MOCK DATA ---
const MOCK_WORKSHOPS = [
  {
    id: 'w1',
    title: 'Seminar Chuyên đề: Tối ưu hoá Hệ thống phân tán',
    speaker: 'Khoa CNTT x VNG Corporation',
    day: 'Thứ 2 - 12/05/2026',
    time: '08:00 - 11:00',
    room: 'Giảng đường 1, Tòa nhà I',
    capacity: 150,
    booked: 142,
    price: 0,
    isFree: true,
    image: 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?q=80&w=800&auto=format&fit=crop',
    aiSummary: 'Seminar chuyên sâu về kiến trúc microservices và Kubernetes. Sinh viên sẽ được xem live-demo cách scale hệ thống chịu tải lớn thực tế. Yêu cầu đã học môn Mạng Máy Tính.'
  },
  {
    id: 'w2',
    title: 'Chuỗi Kỹ năng mềm: Chinh phục Nhà tuyển dụng IT',
    speaker: 'Phòng CTSV & FPT Software',
    day: 'Thứ 3 - 13/05/2026',
    time: '13:30 - 16:30',
    room: 'Hội trường T',
    capacity: 300,
    booked: 120,
    price: 50000,
    isFree: false,
    image: 'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?q=80&w=800&auto=format&fit=crop',
    aiSummary: 'Hướng dẫn viết CV chuẩn hệ thống quét tự động (ATS), thực hành phỏng vấn hành vi theo mô hình STAR. Có phiên Mock-interview trực tiếp với HR.'
  },
  {
    id: 'w3',
    title: 'Workshop CLB IT: Xây dựng thế giới ảo với Luau',
    speaker: 'CLB Game Dev HCMUS',
    day: 'Thứ 4 - 14/05/2026',
    time: '09:00 - 12:00',
    room: 'Phòng Lab C.31',
    capacity: 40,
    booked: 40,
    price: 0,
    isFree: true,
    image: 'https://images.unsplash.com/photo-1552820728-8b83bb6b773f?q=80&w=800&auto=format&fit=crop',
    aiSummary: 'Dành riêng cho sinh viên đam mê Game Development. Tìm hiểu cấu trúc engine Roblox, script bằng ngôn ngữ Luau và phân tích các game đạt doanh thu cao.'
  },
  {
    id: 'w4',
    title: 'Báo cáo NCKH: Ứng dụng AI trong Chẩn đoán Y tế',
    speaker: 'Khoa Công nghệ Thông tin',
    day: 'Thứ 5 - 15/05/2026',
    time: '08:30 - 11:30',
    room: 'Phòng Hội thảo F',
    capacity: 100,
    booked: 85,
    price: 0,
    isFree: true,
    image: 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?q=80&w=800&auto=format&fit=crop',
    aiSummary: 'Báo cáo tiến độ đề tài NCKH cấp bộ. Trình bày phương pháp ứng dụng Computer Vision để bóc tách và phân tích ảnh X-Quang lồng ngực.'
  },
  {
    id: 'w5',
    title: 'Talkshow Cựu Sinh Viên: Từ HCMUS đến Silicon Valley',
    speaker: 'Hội Cựu Sinh Viên KHTN',
    day: 'Thứ 6 - 16/05/2026',
    time: '18:00 - 21:00',
    room: 'Hội trường T',
    capacity: 500,
    booked: 350,
    price: 0,
    isFree: true,
    image: 'https://images.unsplash.com/photo-1528605248644-14dd04022da1?q=80&w=800&auto=format&fit=crop',
    aiSummary: 'Lắng nghe hành trình thực tế của các cựu sinh viên đang làm việc tại Google, Meta. Q&A trực tiếp về lộ trình apply internship quốc tế.'
  }
];

export default function UniHubApple() {
  const [currentView, setCurrentView] = useState('discover');
  const [selectedWorkshop, setSelectedWorkshop] = useState(null);
  const [myTickets, setMyTickets] = useState([]);
  const [isRegistering, setIsRegistering] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState('idle');

  // --- HANDLERS ---
  const handleViewDetail = (workshop) => {
    setSelectedWorkshop(workshop);
    setCurrentView('detail');
    setPaymentStatus('idle');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRegister = async () => {
    setIsRegistering(true);
    setPaymentStatus('processing');

    setTimeout(() => {
      if (!selectedWorkshop.isFree && Math.random() < 0.2) {
        setPaymentStatus('error');
        setIsRegistering(false);
        return;
      }

      const newTicket = {
        id: `TKT-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        workshop: selectedWorkshop,
        status: 'upcoming'
      };
      setMyTickets([...myTickets, newTicket]);
      setPaymentStatus('success');
      setIsRegistering(false);
      
      setTimeout(() => {
        setCurrentView('tickets');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 1500);
    }, 2000);
  };

  // --- COMPONENTS ---
  const CapacityIndicator = ({ capacity, booked }) => {
    const percent = (booked / capacity) * 100;
    let colorClass = 'bg-[#34C759]'; // iOS Green
    let label = `Còn ${capacity - booked} chỗ`;

    if (percent >= 100) {
      colorClass = 'bg-[#FF3B30]'; // iOS Red
      label = 'Đã hết chỗ';
    } else if (percent >= 90) {
      colorClass = 'bg-[#FF9500]'; // iOS Orange
      label = `Sắp hết`;
    }

    return (
      <div className="flex flex-col gap-[8px] w-full">
        <div className="flex justify-between text-[13px] font-medium">
          <span className="text-[#8E8E93]">{booked}/{capacity} đã đăng ký</span>
          <span className={`font-semibold ${percent >= 100 ? 'text-[#FF3B30]' : 'text-[#1C1C1E]'}`}>{label}</span>
        </div>
        <div className="h-[6px] w-full bg-[#E5E5EA] rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-500 ease-out ${colorClass}`} 
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
      </div>
    );
  };

  const Header = () => (
    <header className="h-[44px] md:h-[60px] bg-[rgba(255,255,255,0.8)] backdrop-blur-xl border-b border-[#E5E5EA] px-[16px] md:px-[32px] sticky top-0 z-50 flex items-center justify-between supports-backdrop-blur:bg-white/60">
      <div
        className="font-semibold text-[17px] tracking-tight text-[#1C1C1E] cursor-pointer flex items-center gap-[8px]"
        onClick={() => setCurrentView('discover')}
      >
        <div className="w-[28px] h-[28px] bg-[#007AFF] rounded-[8px] text-white flex items-center justify-center text-[14px] shadow-[0_2px_8px_rgba(0,122,255,0.3)]">U</div>
        UniHub
      </div>
      <nav className="hidden md:flex gap-[32px]">
        <button
          onClick={() => setCurrentView('discover')}
          className={`text-[15px] transition-colors ${currentView === 'discover' ? 'text-[#1C1C1E] font-semibold' : 'text-[#8E8E93] hover:text-[#1C1C1E] font-medium'}`}
        >
          Khám phá
        </button>
        <button
          onClick={() => setCurrentView('tickets')}
          className={`text-[15px] transition-colors flex items-center gap-[6px] ${currentView === 'tickets' ? 'text-[#1C1C1E] font-semibold' : 'text-[#8E8E93] hover:text-[#1C1C1E] font-medium'}`}
        >
          Vé của tôi {myTickets.length > 0 && <span className="bg-[#007AFF] text-white text-[11px] font-bold px-[6px] py-[2px] rounded-full">{myTickets.length}</span>}
        </button>
      </nav>
      <div className="w-[32px] h-[32px] rounded-full bg-[#E5E5EA] flex items-center justify-center text-[13px] font-semibold text-[#1C1C1E]">
        M
      </div>
    </header>
  );

  const DiscoverView = () => (
    <div className="animate-in fade-in duration-500 pb-[100px] md:pb-[40px]">
      <section className="pt-[56px] pb-[40px] px-[20px] md:px-[40px] max-w-[900px] mx-auto text-center flex flex-col items-center">
        <div className="mb-[24px] border border-[#E5E5EA] px-[12px] py-[6px] rounded-full flex items-center gap-[8px] bg-white shadow-sm">
          <div className="w-[18px] h-[18px] bg-[#007AFF] rounded-[4px] text-white flex items-center justify-center text-[10px] font-bold">U</div>
          <span className="text-[13px] font-semibold text-[#1C1C1E]">Hệ thống Sự kiện & Đào tạo HCMUS</span>
        </div>

        <h1 className="text-[40px] md:text-[56px] font-bold leading-[1.1] text-[#1C1C1E] tracking-tight mb-[20px]">
          Khám phá các <span className="text-[#007AFF]">Workshop</span> chất lượng từ nhà trường và chuyên gia
        </h1>
        
        <p className="text-[17px] md:text-[20px] text-[#8E8E93] max-w-[650px] mb-[40px] font-medium leading-relaxed">
          Duyệt, đăng ký và lấy vé tham dự hàng chục seminar chuyên đề, talkshow và hoạt động ngoại khóa được tổ chức mỗi học kỳ.
        </p>

        <div className="w-full relative max-w-[650px]">
          <Search className="absolute left-[16px] top-1/2 -translate-y-1/2 w-[20px] h-[20px] text-[#8E8E93]" />
          <input 
            type="text" 
            placeholder="Tìm theo tên sự kiện, diễn giả, phòng học..." 
            className="w-full h-[56px] pl-[48px] pr-[16px] bg-white border border-[#E5E5EA] shadow-[0_2px_12px_rgba(0,0,0,0.04)] rounded-[16px] text-[17px] text-[#1C1C1E] placeholder:text-[#8E8E93] focus:outline-none focus:border-[#007AFF] focus:ring-4 focus:ring-[#007AFF]/10 transition-all"
          />
        </div>
      </section>

      <section className="max-w-[1200px] mx-auto px-[20px] md:px-[40px] mb-[24px] flex flex-col sm:flex-row justify-between items-center gap-[16px]">
         <div className="flex items-center gap-[12px] w-full sm:w-auto">
            <select className="bg-white border border-[#E5E5EA] rounded-[10px] px-[16px] py-[8px] text-[14px] font-medium text-[#1C1C1E] focus:outline-none appearance-none pr-[32px] relative bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%231C1C1E%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[length:10px_10px] bg-[right_12px_center]">
              <option>Sắp diễn ra</option>
              <option>Mới đăng nhất</option>
              <option>Nhiều đăng ký</option>
            </select>
            <div className="flex items-center gap-[10px] bg-white border border-[#E5E5EA] rounded-[10px] px-[16px] py-[8px]">
              <div className="w-[36px] h-[22px] bg-[#34C759] rounded-full p-[2px] cursor-pointer shadow-inner">
                <div className="w-[18px] h-[18px] bg-white rounded-full translate-x-[14px] shadow-sm transition-transform"></div>
              </div>
              <span className="text-[14px] font-medium text-[#1C1C1E]">Chỉ hiện còn chỗ</span>
            </div>
         </div>
      </section>

      <section className="max-w-[1200px] mx-auto px-[20px] md:px-[40px]">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[24px]">
          {MOCK_WORKSHOPS.map(ws => (
            <div 
              key={ws.id} 
              className="bg-white rounded-[24px] overflow-hidden cursor-pointer shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:shadow-[0_16px_40px_rgba(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300 flex flex-col h-full group"
              onClick={() => handleViewDetail(ws)}
            >
              <div className="h-[200px] w-full relative overflow-hidden bg-[#F2F2F7]">
                <img src={ws.image} alt={ws.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out" />
              </div>

              <div className="p-[24px] flex flex-col flex-1">
                <h2 className="text-[20px] font-bold leading-tight text-[#1C1C1E] mb-[8px] line-clamp-2 tracking-tight">{ws.title}</h2>
                <p className="text-[15px] text-[#8E8E93] mb-[20px] font-medium line-clamp-1">{ws.speaker}</p>
                
                <div className="mt-auto space-y-[10px] mb-[20px]">
                  <div className="flex items-center text-[14px] text-[#3A3A3C] gap-[10px]">
                    <Clock className="w-[16px] h-[16px] text-[#8E8E93]" />
                    <span className="font-medium">{ws.day.split(' - ')[0]} • {ws.time}</span>
                  </div>
                  <div className="flex items-center text-[14px] text-[#3A3A3C] gap-[10px]">
                    <MapPin className="w-[16px] h-[16px] text-[#8E8E93]" />
                    <span className="font-medium truncate">{ws.room}</span>
                  </div>
                  <div className="flex items-center text-[14px] gap-[10px]">
                    <Ticket className="w-[16px] h-[16px] text-[#8E8E93]" />
                    <span className={`font-semibold ${ws.isFree ? 'text-[#34C759]' : 'text-[#5E5CE6]'}`}>
                      {ws.isFree ? 'Miễn phí' : `${ws.price.toLocaleString('vi-VN')}đ`}
                    </span>
                  </div>
                </div>

                <div className="pt-[16px] border-t border-[#F2F2F7]">
                  <CapacityIndicator capacity={ws.capacity} booked={ws.booked} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  const DetailView = () => (
    <div className="max-w-[1000px] mx-auto px-[20px] md:px-[40px] py-[32px] animate-in slide-in-from-right-8 duration-500 pb-[120px] md:pb-[40px]">
      <button
        onClick={() => setCurrentView('discover')}
        className="flex items-center text-[17px] font-medium text-[#007AFF] hover:opacity-80 mb-[24px] transition-opacity w-fit -ml-[8px] px-[8px] py-[4px]"
      >
        <ChevronLeft className="w-[20px] h-[20px] mr-[2px]" /> Trở lại danh sách
      </button>

      <div className="w-full h-[250px] md:h-[350px] rounded-[24px] overflow-hidden mb-[32px] relative shadow-[0_8px_30px_rgba(0,0,0,0.06)] bg-[#F2F2F7]">
         <img src={selectedWorkshop.image} alt={selectedWorkshop.title} className="w-full h-full object-cover" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-[32px]">
        <div className="lg:col-span-2">
          <h1 className="text-[32px] md:text-[40px] font-bold leading-tight text-[#1C1C1E] tracking-tight mb-[12px]">
            {selectedWorkshop.title}
          </h1>
          <p className="text-[20px] text-[#8E8E93] mb-[32px] font-medium">{selectedWorkshop.speaker}</p>

          <div className="bg-white rounded-[20px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] mb-[40px] overflow-hidden">
            <div className="flex items-center gap-[16px] p-[20px] border-b border-[#F2F2F7]">
              <div className="w-[40px] h-[40px] rounded-[12px] bg-[#007AFF]/10 flex items-center justify-center shrink-0">
                <Calendar className="w-[20px] h-[20px] text-[#007AFF]" />
              </div>
              <div className="flex-1">
                <p className="text-[17px] font-semibold text-[#1C1C1E]">{selectedWorkshop.time}</p>
                <p className="text-[15px] text-[#8E8E93]">{selectedWorkshop.day}</p>
              </div>
            </div>
            <div className="flex items-center gap-[16px] p-[20px] border-b border-[#F2F2F7]">
              <div className="w-[40px] h-[40px] rounded-[12px] bg-[#007AFF]/10 flex items-center justify-center shrink-0">
                <MapPin className="w-[20px] h-[20px] text-[#007AFF]" />
              </div>
              <div className="flex-1">
                <p className="text-[17px] font-semibold text-[#1C1C1E]">{selectedWorkshop.room}</p>
                <p className="text-[15px] text-[#007AFF] cursor-pointer">Xem bản đồ HCMUS</p>
              </div>
            </div>
            <div className="flex items-center gap-[16px] p-[20px]">
              <div className="w-[40px] h-[40px] rounded-[12px] bg-[#007AFF]/10 flex items-center justify-center shrink-0">
                <Ticket className="w-[20px] h-[20px] text-[#007AFF]" />
              </div>
              <div className="flex-1">
                <p className={`text-[17px] font-semibold ${selectedWorkshop.isFree ? 'text-[#34C759]' : 'text-[#5E5CE6]'}`}>
                  {selectedWorkshop.isFree ? 'Miễn phí tham dự' : `${selectedWorkshop.price.toLocaleString('vi-VN')} VNĐ`}
                </p>
                <p className="text-[15px] text-[#8E8E93]">Giá vé</p>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-[22px] font-bold text-[#1C1C1E] mb-[16px] tracking-tight">AI Tóm tắt nội dung</h2>
            <div className="p-[24px] bg-[#F2F2F7] rounded-[20px]">
              <p className="text-[17px] text-[#3A3A3C] leading-relaxed">
                {selectedWorkshop.aiSummary}
              </p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="sticky top-[80px] bg-white rounded-[24px] p-[24px] shadow-[0_8px_30px_rgba(0,0,0,0.08)] md:shadow-[0_16px_40px_rgba(0,0,0,0.08)] z-40 fixed md:relative bottom-0 left-0 right-0 md:bottom-auto rounded-b-none md:rounded-b-[24px] pb-safe">
            <div className="hidden md:block mb-[24px]">
              <h3 className="text-[20px] font-bold text-[#1C1C1E] mb-[16px]">Trạng thái chỗ ngồi</h3>
              <CapacityIndicator capacity={selectedWorkshop.capacity} booked={selectedWorkshop.booked} />
            </div>

            {paymentStatus === 'error' && (
              <div className="mb-[20px] p-[16px] bg-[#FF3B30]/10 rounded-[14px] flex items-start gap-[12px]">
                 <AlertCircle className="w-[20px] h-[20px] text-[#FF3B30] shrink-0" />
                 <p className="text-[14px] text-[#FF3B30] font-medium leading-tight">
                   Không thể kết nối cổng thanh toán. Hệ thống đang quá tải.
                 </p>
              </div>
            )}

            {selectedWorkshop.booked >= selectedWorkshop.capacity ? (
              <button disabled className="w-full bg-[#E5E5EA] text-[#8E8E93] text-[17px] font-semibold py-[14px] rounded-[14px] cursor-not-allowed">
                Đã hết chỗ
              </button>
            ) : paymentStatus === 'success' ? (
              <div className="w-full flex items-center justify-center gap-[8px] bg-[#34C759] text-white text-[17px] font-semibold py-[14px] rounded-[14px]">
                <CheckCircle2 className="w-[20px] h-[20px]" /> Đã lấy vé
              </div>
            ) : (
              <button 
                onClick={handleRegister}
                disabled={isRegistering}
                className={`w-full text-[17px] font-semibold py-[14px] rounded-[14px] flex items-center justify-center transition-all ${isRegistering ? 'bg-[#E5E5EA] text-[#8E8E93] cursor-wait' : 'bg-[#007AFF] text-white hover:bg-[#006DEB] shadow-[0_4px_12px_rgba(0,122,255,0.3)] active:scale-[0.98]'}`}
              >
                {isRegistering ? (
                  'Đang xử lý giao dịch...'
                ) : (
                  selectedWorkshop.isFree ? 'Nhận vé miễn phí' : `Thanh toán qua Apple Pay`
                )}
              </button>
            )}
            <p className="text-[13px] text-[#8E8E93] text-center mt-[16px] font-medium hidden md:block">
              Yêu cầu xác thực thẻ sinh viên khi check-in.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const TicketsView = () => (
    <div className="max-w-[800px] mx-auto px-[20px] md:px-[40px] py-[40px] animate-in fade-in duration-500 pb-[100px]">
      <h1 className="text-[34px] font-bold text-[#1C1C1E] mb-[32px] tracking-tight">Vé đã lưu</h1>

      {myTickets.length === 0 ? (
        <div className="text-center py-[80px]">
          <div className="w-[80px] h-[80px] bg-[#F2F2F7] rounded-[24px] flex items-center justify-center mx-auto mb-[20px]">
            <Ticket className="w-[40px] h-[40px] text-[#C7C7CC]" />
          </div>
          <p className="text-[17px] font-medium text-[#1C1C1E] mb-[8px]">Chưa có vé nào</p>
          <p className="text-[15px] text-[#8E8E93] mb-[24px]">Các vé workshop bạn đăng ký sẽ xuất hiện ở đây.</p>
          <button 
            onClick={() => setCurrentView('discover')}
            className="text-[17px] font-semibold text-[#007AFF] bg-[#007AFF]/10 px-[20px] py-[10px] rounded-full"
          >
            Tìm workshop
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-[24px]">
          {myTickets.map(ticket => (
            <div key={ticket.id} className="bg-white rounded-[24px] p-[24px] flex flex-col md:flex-row items-center gap-[24px] shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
              <div className="flex-1 w-full">
                <div className="flex items-center gap-[12px] mb-[12px]">
                  <span className="text-[#34C759] text-[13px] font-bold tracking-wide uppercase">Sắp diễn ra</span>
                  <span className="w-[4px] h-[4px] rounded-full bg-[#E5E5EA]"></span>
                  <span className="text-[13px] text-[#8E8E93] font-mono">{ticket.id}</span>
                </div>
                <h3 className="text-[22px] font-bold text-[#1C1C1E] leading-tight mb-[16px] tracking-tight">{ticket.workshop.title}</h3>
                
                <div className="bg-[#F2F2F7] rounded-[16px] p-[16px] flex flex-col sm:flex-row gap-[16px] sm:gap-[32px]">
                  <div>
                    <p className="text-[13px] text-[#8E8E93] mb-[2px] font-medium">Thời gian</p>
                    <p className="text-[15px] font-semibold text-[#1C1C1E]">{ticket.workshop.time}</p>
                    <p className="text-[13px] text-[#8E8E93]">{ticket.workshop.day}</p>
                  </div>
                  <div>
                    <p className="text-[13px] text-[#8E8E93] mb-[2px] font-medium">Địa điểm</p>
                    <p className="text-[15px] font-semibold text-[#1C1C1E]">{ticket.workshop.room}</p>
                  </div>
                </div>
              </div>
              
              <div className="w-full md:w-auto flex flex-col items-center justify-center shrink-0 bg-[#F2F2F7] p-[24px] rounded-[20px]">
                <div className="bg-white p-[12px] rounded-[16px] shadow-sm mb-[12px]">
                  <QrCode className="w-[120px] h-[120px] text-[#1C1C1E]" />
                </div>
                <p className="text-[13px] font-medium text-[#8E8E93]">Quét để Check-in</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F5F5F7] font-sans" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif' }}>
      <Header />
      <main>
        {currentView === 'discover' && <DiscoverView />}
        {currentView === 'detail' && <DetailView />}
        {currentView === 'tickets' && <TicketsView />}
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[rgba(255,255,255,0.8)] backdrop-blur-xl border-t border-[#E5E5EA] flex pb-safe pt-[8px] px-[16px] z-50 supports-backdrop-blur:bg-white/60">
        <button 
          onClick={() => setCurrentView('discover')}
          className={`flex-1 flex flex-col items-center justify-center gap-[4px] h-[50px] ${currentView === 'discover' ? 'text-[#007AFF]' : 'text-[#8E8E93]'}`}
        >
          <Search className="w-[24px] h-[24px]" />
          <span className="text-[10px] font-medium">Khám phá</span>
        </button>
        <button 
          onClick={() => setCurrentView('tickets')}
          className={`flex-1 flex flex-col items-center justify-center gap-[4px] h-[50px] ${currentView === 'tickets' ? 'text-[#007AFF]' : 'text-[#8E8E93]'}`}
        >
          <Ticket className="w-[24px] h-[24px]" />
          <span className="text-[10px] font-medium">Vé</span>
        </button>
      </nav>
    </div>
  );
}
