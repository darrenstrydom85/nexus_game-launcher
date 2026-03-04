/**
 * Twitch Glitch logo — monochrome SVG for sidebar and nav.
 * Uses currentColor to match sidebar text (muted → foreground → primary on active).
 */
export function TwitchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M11.571 4.714h1.715v5.143H11.57V4.714Zm5.143 0h1.714v5.143h-1.714V4.714ZM4 0L1.714 2.286v17.143h5.143V24l2.285-2.286h1.715L22.286 12V0H4Zm16.571 11.143l-3.428 3.428h-2.286l-2 2v-2h-3.143V1.714h11.857v9.429Z" />
    </svg>
  );
}
