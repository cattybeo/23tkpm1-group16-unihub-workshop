import { Workshop } from '@/types/workshop';

export const MOCK_WORKSHOPS: Workshop[] = [
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
