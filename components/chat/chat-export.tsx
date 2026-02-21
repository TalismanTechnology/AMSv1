"use client";

import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ChatExportProps {
  messages: { role: string; content: string }[];
  sessionTitle?: string;
}

export function ChatExport({ messages, sessionTitle }: ChatExportProps) {
  function exportAsText() {
    const title = sessionTitle || "Chat Export";
    const lines = messages.map(
      (m) => `${m.role === "user" ? "You" : "Assistant"}:\n${m.content}\n`
    );
    const text = `${title}\n${"=".repeat(title.length)}\n\n${lines.join("\n---\n\n")}`;

    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9]/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportAsPrint() {
    const title = sessionTitle || "Chat Export";
    const html = `
      <html><head><title>${title}</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 700px; margin: 0 auto; padding: 40px 20px; }
        h1 { font-size: 18px; border-bottom: 1px solid #ddd; padding-bottom: 8px; }
        .msg { margin: 16px 0; }
        .role { font-weight: 600; font-size: 13px; color: #666; margin-bottom: 4px; }
        .content { white-space: pre-wrap; font-size: 14px; line-height: 1.6; }
        hr { border: none; border-top: 1px solid #eee; margin: 16px 0; }
      </style></head><body>
      <h1>${title}</h1>
      ${messages
        .map(
          (m) =>
            `<div class="msg"><div class="role">${m.role === "user" ? "You" : "Assistant"}</div><div class="content">${m.content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div></div><hr/>`
        )
        .join("")}
      </body></html>`;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.print();
    }
  }

  if (messages.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Export chat">
          <Download className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportAsText}>
          <FileText className="mr-2 h-4 w-4" />
          Download as Text
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportAsPrint}>
          <FileText className="mr-2 h-4 w-4" />
          Print / Save as PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
