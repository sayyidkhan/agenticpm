import { data } from "react-router";
import type { Route } from "./+types/api.auth.login";
import { validateCredentials, generateSessionToken } from "~/lib/auth.server";

// POST /api/auth/login
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json();
  const { username, password } = body as { username: string; password: string };

  if (!username || !password) {
    return data({ error: "Username and password are required" }, { status: 400 });
  }

  const isValid = validateCredentials(username, password);

  if (!isValid) {
    return data({ error: "Invalid credentials" }, { status: 401 });
  }

  // Generate session token
  const sessionToken = generateSessionToken();

  return data({
    success: true,
    username,
    sessionToken,
  });
}
