export interface Terminal {
  id: string;
  url: string;
  name?: string;
  type: "H" | "hik" | "D" | "dah";
  online?: boolean;
  disabled?: boolean;
  host?: string;
  meta_?: {
    zone?: string;
    terminal?: string;
    direction?: string;
    username: string;
    password: string;
    local_ip?: string;
    timestamp?: string;
    error_last?: string;
    new?: boolean;
    objectGuid?: string;
    objectName?: string;
    fizcardCreate?: boolean;
  };
}

export interface TerminalCredentials {
  username: string;
  password: string;
}
