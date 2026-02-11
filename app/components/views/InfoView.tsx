import { useState } from "react";
import { useProject } from "~/context/ProjectContext";
import { Pencil, Eye } from "lucide-react";
import { Button } from "~/components/ui/button";

function renderMarkdown(text: string): string {
  // Simple markdown-to-HTML renderer for display mode
  let html = text
    // Escape HTML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-4 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold mt-5 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-6 mb-2">$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Inline code
    .replace(/`(.+?)`/g, '<code class="px-1 py-0.5 rounded bg-muted text-sm font-mono">$1</code>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr class="my-4 border-border" />')
    // Unordered list items
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    // Ordered list items
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    // Line breaks (double newline = paragraph break, single = br)
    .replace(/\n\n/g, "</p><p class=\"mb-2\">")
    .replace(/\n/g, "<br />");

  // Wrap in paragraph
  html = `<p class="mb-2">${html}</p>`;

  // Clean up empty paragraphs
  html = html.replace(/<p class="mb-2"><\/p>/g, "");

  return html;
}

export function InfoView() {
  const { parsed, setInfo } = useProject();
  const [isEditing, setIsEditing] = useState(false);
  const info = parsed?.info || "";

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <span className="text-sm font-medium text-muted-foreground">
          Project Info
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsEditing(!isEditing)}
          className="gap-1.5"
        >
          {isEditing ? (
            <>
              <Eye className="h-3.5 w-3.5" />
              Preview
            </>
          ) : (
            <>
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </>
          )}
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {isEditing ? (
          <textarea
            value={info}
            onChange={(e) => setInfo(e.target.value)}
            className="h-full w-full resize-none rounded-lg border border-input bg-background p-4 font-mono text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Write project info in markdown..."
            spellCheck={false}
          />
        ) : info.trim() ? (
          <div
            className="prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(info) }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            <div className="text-center">
              <p className="mb-2">No project info yet.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="gap-1.5"
              >
                <Pencil className="h-3.5 w-3.5" />
                Add Info
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
