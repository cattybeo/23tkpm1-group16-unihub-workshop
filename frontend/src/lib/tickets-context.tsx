import { createContext, useContext, useState, ReactNode } from 'react';
import { Ticket } from '@/types/workshop';

interface TicketsContextType {
  myTickets: Ticket[];
  addTicket: (ticket: Ticket) => void;
}

const TicketsContext = createContext<TicketsContextType | undefined>(undefined);

export function TicketsProvider({ children }: { children: ReactNode }) {
  const [myTickets, setMyTickets] = useState<Ticket[]>([]);

  const addTicket = (ticket: Ticket) => {
    setMyTickets((prev) => [...prev, ticket]);
  };

  return (
    <TicketsContext.Provider value={{ myTickets, addTicket }}>
      {children}
    </TicketsContext.Provider>
  );
}

export function useTickets() {
  const context = useContext(TicketsContext);
  if (context === undefined) {
    throw new Error('useTickets must be used within a TicketsProvider');
  }
  return context;
}
