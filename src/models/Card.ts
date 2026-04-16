export interface Card {
  id?: string;
  uuid?: string;
  no: string | number;
  name: string;
  photo?: string;
  isBlocked: boolean;
  isDisabled?: boolean;
  begin_at?: string | Date;
  end_at?: string | Date;
  deleted_at?: string | Date | null;
  meta_?: {
    pin?: string;
    passType?: string;
    zone?: string;
    zones?: string | string[];
    entranceNumber?: string;
    toProcess?: {
      zones: string | string[];
    };
    objectGuid?: string;
    objectName?: string;
    guid?: string;
    flatno?: string;
    elpark?: {
      photo?: string;
      opened_in?: string;
    };
    /** Booking system zones tracking */
    bookingZones?: {
      added: string[];
      removed: string[];
    };
    /** Zone change history with timestamps (max 20 entries) */
    zoneHistory?: Array<{
      action: "added" | "removed" | "add_error" | "remove_error";
      zone: string;
      time: string;
    }>;
  };
  status?: {
    card?: {
      ver?: number;
      [terminalId: string]:
        | {
            ver: number;
            error?: string | null;
          }
        | number
        | undefined;
    };
    photo?: {
      ver?: number;
      [terminalId: string]:
        | {
            ver: number;
            error?: string | null;
          }
        | number
        | undefined;
    };
  };
  group?: string;
  groups?: string[];
  host?: string;
  s_user?: string;
  isOK?: boolean | null;
  created_at?: string | Date;
  updated_at?: string | Date;
}

export interface CardStatus {
  recno?: number;
  ver?: number;
  error?: string | null;
}
