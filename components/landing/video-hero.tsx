"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Logo } from "@/components/logo";

// Opening viewport of the landing page: a fixed nav that turns cream once
// scrolled, then a full-bleed landscape video with the announcement pill and
// headline laid over it, left-aligned.

const VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260820_010308_b1636845-4c15-4ab6-b0c9-9a29bfb0c6e3.mp4";

const NAV_LINKS = [
  { label: "Schools", href: "#grounded" },
  { label: "Families", href: "#families" },
];

const NAV_LINK_CLASS =
  "text-sm text-brand-dark tracking-wide uppercase hover:opacity-70 transition-opacity";

const MOBILE_LINK_CLASS = "text-3xl text-brand-dark tracking-tight";

const HAMBURGER_BAR_CLASS =
  "absolute left-0 w-6 h-[2px] bg-brand-dark rounded transition-all duration-300 ease-[cubic-bezier(0.68,-0.6,0.32,1.6)]";

const SCROLLED_THRESHOLD = 20;

/** Burger menu state, plus the ways it closes: link click and Escape. */
function useMobileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((open) => !open), []);

  // Lock page scroll while the full-screen menu is open.
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, close]);

  return { isOpen, toggle, close };
}

function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const menu = useMobileMenu();

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > SCROLLED_THRESHOLD);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition duration-300 ${
          isScrolled
            ? "bg-brand-cream/95 shadow-sm"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="relative flex items-center h-16 md:h-20">
            {/* Desktop left links */}
            <div className="hidden md:flex items-center gap-8 animate-fade-down stagger-1">
              <a
                href="#demo"
                className={`flex items-center gap-1 ${NAV_LINK_CLASS}`}
              >
                How it works
                <ChevronDown className="w-3.5 h-3.5" />
              </a>
              {NAV_LINKS.map((link) => (
                <a key={link.href} href={link.href} className={NAV_LINK_CLASS}>
                  {link.label}
                </a>
              ))}
            </div>

            {/* Center logo. The centering translate and the entrance
                animation live on different elements on purpose: fade-down's
                keyframes set `transform`, and with `both` fill that would
                replace -translate-x-1/2 and leave the group starting at the
                midpoint instead of centered on it. */}
            <div className="absolute left-1/2 -translate-x-1/2">
              <Link
                href="/"
                className="flex items-center gap-2 animate-fade-down stagger-2"
                aria-label="AskMySchool home"
              >
                <Logo size={20} className="text-brand-dark" />
                <span className="text-xl text-brand-dark tracking-tight">
                  AskMySchool
                </span>
              </Link>
            </div>

            {/* Desktop: sign-in text link, then the CTA pill */}
            <div className="hidden md:flex items-center gap-6 ml-auto animate-fade-down stagger-3">
              <Link href="/login" className={NAV_LINK_CLASS}>
                Sign in
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center px-5 py-2.5 bg-brand-dark text-white text-sm tracking-wide uppercase rounded-full hover:bg-brand-green transition-colors"
              >
                Get Started
              </Link>
            </div>

            {/* Mobile hamburger */}
            <button
              type="button"
              aria-label="Toggle menu"
              aria-expanded={menu.isOpen}
              aria-controls="landing-mobile-menu"
              onClick={menu.toggle}
              className="md:hidden ml-auto z-50 relative flex items-center justify-center w-10 h-10"
            >
              <span className="relative block w-6 h-5">
                <span
                  className={`${HAMBURGER_BAR_CLASS} top-[6px] ${
                    menu.isOpen ? "rotate-45 translate-y-[5px]" : ""
                  }`}
                />
                <span
                  className={`${HAMBURGER_BAR_CLASS} top-[13px] ${
                    menu.isOpen ? "-rotate-45" : ""
                  }`}
                />
              </span>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile overlay */}
      <div
        id="landing-mobile-menu"
        className={`md:hidden fixed inset-0 bg-brand-cream z-40 transition duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          menu.isOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
        aria-hidden={!menu.isOpen}
      >
        <div
          className={`flex flex-col items-center justify-center h-full gap-8 transition duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] delay-100 ${
            menu.isOpen ? "translate-y-0 opacity-100" : "-translate-y-8 opacity-0"
          }`}
        >
          <a href="#demo" onClick={menu.close} className={MOBILE_LINK_CLASS}>
            How it works
          </a>
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={menu.close}
              className={MOBILE_LINK_CLASS}
            >
              {link.label}
            </a>
          ))}
          <Link
            href="/login"
            onClick={menu.close}
            className={`${MOBILE_LINK_CLASS} text-brand-dark/60`}
          >
            Sign in
          </Link>
          <Link
            href="/register"
            onClick={menu.close}
            className="mt-4 inline-flex items-center px-8 py-3.5 bg-brand-dark text-white text-lg tracking-wide rounded-full"
          >
            Get Started
          </Link>
        </div>
      </div>
    </>
  );
}

export function VideoHero() {
  // React omits the `muted` attribute from server-rendered markup, and an
  // unmuted video will not autoplay, so set it on the element directly.
  // The same callback pauses the video whenever the hero is scrolled out of
  // view: a looping 1080p decode is pure waste once the reader is halfway
  // down the page, and it competes with the parallax and card motion below.
  const attachVideo = useCallback((video: HTMLVideoElement | null) => {
    if (!video) return;
    video.muted = true;
    video.defaultMuted = true;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          void video.play().catch(() => undefined);
        } else {
          video.pause();
        }
      },
      { threshold: 0.05 }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <Navbar />

      <section
        className="relative w-full h-screen min-h-[700px] overflow-hidden bg-brand-cream"
        aria-labelledby="landing-heading"
      >
        <div className="absolute inset-0">
          <video
            ref={attachVideo}
            src={VIDEO_SRC}
            autoPlay
            muted
            loop
            playsInline
            className="w-full h-full object-cover object-bottom"
          />
          {/* Fade the video's bottom edge into the cream page below */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-40 md:h-56 bg-gradient-to-b from-transparent via-brand-cream/60 to-brand-cream"
          />
        </div>

        <div className="relative z-10 flex flex-col items-start max-w-7xl mx-auto pt-28 md:pt-36 px-6 lg:px-8">
          <a
            href="#grounded"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-brand-dark/15 bg-white/80 hover:bg-white transition-colors mb-5 md:mb-6 animate-fade-up stagger-3"
          >
            <span className="text-sm text-brand-dark">
              Now syncing school calendars from Blackbaud.
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-brand-dark" />
          </a>

          <h1
            id="landing-heading"
            className="text-left text-3xl sm:text-4xl md:text-5xl lg:text-6xl text-brand-dark leading-[1.05] tracking-tight max-w-4xl animate-fade-up stagger-4"
          >
            Every school question,
            <br className="hidden sm:block" /> answered from official sources
          </h1>
        </div>
      </section>
    </>
  );
}
