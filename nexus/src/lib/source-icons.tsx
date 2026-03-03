import * as React from "react";
import { Folder } from "lucide-react";
import type { GameSource } from "@/stores/gameStore";

export function SteamIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658a3.387 3.387 0 0 1 1.912-.59c.064 0 .128.003.19.008l2.861-4.142V8.91a4.528 4.528 0 0 1 4.524-4.524 4.528 4.528 0 0 1 4.524 4.524 4.528 4.528 0 0 1-4.524 4.524h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396a3.404 3.404 0 0 1-3.362-2.88L.309 15.14C1.6 20.217 6.35 24 11.979 24c6.627 0 12-5.373 12-12S18.606 0 11.979 0zM7.54 18.21l-1.473-.61a2.542 2.542 0 0 0 4.884-.89 2.542 2.542 0 0 0-2.541-2.542c-.17 0-.335.02-.496.053l1.522.63a1.868 1.868 0 0 1-1.422 3.453l-.474-.094zm8.4-5.862a3.019 3.019 0 0 0 3.016-3.016 3.019 3.019 0 0 0-3.016-3.016 3.019 3.019 0 0 0-3.016 3.016 3.019 3.019 0 0 0 3.016 3.016z" />
    </svg>
  );
}

export function EpicIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M3.537 0C2.165 0 1.66.506 1.66 1.879V22.12c0 1.374.504 1.88 1.877 1.88h16.926c1.374 0 1.877-.506 1.877-1.88V1.88C22.34.506 21.837 0 20.463 0H3.537zm6.166 4.703h4.6a.59.59 0 0 1 .59.59v.593h-3.6v2.406h3.003v1.18H11.29v2.406h3.6v1.183h-4.6a.59.59 0 0 1-.59-.59V5.293a.59.59 0 0 1 .59-.59z" />
    </svg>
  );
}

export function GogIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 3.6a8.4 8.4 0 1 1 0 16.8 8.4 8.4 0 0 1 0-16.8zm0 2.4a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm0 2.4a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2z" />
    </svg>
  );
}

export function UbisoftIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M23.561 12.669a12.221 12.221 0 0 0-2.932-7.238.494.494 0 0 0-.726-.036l-1.467 1.467a.493.493 0 0 0-.012.684 8.926 8.926 0 0 1-6.36 15.116A8.926 8.926 0 0 1 3.14 13.738a8.926 8.926 0 0 1 5.925-8.412.494.494 0 0 0 .324-.492V2.766a.494.494 0 0 0-.612-.48A12.225 12.225 0 0 0 .439 12.669c.32 6.53 5.68 11.89 12.21 12.21 7.3.357 13.35-5.51 13.35-12.745 0-.157-.003-.313-.008-.468a.494.494 0 0 0-.43-.497z" />
    </svg>
  );
}

export function BattleNetIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12.004 0C8.157 0 4.768 1.94 2.73 4.9c.19-.05.5-.1.87-.1 1.17 0 2.57.56 3.87 2.09.48.57 1.43 1.93 2.39 3.41-1.03.42-2.18.99-3.26 1.7C4.16 13.64 2.3 15.94 2.3 17.54c0 .2.03.38.08.55A11.97 11.97 0 0 1 0 12C0 5.373 5.373 0 12.004 0zm7.246 3.2c.31.55.48 1.2.48 1.94 0 2.3-1.88 5.2-5.07 7.71.2.35.38.69.55 1.01 1.73 3.31 2.08 6.21.58 7.43-.18.15-.39.26-.62.34A11.95 11.95 0 0 0 24 12c0-3.53-1.53-6.71-3.96-8.9l-.79.1zM8.88 18.93c-2.1-.54-3.43-1.54-3.43-3.13 0-2.31 2.54-5.17 6.2-7.28.56.87 1.09 1.73 1.46 2.42-2.47 1.61-4.08 3.43-4.08 4.68 0 .4.18.72.54.93.5.3 1.22.35 1.89.25a11.96 11.96 0 0 1-2.58 2.13z" />
    </svg>
  );
}

export function XboxIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M4.102 21.033A11.947 11.947 0 0 0 12 24a11.947 11.947 0 0 0 7.898-2.967c1.066-1.065.465-3.399-1.598-6.233-2.166-2.978-4.963-5.647-4.963-5.647S9.764 11.822 7.6 14.8c-2.063 2.834-2.563 5.168-1.498 6.233zM12 3.6s-2.332 1.133-4.965 3.766C4.7 9.7 3.2 12.1 2.7 14.3c-.5 2.2.1 3.6.1 3.6A11.96 11.96 0 0 1 0 12C0 7.2 2.7 3.1 6.6 1.2c0 0 2.4 0 5.4 2.4zM17.4 1.2C21.3 3.1 24 7.2 24 12c0 2.2-.6 4.3-1.7 6.1 0 0 .5-1.5.1-3.6-.5-2.2-2-4.6-4.335-6.934C15.432 4.933 12 3.6 12 3.6s3-2.4 5.4-2.4zM12 0a11.96 11.96 0 0 0-4.277.783S9.6 0 12 0s4.277.783 4.277.783A11.96 11.96 0 0 0 12 0z" />
    </svg>
  );
}

export function StandaloneIcon({ className }: { className?: string }) {
  return <Folder className={className} />;
}

export const SOURCE_ICON_COMPONENTS: Record<GameSource, React.FC<{ className?: string }>> = {
  steam: SteamIcon,
  epic: EpicIcon,
  gog: GogIcon,
  ubisoft: UbisoftIcon,
  battlenet: BattleNetIcon,
  xbox: XboxIcon,
  standalone: StandaloneIcon,
};

export const SOURCE_LABELS: Record<GameSource, string> = {
  steam: "Steam",
  epic: "Epic Games",
  gog: "GOG Galaxy",
  ubisoft: "Ubisoft Connect",
  battlenet: "Battle.net",
  xbox: "Xbox / Game Pass",
  standalone: "Standalone",
};
