"use client";

import { useState, useTransition, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { MagicBentoCard } from "@/components/magic-bento";
import {
  HelpCircle,
  ChevronDown,
  ChevronUp,
  X,
  Trash2,
  MessageSquarePlus,
  Send,
  Search,
  Flame,
  TrendingUp,
} from "lucide-react";
import { LogoSpinner } from "@/components/logo-spinner";
import { formatDistanceToNow } from "date-fns";
import {
  dismissUnansweredQuestion,
  dismissUnansweredCluster,
  answerUnansweredCluster,
  type UnansweredQuestionGroup,
} from "@/actions/unanswered-questions";
import { useRouter } from "next/navigation";

export function UnansweredQuestionsSection({
  groups,
  schoolId,
}: {
  groups: UnansweredQuestionGroup[];
  schoolId: string;
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [answeringIndex, setAnsweringIndex] = useState<number | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const totalCount = groups.reduce((sum, g) => sum + g.count, 0);

  const filteredGroups = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return groups;

    return groups
      .map((group) => {
        if (group.label.toLowerCase().includes(query)) {
          return group;
        }

        const matchingQuestions = group.questions.filter((q) =>
          q.question.toLowerCase().includes(query)
        );

        if (matchingQuestions.length === 0) return null;

        return {
          ...group,
          questions: matchingQuestions,
          count: matchingQuestions.length,
        };
      })
      .filter((g): g is UnansweredQuestionGroup => g !== null);
  }, [groups, searchQuery]);

  const filteredCount = filteredGroups.reduce((sum, g) => sum + g.count, 0);

  function handleSearchChange(value: string) {
    setSearchQuery(value);
    setExpandedIndex(null);
    if (answeringIndex !== null) {
      setAnsweringIndex(null);
      setAnswerText("");
    }
  }

  function handleDismissCluster(questionIds: string[]) {
    startTransition(async () => {
      await dismissUnansweredCluster(questionIds);
      router.refresh();
    });
  }

  function handleDismissQuestion(questionId: string) {
    startTransition(async () => {
      await dismissUnansweredQuestion(questionId);
      router.refresh();
    });
  }

  function handleStartAnswering(index: number) {
    setAnsweringIndex(index);
    setAnswerText("");
  }

  function handleCancelAnswering() {
    setAnsweringIndex(null);
    setAnswerText("");
  }

  function handleSubmitAnswer(group: UnansweredQuestionGroup) {
    if (!answerText.trim()) return;
    startTransition(async () => {
      const result = await answerUnansweredCluster(
        schoolId,
        group.label,
        answerText.trim(),
        group.questions.map((q) => q.id)
      );
      if (result.error) {
        console.error("Failed to answer:", result.error);
      } else {
        setAnsweringIndex(null);
        setAnswerText("");
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <HelpCircle className="h-5 w-5 text-amber-500" />
        <h2 className="text-lg font-semibold">Unanswered Questions</h2>
        <Badge variant="secondary">
          {searchQuery ? `${filteredCount} / ${totalCount}` : totalCount}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Questions where the chatbot couldn&apos;t find any information. Answer
        them to automatically create a document the chatbot can reference.
      </p>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search questions..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9 pr-9"
        />
        {searchQuery && (
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => handleSearchChange("")}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {filteredGroups.length === 0 ? (
        <MagicBentoCard enableBorderGlow enableParticles={false} className="rounded-lg">
          <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
            {searchQuery ? "No questions match your search" : "No unanswered questions"}
          </div>
        </MagicBentoCard>
      ) : (
      <div className="grid gap-3">
        {filteredGroups.map((group, index) => (
          <MagicBentoCard
            key={index}
            enableBorderGlow
            enableParticles={false}
            className="rounded-lg"
          >
            <Card className="metallic-card">
              <CardHeader
                className="pb-2 cursor-pointer"
                onClick={() =>
                  setExpandedIndex(expandedIndex === index ? null : index)
                }
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <CardTitle className="text-sm truncate">
                      {group.label}
                    </CardTitle>
                    <Badge variant="outline" className="shrink-0">
                      {group.count}
                    </Badge>
                    {group.count >= 10 ? (
                      <Badge className="shrink-0 bg-red-500/15 text-red-500 border-red-500/30 hover:bg-red-500/20">
                        <Flame className="h-3 w-3 mr-0.5" />
                        Hot
                      </Badge>
                    ) : group.count >= 5 ? (
                      <Badge className="shrink-0 bg-amber-500/15 text-amber-500 border-amber-500/30 hover:bg-amber-500/20">
                        <TrendingUp className="h-3 w-3 mr-0.5" />
                        Trending
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(group.newestDate), {
                        addSuffix: true,
                      })}
                    </span>
                    {expandedIndex === index ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </div>
              </CardHeader>
              {expandedIndex === index && (
                <CardContent className="pt-0">
                  <div className="space-y-1">
                    {group.questions.map((q) => (
                      <div
                        key={q.id}
                        className="flex items-center justify-between text-sm py-1.5 border-b last:border-0"
                      >
                        <span className="text-muted-foreground truncate mr-2">
                          {q.question}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(q.created_at), {
                              addSuffix: true,
                            })}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDismissQuestion(q.id);
                            }}
                            disabled={isPending}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {answeringIndex === index ? (
                    <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
                      <Textarea
                        placeholder="Type the answer that the chatbot should give for these questions..."
                        value={answerText}
                        onChange={(e) => setAnswerText(e.target.value)}
                        rows={4}
                        className="resize-none"
                        disabled={isPending}
                        autoFocus
                      />
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCancelAnswering}
                          disabled={isPending}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSubmitAnswer(group)}
                          disabled={isPending || !answerText.trim()}
                        >
                          {isPending ? (
                            <LogoSpinner size={12} className="mr-1" />
                          ) : (
                            <Send className="h-3 w-3 mr-1" />
                          )}
                          Submit Response
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDismissCluster(
                            group.questions.map((q) => q.id)
                          );
                        }}
                        disabled={isPending}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Dismiss
                      </Button>
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartAnswering(index);
                        }}
                        disabled={isPending}
                      >
                        <MessageSquarePlus className="h-3 w-3 mr-1" />
                        Respond
                      </Button>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          </MagicBentoCard>
        ))}
      </div>
      )}
    </div>
  );
}
