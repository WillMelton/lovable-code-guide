import { RefObject, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Volume2, VolumeX } from "lucide-react";

interface PiPVideoProps {
  videoId: string;
  title: string;
  /** Placeholder element (in page layout) that the video should sit on top of when NOT in PiP mode */
  anchorRef: RefObject<HTMLElement | null>;
  /** Wrapper element containing the iframe (used for postMessage controls) */
  videoRef: RefObject<HTMLDivElement | null>;
  showPiP: boolean;
  isMuted: boolean;
  onDismiss: () => void;
  onToggleMute: () => void;
  className?: string;
}

export function PiPVideo({
  videoId,
  title,
  anchorRef,
  videoRef,
  showPiP,
  isMuted,
  onDismiss,
  onToggleMute,
  className = "",
}: PiPVideoProps) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  // Create/get portal container synchronously on first render (prevents PiP re-mount/reload)
  const [portalContainer] = useState<HTMLElement | null>(() => {
    if (typeof document === "undefined") return null;
    let container = document.getElementById("pip-portal-container") as HTMLElement | null;
    if (!container) {
      container = document.createElement("div");
      container.id = "pip-portal-container";
      document.body.appendChild(container);
    }
    return container;
  });

  // Store document-relative position (only updates on resize, not scroll)
  const [docPosition, setDocPosition] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateDocPosition = () => {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // Calculate position relative to document (not viewport)
      setDocPosition({
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height,
      });
    };

    const scheduleUpdate = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updateDocPosition);
    };

    // Only update on resize, NOT on scroll - this keeps video in place relative to document
    window.addEventListener("resize", scheduleUpdate);
    scheduleUpdate();

    return () => {
      window.removeEventListener("resize", scheduleUpdate);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [anchorRef]);

  // When in PiP: fixed to corner. When not in PiP: absolute positioned relative to document
  const baseStyle: React.CSSProperties = showPiP
    ? {
        position: "fixed",
        bottom: "24px",
        right: "24px",
        width: "420px",
        maxWidth: "calc(100vw - 3rem)",
        zIndex: 2147483647,
        transition: "all 0.45s cubic-bezier(0.22, 1, 0.36, 1)",
      }
    : docPosition
      ? {
          position: "absolute",
          top: `${Math.round(docPosition.top)}px`,
          left: `${Math.round(docPosition.left)}px`,
          width: `${Math.round(docPosition.width)}px`,
          height: `${Math.round(docPosition.height)}px`,
          zIndex: 20,
          transition: "all 0.45s cubic-bezier(0.22, 1, 0.36, 1)",
        }
      : {
          position: "absolute",
          top: 0,
          left: 0,
          opacity: 0,
          pointerEvents: "none",
        };

  const videoContent = (
    <div
      ref={videoRef}
      className={`aspect-video rounded-2xl overflow-hidden shadow-2xl border border-white/20 bg-black relative ${className}`}
      style={baseStyle}
    >
      <iframe
        className="w-full h-full"
        src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&rel=0&modestbranding=1&vq=hd1080&cc_load_policy=1&cc_lang_pref=en&enablejsapi=1&playsinline=1&origin=${encodeURIComponent(origin)}`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />

      {/* Mute/Unmute button - always visible */}
      <button
        onClick={onToggleMute}
        type="button"
        className="absolute bottom-3 left-3 z-10 w-10 h-10 bg-black/70 hover:bg-black/90 rounded-full flex items-center justify-center text-white/90 hover:text-white transition-colors backdrop-blur-sm"
        aria-label={isMuted ? "Unmute video" : "Mute video"}
      >
        {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
      </button>

      {/* Close button - only visible in PiP mode */}
      {showPiP && (
        <button
          onClick={onDismiss}
          type="button"
          className="absolute top-2 right-2 z-10 w-8 h-8 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center text-white/80 hover:text-white transition-colors"
          aria-label="Close picture-in-picture"
        >
          ✕
        </button>
      )}
    </div>
  );

  if (!portalContainer) return null;

  // Always portal with absolute positioning - scrolls naturally with page, no movement on scroll
  return createPortal(videoContent, portalContainer);
}
