interface CapacityIndicatorProps {
  capacity: number;
  booked: number;
}

export function CapacityIndicator({ capacity, booked }: CapacityIndicatorProps) {
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
}
