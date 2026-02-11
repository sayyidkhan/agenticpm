import { data } from "react-router";
import type { Route } from "./+types/api.ai";
import { createProjectFromPrompt, updateProjectFromPrompt } from "~/lib/openai";

// POST /api/ai — create or update project via AI
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json();
  const { type, prompt, currentText, currentSprint } = body as {
    type: "create" | "update";
    prompt: string;
    currentText?: string;
    currentSprint?: string;
  };

  if (!prompt?.trim()) {
    return data({ error: "Prompt is required" }, { status: 400 });
  }

  try {
    let text: string;
    if (type === "update" && currentText) {
      text = await updateProjectFromPrompt(currentText, prompt, currentSprint);
    } else {
      text = await createProjectFromPrompt(prompt);
    }
    return data({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI request failed";
    return data({ error: message }, { status: 500 });
  }
}
