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
 * Load credentials from AUTH_USERS env var (JSON string) or local file.
 * AUTH_USERS format: JSON string of { "users": [{ "username": "...", "password": "..." }] }
 */
function loadCredentials(): Credentials | null {
  // Prefer env var (works on Vercel and other serverless platforms)
  const envUsers = process.env.AUTH_USERS;
  if (envUsers) {
    try {
      return JSON.parse(envUsers) as Credentials;
    } catch (err) {
      console.error("Failed to parse AUTH_USERS env var:", err);
      return null;
    }
  }

  // Fall back to local file
  try {
    if (!fs.existsSync(CREDENTIALS_FILE)) {
      console.error("Credentials file not found and AUTH_USERS env var not set");
      return null;
    }
    const data = fs.readFileSync(CREDENTIALS_FILE, "utf-8");
    return JSON.parse(data) as Credentials;
  } catch (err) {
    console.error("Error reading credentials file:", err);
    return null;
  }
}

/**
 * Validate user credentials
 */
export function validateCredentials(username: string, password: string): boolean {
  const credentials = loadCredentials();
  if (!credentials) return false;

  const user = credentials.users.find(
    (u) => u.username === username && u.password === password
  );

  return !!user;
}

/**
 * Generate a simple session token
 */
export function generateSessionToken(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
