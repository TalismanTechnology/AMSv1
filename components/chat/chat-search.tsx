"use client";

import { useState, useCallback } from "react";
import { Search, X, MessageSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { searchChatMessages } from "@/actions/chat";
import { TimeAgo } from "@/components/ui/time-ago";

interface SearchResult {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  sessionTitle: string;
  createdAt: string;
}

interface ChatSearchProps {
  onSelectSession: (sessionId: string) => void;
  onClose: () => void;
  schoolId?: string;
}

export function ChatSearch({ onSelectSession, onClose, schoolId }: ChatSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    const { results: data } = await searchChatMessages(query.trim(), schoolId!);
    setResults(data || []);
    setSearching(false);
  }, [query, schoolId]);

  function highlightMatch(text: string) {
    const maxLen = 120;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const idx = lowerText.indexOf(lowerQuery);

    if (idx === -1) return text.slice(0, maxLen) + (text.length > maxLen ? "..." : "");

    const start = Math.max(0, idx - 40);
    const end = Math.min(text.length, idx + query.length + 40);
    const snippet = (start > 0 ? "..." : "") + text.slice(start, end) + (end < text.length ? "..." : "");

    return snippet;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Search messages..."
          className="h-8 text-sm"
          autoFocus
        />
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {searching && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Searching...
          </div>
        )}
        {!searching && results.length === 0 && query.trim() && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No results found
          </div>
        )}
        {!searching &&
          results.map((result) => (
            <div
              key={result.id}
              className="cursor-pointer border-b px-4 py-3 transition-colors hover:bg-accent"
              onClick={() => onSelectSession(result.sessionId)}
            >
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <MessageSquare className="h-3 w-3" />
                <span className="truncate">{result.sessionTitle}</span>
                <span className="ml-auto shrink-0">
                  <TimeAgo date={result.createdAt} />
                </span>
              </div>
              <p className="text-sm text-foreground line-clamp-2">
                {highlightMatch(result.content)}
              </p>
            </div>
          ))}
      </ScrollArea>
    </div>
  );
}
