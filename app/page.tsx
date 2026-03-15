"use client";

import Link from "next/link";
import { useRef, useEffect, useState, useCallback } from "react";
import { useInView } from "framer-motion";
import {
  MessageSquare,
  FileText,
  Shield,
  Upload,
  Sparkles,
  CheckCircle,
  Volume2,
  VolumeX,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  RevealOnScroll,
  RevealOnScrollDirectional,
  StaggerChildren,
  AnimatedNumber,
  ScrollProgressBar,
  ScrollHeader,
  BlurReveal,
  SlotMachineHero,
  motion,
  fadeInUp,
  metallicCardEntrance,
} from "@/components/motion";
import { Logo } from "@/components/logo";

const testimonials = [
  {
    quote:
      "I found the school dress code policy in seconds instead of digging through a 40-page handbook. This is a game changer for busy parents.",
    name: "Sarah M.",
    initials: "SM",
    role: "Parent, Grade 3",
  },
  {
    quote:
      "No more digging through emails and PDFs. I just ask my question and get a clear answer with the exact source document.",
    name: "James K.",
    initials: "JK",
    role: "Parent, Grade 5",
  },
  {
    quote:
      "The AI answers are surprisingly accurate and always cite the official school documents. I trust it completely.",
    name: "Emily R.",
    initials: "ER",
    role: "Parent, Grade 1",
  },
];

const howItWorks = [
  {
    icon: Upload,
    title: "Admin uploads documents",
    description:
      "School administrators upload handbooks, policies, calendars, and other official documents to the platform.",
    neon: "neon-icon-blue",
  },
  {
    icon: Sparkles,
    title: "AI processes & indexes",
    description:
      "Our AI reads, understands, and indexes every document so it can instantly find relevant answers to any question.",
    neon: "neon-icon-amber",
  },
  {
    icon: CheckCircle,
    title: "Parents ask, AI answers",
    description:
      "Parents type questions in plain English and get accurate answers with citations to the exact source documents.",
    neon: "neon-icon-green",
  },
];

// Segments: video time ranges + audio clips with natural durations
// Video playback rate adjusts per segment so video matches audio timing
const segments = [
  { videoStart: 0, videoEnd: 5.2, audioDuration: 4.911, text: "Meet Sarah. She's a busy parent trying to find her school's dress code policy.", audio: "/audio/clip1.mp3" },
  { videoStart: 5.2, videoEnd: 11.3, audioDuration: 6.348, text: "Buried in outdated websites, 40-page handbooks, and endless email chains.", audio: "/audio/clip2.mp3" },
  { videoStart: 11.3, videoEnd: 14.8, audioDuration: 2.142, text: "What if there was a better way?", audio: "/audio/clip3.mp3" },
  { videoStart: 14.8, videoEnd: 20.9, audioDuration: 4.859, text: "Introducing AskMySchool — your school's AI-powered assistant.", audio: "/audio/clip4.mp3" },
  { videoStart: 20.9, videoEnd: 24.3, audioDuration: 2.638, text: "Just type your question in plain English.", audio: "/audio/clip5.mp3" },
  { videoStart: 24.3, videoEnd: 29.3, audioDuration: 5.616, text: "Get an accurate answer in seconds — with citations to the exact source document.", audio: "/audio/clip6.mp3" },
  { videoStart: 29.3, videoEnd: 31.6, audioDuration: 2.508, text: "No more digging. No more guessing.", audio: "/audio/clip7.mp3" },
  { videoStart: 31.6, videoEnd: 35, audioDuration: 3.971, text: "Just answers — from the documents your school already has.", audio: "/audio/clip8.mp3" },
];

