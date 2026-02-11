import * as fs from "node:fs";
import * as path from "node:path";

interface User {
  username: string;
  password: string;
}

interface Credentials {
  users: User[];
}

const CREDENTIALS_FILE = path.resolve(process.cwd(), "user_credentials.json");

/**
 * Validate user credentials
 */
export function validateCredentials(username: string, password: string): boolean {
  try {
    if (!fs.existsSync(CREDENTIALS_FILE)) {
      console.error("Credentials file not found");
      return false;
    }

    const data = fs.readFileSync(CREDENTIALS_FILE, "utf-8");
    const credentials: Credentials = JSON.parse(data);

    const user = credentials.users.find(
      (u) => u.username === username && u.password === password
    );

    return !!user;
  } catch (err) {
    console.error("Error validating credentials:", err);
    return false;
  }
}

/**
 * Generate a simple session token
 */
export function generateSessionToken(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
