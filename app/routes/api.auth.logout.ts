import { data } from "react-router";
import type { Route } from "./+types/api.auth.logout";

// POST /api/auth/logout
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  // In a simple implementation, logout is handled client-side
  // by removing the session token from localStorage
  return data({ success: true });
}