export default function LandingPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const chevronRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(videoContainerRef, { margin: "-200px 0px -100px 0px" });

  const [currentSub, setCurrentSub] = useState("");
  const [isMuted, setIsMuted] = useState(true);
  const [videoEnded, setVideoEnded] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isMutedRef = useRef(true);
  const segmentIndexRef = useRef(-1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPlayingRef = useRef(false);

  // Clean up timer and audio
  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  // Start a specific segment
  const startSegment = useCallback((index: number) => {
    const video = videoRef.current;
    if (!video) return;

    cleanup();

    // All segments done
    if (index >= segments.length) {
      isPlayingRef.current = false;
      segmentIndexRef.current = -1;
      video.pause();
      setVideoEnded(true);
      setCurrentSub("");
      return;
    }

    segmentIndexRef.current = index;
    const seg = segments[index];
    setCurrentSub(seg.text);

    // Set video position and playback rate to match audio duration
    const videoDuration = seg.videoEnd - seg.videoStart;
    const rate = videoDuration / seg.audioDuration;
    video.currentTime = seg.videoStart;
    video.playbackRate = Math.max(0.25, Math.min(rate, 4));
    video.play().catch(() => {});

    // Play audio if unmuted
    if (!isMutedRef.current) {
      const audio = new Audio(seg.audio);
      audioRef.current = audio;
      audio.play().catch(() => {});
    }

    // Advance to next segment after audio duration
    timerRef.current = setTimeout(() => {
      startSegment(index + 1);
    }, seg.audioDuration * 1000);
  }, [cleanup]);

  const toggleMute = useCallback(() => {
    const next = !isMutedRef.current;
    isMutedRef.current = next;
    setIsMuted(next);
    if (next && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    // If unmuting mid-segment, start playing the current audio
    if (!next && segmentIndexRef.current >= 0 && isPlayingRef.current) {
      const audio = new Audio(segments[segmentIndexRef.current].audio);
      audioRef.current = audio;
      // Approximate: audio may be slightly out of sync since we don't know exact elapsed time
      audio.play().catch(() => {});
    }
  }, []);

  const restartVideo = useCallback(() => {
    setVideoEnded(false);
    isPlayingRef.current = true;
    startSegment(0);
  }, [startSegment]);

  // Play/pause based on visibility
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isInView && !videoEnded) {
      if (!isPlayingRef.current) {
        // First time or resuming — start from segment 0
        isPlayingRef.current = true;
        startSegment(0);
      }
    } else {
      // Pause everything when out of view
      video.pause();
      cleanup();
      if (isPlayingRef.current && !videoEnded) {
        isPlayingRef.current = false;
        // Reset so it restarts when scrolled back
        segmentIndexRef.current = -1;
      }
    }
  }, [isInView, videoEnded, startSegment, cleanup]);

  return (
    <div className="relative z-[1]">
      <ScrollProgressBar />

      {/* Header */}
      <ScrollHeader className="fixed top-0 z-50 w-full">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Logo
              size={32}
              className="text-primary drop-shadow-[0_0_8px_var(--glow-primary)] drop-shadow-[0_0_14px_oklch(1_0_0/40%)]"
            />
            <span className="text-xl font-semibold metallic-text">
              AskMySchool
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link href="/login">Log in</Link>
            </Button>
            <Button
              asChild
              className="shadow-[0_0_20px_var(--glow-primary),0_0_8px_oklch(1_0_0/30%)]"
            >
              <Link href="/register">Sign up</Link>
            </Button>
          </div>
        </div>
      </ScrollHeader>

      {/* Hero */}
      <section className="relative z-10 flex min-h-svh flex-col items-center justify-center px-6 text-center">
        <div>
          <SlotMachineHero className="text-6xl font-bold metallic-heading neon-text-soft sm:text-7xl lg:text-9xl">
            {"Your Questions\nAnswered Instantly"}
          </SlotMachineHero>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
            Parents ask questions in plain English. AI finds the answer from
            your school&apos;s official documents — with citations.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Button
              size="lg"
              asChild
              className="shadow-[0_0_20px_var(--glow-primary),0_0_8px_oklch(1_0_0/30%)]"
            >
              <Link href="/register">Get started free</Link>
            </Button>
            <Button variant="ghost" size="lg" asChild>
              <Link href="/login">Log in</Link>
            </Button>
          </div>
        </div>
        <div
          ref={chevronRef}
          className={`absolute bottom-8 flex flex-col items-center gap-1 transition-opacity duration-300 ${isInView ? "opacity-0 pointer-events-none" : "opacity-100"}`}
        >
          <span className="text-sm text-muted-foreground">See how it works</span>
          <ChevronDown className="h-5 w-5 text-muted-foreground animate-bounce" />
        </div>
      </section>

      {/* Video section */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pb-16">
        <div ref={videoContainerRef} className="relative w-full">
          {/* TV Mockup */}
          <div className="relative rounded-2xl border-[6px] border-neutral-800 bg-neutral-900 shadow-[0_-20px_80px_var(--glow-primary),0_-8px_40px_oklch(1_0_0/25%),0_0_60px_rgba(0,0,0,0.4),0_0_20px_var(--glow-primary)] overflow-hidden">
            {/* Top glow accent */}
            <div className="absolute -top-px left-[10%] right-[10%] h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent opacity-80 blur-[1px] z-10" />
            {/* Screen bezel highlight */}
            <div className="absolute inset-0 rounded-xl ring-1 ring-white/10 pointer-events-none z-10" />

            {/* Video */}
            <div className="relative aspect-video bg-black">
              <video
                ref={videoRef}
                src="/videos/animation.mp4"
                muted
                playsInline
                preload="auto"
                className="h-full w-full object-cover"
              />
              {/* Replay overlay */}
              {videoEnded && (
                <button
                  onClick={restartVideo}
                  className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-sm transition-opacity"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-12 w-12 text-white">
                    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                  </svg>
                  <span className="text-sm font-medium text-white">Replay</span>
                </button>
              )}
              {/* Mute/unmute narration */}
              <button
                onClick={toggleMute}
                className="absolute bottom-3 right-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/80 hover:text-white"
                aria-label={isMuted ? "Unmute narration" : "Mute narration"}
              >
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            </div>
          </div>

        </div>

        {/* Subtitle */}
        <div className="mt-2 flex min-h-16 items-center justify-center">
          <p
            key={currentSub}
            className="text-center text-lg sm:text-xl font-medium text-foreground/90 animate-in fade-in duration-500"
          >
            {currentSub}
          </p>
        </div>

        {/* Scroll chevron — appears below subtitle once video is in view (playing) */}
        {isInView && (
          <div className="flex flex-col items-center gap-1 pt-2 animate-in fade-in duration-300">
            <span className="text-sm text-muted-foreground">Scroll to explore</span>
            <ChevronDown className="h-5 w-5 text-muted-foreground animate-bounce" />
          </div>
        )}

      </section>


      {/* ═══ Traditional Landing Page ═══ */}
      <div className="relative">

        {/* Features */}
        <section className="mx-auto max-w-6xl px-6 py-24">
          <BlurReveal>
            <h2 className="text-center text-3xl font-semibold metallic-heading neon-text-soft sm:text-4xl">
              Why parents love AskMySchool
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-muted-foreground">
              Everything you need to stay informed about your child&apos;s school
            </p>
          </BlurReveal>
          <StaggerChildren className="mt-16 grid gap-8 sm:grid-cols-3">
            <motion.div variants={fadeInUp}>
              <div className="metallic-card rounded-xl p-8 text-left backdrop-blur-sm">
                <MessageSquare className="h-10 w-10 neon-icon-blue" />
                <h3 className="mt-4 text-lg font-medium text-foreground">
                  Ask anything
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Type your question in natural language. Our AI searches through
                  all school documents to find the answer.
                </p>
              </div>
            </motion.div>
            <motion.div variants={fadeInUp}>
              <div className="metallic-card rounded-xl p-8 text-left backdrop-blur-sm">
                <FileText className="h-10 w-10 neon-icon-amber" />
                <h3 className="mt-4 text-lg font-medium text-foreground">
                  Source citations
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Every answer includes references to the exact documents and
                  sections it came from, so you can verify.
                </p>
              </div>
            </motion.div>
            <motion.div variants={fadeInUp}>
              <div className="metallic-card rounded-xl p-8 text-left backdrop-blur-sm">
                <Shield className="h-10 w-10 neon-icon-green" />
                <h3 className="mt-4 text-lg font-medium text-foreground">
                  Admin controlled
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  School admins control which documents are available and approve
                  parent access. Always accurate, always official.
                </p>
              </div>
            </motion.div>
          </StaggerChildren>
        </section>

        {/* How It Works */}
        <section className="mx-auto max-w-5xl px-6 py-24">
          <BlurReveal>
            <h2 className="text-center text-3xl font-semibold metallic-heading neon-text-soft sm:text-4xl">
              How it works
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-muted-foreground">
              Three simple steps to get answers from your school&apos;s documents
            </p>
          </BlurReveal>

          <div className="mt-16 space-y-16">
            {howItWorks.map((step, i) => (
              <RevealOnScrollDirectional
                key={step.title}
                direction={i % 2 === 0 ? "left" : "right"}
              >
                <div className="flex flex-col items-center gap-6 text-center">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full metallic-surface border border-glass-border neon-border">
                    <step.icon className={`h-7 w-7 ${step.neon}`} />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-muted-foreground/60">
                      Step {i + 1}
                    </span>
                    <h3 className="mt-1 text-xl font-medium text-foreground">
                      {step.title}
                    </h3>
                    <p className="mt-2 max-w-lg text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </div>
              </RevealOnScrollDirectional>
            ))}
          </div>
        </section>

        {/* Stats */}
        <section className="py-20">
          <div className="mx-auto max-w-5xl px-6">
            <StaggerChildren className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Documents Processed", value: 500 },
                { label: "Questions Answered", value: 10000 },
                { label: "Happy Parents", value: 2500 },
                { label: "Schools Served", value: 50 },
              ].map((stat) => (
                <motion.div key={stat.label} variants={fadeInUp}>
                  <div className="text-center">
                    <AnimatedNumber
                      value={stat.value}
                      className="text-4xl font-bold metallic-text-animated neon-text"
                    />
                    <p className="mt-2 text-sm text-muted-foreground">
                      {stat.label}
                    </p>
                  </div>
                </motion.div>
              ))}
            </StaggerChildren>
          </div>
        </section>

        {/* Testimonials */}
        <section className="mx-auto max-w-5xl px-6 py-24">
          <BlurReveal>
            <h2 className="text-center text-3xl font-semibold metallic-heading neon-text-soft sm:text-4xl">
              What parents are saying
            </h2>
          </BlurReveal>
          <StaggerChildren className="mt-16 grid gap-8 sm:grid-cols-3">
            {testimonials.map((t, i) => (
              <motion.div key={i} variants={metallicCardEntrance}>
                <div className="metallic-card rounded-xl p-8">
                  <p className="text-sm leading-relaxed text-muted-foreground italic">
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  <div className="mt-6 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full metallic-surface border border-glass-border neon-border">
                      <span className="text-sm font-medium metallic-text">
                        {t.initials}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {t.name}
                      </p>
                      <p className="text-xs text-muted-foreground">{t.role}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </StaggerChildren>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-4xl px-6 py-24 text-center">
          <RevealOnScroll>
            <div className="metallic-card rounded-2xl p-12">
              <div className="relative z-10">
                <h2 className="text-3xl font-semibold metallic-heading neon-text-soft sm:text-4xl">
                  Ready to get started?
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
                  Sign up today and start getting instant answers from your
                  school&apos;s documents. It&apos;s fast, accurate, and always
                  up to date.
                </p>
                <div className="mt-8 flex items-center justify-center gap-4">
                  <Button
                    size="lg"
                    asChild
                    className="shadow-[0_0_20px_var(--glow-primary),0_0_8px_oklch(1_0_0/30%)]"
                  >
                    <Link href="/register">Create your account</Link>
                  </Button>
                </div>
              </div>
            </div>
          </RevealOnScroll>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8 neon-divider">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <div className="flex items-center gap-2">
            <Logo
              size={20}
              className="text-primary drop-shadow-[0_0_6px_oklch(1_0_0/40%)]"
            />
            <span className="text-sm metallic-text">AskMySchool</span>
          </div>
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} AskMySchool. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
