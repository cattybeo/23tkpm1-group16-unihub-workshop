export interface Workshop {
  id: string;
  title: string;
  speaker: string;
  day: string;
  time: string;
  room: string;
  capacity: number;
  booked: number;
  price: number;
  isFree: boolean;
  image: string;
  aiSummary: string;
}

export interface Ticket {
  id: string;
  workshop: Workshop;
  status: 'upcoming' | 'completed' | 'cancelled';
}
