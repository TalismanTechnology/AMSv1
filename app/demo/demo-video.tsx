"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";

// Demo video that autoplays with sound when the browser allows it. Most
// browsers block unmuted autoplay until the visitor interacts with the page,
// so we fall back to muted autoplay and show a "Tap for sound" overlay. The
// visitor's first tap/keypress anywhere unmutes; if they're still near the
// start, the video restarts so they hear it from the beginning.

export function DemoVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showSoundOverlay, setShowSoundOverlay] = useState(false);
  const unmuteRef = useRef<() => void>(() => {});

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let unmuted = false;

    const removeGestureListeners = () => {
      document.removeEventListener("pointerdown", onGesture, true);
      document.removeEventListener("keydown", onGesture, true);
    };

    const markUnmuted = () => {
      unmuted = true;
      removeGestureListeners();
      setShowSoundOverlay(false);
    };

    const unmute = () => {
      if (unmuted) return;
      markUnmuted();
      if (video.currentTime < 5) video.currentTime = 0;
      video.muted = false;
      if (video.paused) void video.play().catch(() => {});
    };
    unmuteRef.current = unmute;

    // Interactions on the video itself are left to the native controls
    // (mute button, click-to-pause); volumechange covers their unmute.
    function onGesture(event: Event) {
      if (event.target === video) return;
      unmute();
    }

    const onVolumeChange = () => {
      if (!unmuted && !video.muted && video.volume > 0) markUnmuted();
    };

    video.addEventListener("volumechange", onVolumeChange);

    video.muted = false;
    video
      .play()
      .then(() => {
        if (!cancelled) markUnmuted();
      })
      .catch(() => {
        // Usually NotAllowedError: sound needs a user gesture first.
        if (cancelled) return;
        video.muted = true;
        document.addEventListener("pointerdown", onGesture, true);
        document.addEventListener("keydown", onGesture, true);
        setShowSoundOverlay(true);
        void video.play().catch(() => {});
      });

    return () => {
      cancelled = true;
      removeGestureListeners();
      video.removeEventListener("volumechange", onVolumeChange);
    };
  }, []);

  return (
    <div className="relative">
      <video
        ref={videoRef}
        controls
        preload="metadata"
        playsInline
        poster="/demo/askmyschool-demo-poster.webp"
        className="block aspect-video h-auto w-full"
      >
        <source src="/demo/askmyschool-demo.mp4" type="video/mp4" />
        <source src="/demo/askmyschool-demo-720p.mp4" type="video/mp4" />
      </video>

      {showSoundOverlay && (
        <button
          type="button"
          onClick={() => unmuteRef.current()}
          aria-label="Turn on sound"
          data-testid="demo-sound-overlay"
          className="absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-brand-dark px-6 py-3 text-sm uppercase tracking-wide text-white shadow-[0_12px_30px_-10px_rgba(0,0,0,0.6)] transition-colors hover:bg-brand-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:px-8 sm:py-3.5"
        >
          <Volume2 className="h-5 w-5" aria-hidden="true" />
          Tap for sound
        </button>
      )}
    </div>
  );
}
