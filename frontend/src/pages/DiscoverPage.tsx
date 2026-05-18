import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { WorkshopCard } from '@/components/WorkshopCard';
import { api } from '@/lib/api-client';
import { supabase } from '@/lib/supabase';
import { type WorkshopRow, workshopRowToDisplay } from '@/types/workshop';

export function DiscoverPage() {
  const navigate = useNavigate();
  const [workshops, setWorkshops] = useState<WorkshopRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<WorkshopRow[]>('/workshops')
      .then(setWorkshops)
      .catch(() => setError('Không thể tải danh sách workshop. Vui lòng thử lại.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('workshops-discover')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'workshops' },
        payload => {
          const next = payload.new as Partial<WorkshopRow> & { id: string };
          setWorkshops(prev => prev.map(row => (row.id === next.id ? { ...row, ...next } : row)));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
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
        {loading && (
          <div className="flex justify-center py-[80px]">
            <div className="w-8 h-8 border-4 border-[#007AFF] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {error && (
          <p className="text-center text-[#FF3B30] py-[40px]">{error}</p>
        )}
        {!loading && !error && workshops.length === 0 && (
          <p className="text-center text-[#8E8E93] py-[40px]">Chưa có workshop nào được publish.</p>
        )}
        {!loading && !error && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[24px]">
            {workshops.map((ws) => (
              <WorkshopCard
                key={ws.id}
                workshop={workshopRowToDisplay(ws)}
                onClick={() => navigate(`/workshop/${ws.id}`)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
