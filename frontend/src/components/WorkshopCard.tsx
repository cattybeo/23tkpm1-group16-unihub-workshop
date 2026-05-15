import { Clock, MapPin, Ticket } from 'lucide-react';
import { Workshop } from '@/types/workshop';
import { CapacityIndicator } from './CapacityIndicator';

interface WorkshopCardProps {
  workshop: Workshop;
  onClick: () => void;
}

export function WorkshopCard({ workshop, onClick }: WorkshopCardProps) {
  return (
    <div
      className="bg-white rounded-[24px] overflow-hidden cursor-pointer shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:shadow-[0_16px_40px_rgba(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300 flex flex-col h-full group"
      onClick={onClick}
    >
      <div className="h-[200px] w-full relative overflow-hidden bg-[#F2F2F7]">
        <img src={workshop.image} alt={workshop.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out" />
      </div>

      <div className="p-[24px] flex flex-col flex-1">
        <h2 className="text-[20px] font-bold leading-tight text-[#1C1C1E] mb-[8px] line-clamp-2 tracking-tight">{workshop.title}</h2>
        <p className="text-[15px] text-[#8E8E93] mb-[20px] font-medium line-clamp-1">{workshop.speaker}</p>

        <div className="mt-auto space-y-[10px] mb-[20px]">
          <div className="flex items-center text-[14px] text-[#3A3A3C] gap-[10px]">
            <Clock className="w-[16px] h-[16px] text-[#8E8E93]" />
            <span className="font-medium">{workshop.day.split(' - ')[0]} • {workshop.time}</span>
          </div>
          <div className="flex items-center text-[14px] text-[#3A3A3C] gap-[10px]">
            <MapPin className="w-[16px] h-[16px] text-[#8E8E93]" />
            <span className="font-medium truncate">{workshop.room}</span>
          </div>
          <div className="flex items-center text-[14px] gap-[10px]">
            <Ticket className="w-[16px] h-[16px] text-[#8E8E93]" />
            <span className={`font-semibold ${workshop.isFree ? 'text-[#34C759]' : 'text-[#5E5CE6]'}`}>
              {workshop.isFree ? 'Miễn phí' : `${workshop.price.toLocaleString('vi-VN')}đ`}
            </span>
          </div>
        </div>

        <div className="pt-[16px] border-t border-[#F2F2F7]">
          <CapacityIndicator capacity={workshop.capacity} booked={workshop.booked} />
        </div>
      </div>
    </div>
  );
}
