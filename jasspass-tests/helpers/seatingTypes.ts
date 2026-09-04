export type SeatStatus = 'Available' | 'Reserved' | 'Booked' | 'Blocked';

export type SeatingSeatInput = {
  Number: string;
  TicketTypeId?: string | null;
};

export type SeatingSectionInput = {
  Name: string;
  Code: string;
  TicketTypeId: string | null;
  StageSide?: 0 | 1;
  FillPriority?: number;
  Rows: Array<{
    Label: string;
    Seats: SeatingSeatInput[];
  }>;
};

export type SeatingSelectionRulesInput = {
  NoOrphanSeats: boolean;
  AutoAssignSeats?: boolean;
  Strategy?: 0 | 1 | 2;
};

export type SeatingMapDefinition = {
  Sections: SeatingSectionInput[];
  SelectionRules?: SeatingSelectionRulesInput | null;
  Props?: unknown[];
};

export type HeldSeat = {
  SeatLabel: string;
  TicketTypeId: string | null;
};

export type HoldResponse = {
  HoldToken: string;
  ExpiresAtUtc: string;
  Seats?: HeldSeat[];
  SeatLabels: string[];
  Validation?: {
    Valid: boolean;
    OrphanSeatLabels: string[];
  } | null;
};

export type SeatingMapResponse = {
  Id: string;
  EventId: string;
  IsPublished: boolean;
  SellableTicketTypeIds?: string[];
  SelectionRules?: SeatingSelectionRulesInput | null;
  Sections: Array<{
    Id: string;
    Name: string;
    Code: string;
    TicketTypeId: string | null;
    StageSide?: 0 | 1;
    FillPriority?: number;
    Rows: Array<{
      Label: string;
      Seats: Array<{
        Label: string;
        Number: string;
        TicketTypeId?: string | null;
        EffectiveTicketTypeId?: string | null;
      }>;
    }>;
  }>;
};

export type SeatingAvailabilityResponse = {
  EventId: string;
  Seats: Array<{ Label: string; Status: SeatStatus }>;
};
