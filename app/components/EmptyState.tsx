import { Sparkles } from "lucide-react";

const STARTER_PROMPTS = [
  "Build an AI dashboard with Alice on frontend, Bob on backend, and Carol on ML, over 4 weeks.",
  "Plan a mobile app launch with 5 engineers, QA, and design phases",
  "Organize a marketing campaign with content, design, and analytics teams for Q2",
];

interface EmptyStateProps {
  onPromptSelect?: (prompt: string) => void;
}

export function EmptyState({ onPromptSelect }: EmptyStateProps) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-lg text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Sparkles className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Welcome to Agentic PM</h2>
        <p className="text-muted-foreground mb-8">
          Describe your project in natural language below. AI will structure it
          into people, tasks, and timelines automatically.
        </p>
        <div className="space-y-3 text-left">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Try something like:
          </p>
          {STARTER_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => onPromptSelect?.(prompt)}
              className="w-full rounded-lg border bg-card p-3 text-sm text-muted-foreground italic hover:bg-muted hover:border-primary/50 transition-colors cursor-pointer text-left"
            >
              "{prompt}"
            </button>
          ))}
        </div>
        <p className="mt-6 text-xs text-muted-foreground flex items-center justify-center gap-1">
          <Sparkles className="h-3 w-3" />
          Type your project description below
        </p>
      </div>
    </div>
  );
}
