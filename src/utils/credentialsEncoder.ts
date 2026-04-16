export function formatCredentials(username: string, password: string): string {
  if (!username || !password) {
    throw new Error("Username and password must not be empty");
  }

  const creds = `${username}:${password}`;
  const encodedCreds = new TextEncoder().encode(creds);
  const base64Creds = Buffer.from(encodedCreds).toString("base64");

  return base64Creds;
}

export function decodeCredentials(base64Creds: string): {
  username: string;
  password: string;
} {
  if (!base64Creds) {
    throw new Error("Credentials must not be empty");
  }

  try {
    const decoded = Buffer.from(base64Creds, "base64").toString("utf-8");
    const [username, password] = decoded.split(":");

    if (!username || !password) {
      throw new Error("Invalid credentials format");
    }

    return { username, password };
  } catch (error) {
    throw new Error("Failed to decode credentials");
  }
}
