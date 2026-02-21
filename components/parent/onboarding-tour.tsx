"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { completeOnboarding } from "@/actions/profile";

const STEPS = [
  {
    title: "Welcome to AskMySchool!",
    description:
      "Let's take a quick tour of the features available to you. This will only take a moment.",
    target: null,
  },
  {
    title: "Dashboard",
    description:
      "Your dashboard shows a quick overview of recent announcements, upcoming events, and quick links to key features.",
    target: '[href="/parent"]',
  },
  {
    title: "AI Chat",
    description:
      "Ask any question about the school — policies, schedules, forms, and more. Our AI assistant uses official school documents to answer.",
    target: '[href="/parent/chat"]',
  },
  {
    title: "Announcements & Events",
    description:
      "Stay up to date with school announcements and upcoming events. Important items will appear as banners at the top.",
    target: '[href="/parent/announcements"]',
  },
  {
    title: "You're all set!",
    description:
      "Explore the app at your own pace. If you have questions, the AI chat is always here to help.",
    target: null,
  },
];

interface OnboardingTourProps {
  show: boolean;
}

export function OnboardingTour({ show }: OnboardingTourProps) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(show);
  const [highlight, setHighlight] = useState<DOMRect | null>(null);

  const currentStep = STEPS[step];

  const updateHighlight = useCallback(() => {
    if (currentStep.target) {
      const el = document.querySelector(currentStep.target);
      if (el) {
        setHighlight(el.getBoundingClientRect());
        return;
      }
    }
    setHighlight(null);
  }, [currentStep.target]);

  useEffect(() => {
    updateHighlight();
    window.addEventListener("resize", updateHighlight);
    return () => window.removeEventListener("resize", updateHighlight);
  }, [updateHighlight]);

  async function handleFinish() {
    setVisible(false);
    await completeOnboarding();
  }

  function handleNext() {
    if (step === STEPS.length - 1) {
      handleFinish();
    } else {
      setStep(step + 1);
    }
  }

  function handlePrev() {
    if (step > 0) setStep(step - 1);
  }

  function handleSkip() {
    handleFinish();
  }

  if (!visible) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100]">
        {/* Overlay */}
        <div className="absolute inset-0 bg-black/60" onClick={handleSkip} />

        {/* Highlight ring */}
        {highlight && (
          <motion.div
            className="absolute rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-background pointer-events-none"
            initial={false}
            animate={{
              top: highlight.top - 4,
              left: highlight.left - 4,
              width: highlight.width + 8,
              height: highlight.height + 8,
            }}
            transition={{ duration: 0.3 }}
            style={{ zIndex: 101 }}
          />
        )}

        {/* Tooltip card */}
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-sm rounded-xl bg-card border border-border p-6 shadow-2xl"
          style={{ zIndex: 102 }}
        >
          <button
            onClick={handleSkip}
            className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>

          <h3 className="text-lg font-semibold mb-2">{currentStep.title}</h3>
          <p className="text-sm text-muted-foreground mb-6">
            {currentStep.description}
          </p>

          <div className="flex items-center justify-between">
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step
                      ? "w-6 bg-primary"
                      : i < step
                        ? "w-1.5 bg-primary/40"
                        : "w-1.5 bg-muted"
                  }`}
                />
              ))}
            </div>
            <div className="flex gap-2">
              {step > 0 && (
                <Button variant="ghost" size="sm" onClick={handlePrev}>
                  <ArrowLeft className="mr-1 h-3 w-3" />
                  Back
                </Button>
              )}
              <Button size="sm" onClick={handleNext}>
                {step === STEPS.length - 1 ? "Get Started" : "Next"}
                {step < STEPS.length - 1 && (
                  <ArrowRight className="ml-1 h-3 w-3" />
                )}
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
