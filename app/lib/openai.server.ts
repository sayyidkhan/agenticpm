import OpenAI from "openai";

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OpenAI API key not provided. Set OPENAI_API_KEY environment variable.");
  }
  return new OpenAI({ apiKey });
}

const SYSTEM_PROMPT = `You are an expert project manager AI. Given a project description, you must generate a structured project plan in Markdown format.

The format MUST follow this exact structure:

# Project: <Project Name>

## Sprint Configuration
- Duration: <number> weeks (default 2)
- Start Date: <YYYY-MM-DD> (use a reasonable future date)
- Active Sprint: <Sprint Name> (set to the first sprint/phase)

## People
- <Name>: <responsibility1>, <responsibility2>, ...

## Timeline
- <Period>: (YYYY-MM-DD to YYYY-MM-DD) [percentage%] {actual: YYYY-MM-DD to YYYY-MM-DD} <description>
  - Planned dates in parentheses (), actual dates in curly braces {actual: ...}
  - percentage is progress (0-100)

## Tasks
- <Task description> (<Assignee>) {Sprint/Phase} <remarks> [status]
- <Task description> (<Assignee>) {Sprint/Phase} [in-progress]
- <Task description> (<Assignee>) {Sprint/Phase} [done]

Rules:
- Every task MUST have an assignee in parentheses
- Tasks SHOULD have sprint/phase assignments in curly braces matching timeline entries
- Timeline entries should have date ranges and percentage values that sum to 100%
- Assign tasks logically to sprints based on dependencies and team capacity
- Each person should have clear responsibilities
- Break down the project into logical phases/sprints
- Distribute tasks evenly across team members
- Set Active Sprint to the first sprint/phase by default
- Remarks can be added in angle brackets <remark text> before the status
- Status MUST be one of: [todo], [in-progress], [done]. Do NOT use [pending], [not started], [completed], etc.
- Output ONLY the Markdown. No explanations, no code fences, no extra text.`;

const UPDATE_SYSTEM_PROMPT = `You are an expert project manager AI. You receive a current project definition in structured Markdown and an update instruction. You must apply the instruction and return the FULL updated project Markdown.

The format MUST follow this exact structure:

# Project: <Project Name>

## Sprint Configuration
- Duration: <number> weeks
- Start Date: <YYYY-MM-DD>
- Active Sprint: <Sprint Name> (which sprint the project is currently on)
- Current Sprint: <Sprint Name> (optional, for chat context)

## People
- <Name>: <responsibility1>, <responsibility2>, ...

## Timeline
- <Period>: (YYYY-MM-DD to YYYY-MM-DD) [percentage%] {actual: YYYY-MM-DD to YYYY-MM-DD} <description>
  - Planned dates in parentheses (), actual dates in curly braces {actual: ...}
  - percentage is progress (0-100)

## Tasks
- <Task description> (<Assignee>) {Sprint/Phase} <remarks> [status]
- <Task description> (<Assignee>) {Sprint/Phase} [in-progress]
- <Task description> (<Assignee>) {Sprint/Phase} [done]

Rules:
- Preserve all existing data unless the instruction explicitly changes it
- Every task MUST have an assignee in parentheses
- Tasks SHOULD have sprint/phase assignments in curly braces matching timeline entries
- Timeline entries should maintain their date ranges and percentages unless explicitly updated
- If updating progress, adjust the percentage values accordingly
- If a person is removed, reassign or remove their tasks
- If a new person is added, they should have responsibilities
- When reassigning tasks to different sprints, ensure logical distribution based on dependencies
- When the user asks to "move to Sprint X" or "change to Sprint X", update the "Active Sprint" field
- Remarks can be added in angle brackets <remark text> before the status
- Status MUST be one of: [todo], [in-progress], [done]. Do NOT use [pending], [not started], [completed], etc.
- When updating actual dates, use {actual: YYYY-MM-DD to YYYY-MM-DD} format
- Preserve existing actual dates unless explicitly changed
- Output ONLY the updated Markdown. No explanations, no code fences, no extra text.`;

export async function createProjectFromPrompt(prompt: string): Promise<string> {
  const client = getClient();
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    temperature: 0.3,
    max_tokens: 2000,
  });
  const text = response.choices[0]?.message?.content?.trim() || "";
  return stripCodeFences(text);
}

export async function updateProjectFromPrompt(
  currentProject: string,
  instruction: string,
  currentSprint?: string
): Promise<string> {
  const client = getClient();

  // Add sprint context to instruction if available
  let contextualInstruction = instruction;
  if (currentSprint) {
    contextualInstruction = `[CONTEXT: Currently working on "${currentSprint}"]\n\n${instruction}`;
  }

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: UPDATE_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Current project:\n\n${currentProject}\n\nInstruction: ${contextualInstruction}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 2000,
  });
  const text = response.choices[0]?.message?.content?.trim() || "";
  return stripCodeFences(text);
}

function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:markdown|md)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
}
