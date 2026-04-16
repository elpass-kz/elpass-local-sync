export interface DahuaUserInfo {
  CardName: string;
  CardNo: string;
  UserID: string;
  CardStatus: 0 | 1; // 0 = normal, 1 = blocked
  Password?: string;
  ValidDateStart?: string; // Format: YYYYMMDD HHMMSS
  ValidDateEnd?: string; // Format: YYYYMMDD HHMMSS
}

export interface DahuaUpdateUserInfo {
  recno: string;
  CardName: string;
  CardStatus: 0 | 1;
  ValidDateStart: string;
  ValidDateEnd: string;
  Password?: string;
}

export interface DahuaPhotoData {
  UserID: string;
  Info: {
    PhotoData: string[]; // base64 encoded photos
  };
}

export interface DahuaDeleteCard {
  recno: string;
}

export interface DahuaFaceToken {
  Token: string;
}

export interface DahuaFaceDataRequest {
  Token: string;
  Offset: number;
  Count: number;
}

export interface DahuaResponse {
  [key: string]: any;
}

