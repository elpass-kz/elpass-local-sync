export interface HikUserInfo {
  employeeNo: string;
  name: string;
  gender?: 'male' | 'female';
  userType: 'normal' | 'blackList';
  Valid: {
    enable: boolean;
    beginTime: string;
    endTime: string;
  };
  doorRight: string;
  RightPlan: Array<{
    doorNo: number;
    planTemplateNo: string;
  }>;
  userVerifyMode?: 'cardOrfaceOrPw' | 'card' | 'face' | 'fingerPrint';
  password?: string;
}

export interface HikCardInfo {
  employeeNo: string;
  cardNo: string;
  cardType: 'normalCard' | 'disableCard' | 'blacklistCard';
}

export interface HikFaceDataRecord {
  name: string;
  FPID: string;
  FDID: string;
  faceLibType: 'blackFD' | 'whiteFD';
  city?: string;
  gender?: 'male' | 'female';
  certificateType?: string;
  certificateNumber?: string;
}

export interface HikUserInfoSearchCond {
  searchID: string;
  searchResultPosition: number;
  maxResults: number;
}

export interface HikUserInfoDelCond {
  EmployeeNoList: Array<{
    employeeNo: string | number;
  }>;
}

export interface HikResponse {
  statusCode?: number;
  subStatusCode?: string;
  statusString?: string;
  errorCode?: number;
  errorMsg?: string;
  [key: string]: any;
}
