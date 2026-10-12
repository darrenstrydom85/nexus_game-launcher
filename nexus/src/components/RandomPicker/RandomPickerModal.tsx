import * as React from "react";
import * as Radix from "radix-ui";
import { motion } from "motion/react";
import { Eye, ListPlus, ListChecks, Play, RefreshCw, X } from "lucide-react";
import { cn, formatPlayTime } from "@/lib/utils";
import { EASE_OUT } from "@/lib/motion";
import { useGameStore, type Game } from "@/stores/gameStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useQueueStore } from "@/stores/queueStore";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { placeholderGradient } from "@/components/GameCard/GameCard";
import nexusLogo from "@/assets/nexus-onboarding-logo.png";
import { PACKS, RARITY_LABEL, basePool, drawFrom, rarityOf, type PackDef, type PackId } from "./packs";

interface RandomPickerModalProps {
  open: boolean;
  onClose: () => void;
  onPlay?: (game: Game) => void;
  onViewDetails?: (game: Game) => void;
}

/** idle: sealed pack · tearing: strip rips off · rising: card slides out · flipping: card turns over · revealed */
type Phase = "idle" | "tearing" | "rising" | "flipping" | "revealed";
const NEXT: Partial<Record<Phase, [Phase, number]>> = {
  tearing: ["rising", 420],
  rising: ["flipping", 560],
  flipping: ["revealed", 700],
};

/** No movement when the OS asks or the app's animation settings are off. */
function useCalm() {
  const os = useReducedMotion();
  const enabled = useSettingsStore((s) => s.enableAnimations);
  const reduced = useSettingsStore((s) => s.reducedMotion);
  return Boolean(os) || !enabled || reduced;
}

/** "What should I play?": pick a pack, rip it open, pull a game. */
export function RandomPickerModal({ open, onClose, onPlay, onViewDetails }: RandomPickerModalProps) {
  const games = useGameStore((s) => s.games);
  const hiddenIds = useSettingsStore((s) => s.hiddenGameIds);
  const calm = useCalm();
  const [packId, setPackId] = React.useState<PackId>("all");
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [game, setGame] = React.useState<Game | null>(null);
  const [round, setRound] = React.useState(0);
  // Pulled this session: "open another" never repeats.
  const [seen, setSeen] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (!open) return;
    setPhase("idle");
    setGame(null);
    setSeen(new Set());
  }, [open]);

  const base = React.useMemo(() => basePool(games, hiddenIds), [games, hiddenIds]);
  const counts = React.useMemo(() => Object.fromEntries(PACKS.map((p) => [p.id, base.filter(p.filter).length])) as Record<PackId, number>, [base]);
  const pack = PACKS.find((p) => p.id === packId)!;
  const pool = React.useMemo(() => base.filter(pack.filter).filter((g) => !seen.has(g.id)), [base, pack, seen]);

  // Walk the reveal timeline; any click skips to the end.
  React.useEffect(() => {
    const step = NEXT[phase];
    if (!step) return;
    const t = setTimeout(() => setPhase(step[0]), step[1]);
    return () => clearTimeout(t);
  }, [phase]);

  const rip = () => {
    const pick = drawFrom(pool.length > 0 ? pool : base.filter(pack.filter));
    if (!pick) return;
    const art = pick.coverUrl ?? pick.heroUrl;
    if (art) new Image().src = art; // warm the cache while the pack tears
    setGame(pick);
    setSeen((s) => new Set(s).add(pick.id));
    setRound((r) => r + 1);
    setPhase(calm ? "revealed" : "tearing");
  };

  const animating = phase !== "idle" && phase !== "revealed";

  return (
    <Radix.Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Radix.Dialog.Portal>
        <Radix.Dialog.Overlay className="fixed inset-0 z-[70] bg-black/80 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-200" />
        <Radix.Dialog.Content
          data-testid="random-picker-modal"
          aria-describedby={undefined}
          className="fixed inset-0 z-[71] flex flex-col items-center justify-center gap-6 overflow-y-auto px-6 py-10 text-white outline-none"
          onKeyDown={(e) => {
            if (animating && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              setPhase("revealed");
            }
          }}
        >
          <Radix.Dialog.Close
            data-testid="picker-close"
            aria-label="Close"
            className="absolute right-5 top-5 flex size-10 items-center justify-center rounded-full bg-white/10 text-white/80 outline-none hover:bg-white/20 hover:text-white focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-5" strokeWidth={2} />
          </Radix.Dialog.Close>

          <Radix.Dialog.Title className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">What should I play?</Radix.Dialog.Title>

          {base.length === 0 ? (
            <p data-testid="picker-empty" className="max-w-sm text-center text-sm text-white/75">
              No games to pick from yet. Sync your library, or unhide a few games.
            </p>
          ) : (
            <>
              <Stage
                key={round}
                pack={pack}
                game={game}
                phase={phase}
                calm={calm}
                canOpen={counts[packId] > 0}
                onOpen={phase === "idle" ? rip : () => setPhase("revealed")}
              />
              {phase === "idle" && (
                <PackPicker
                  packId={packId}
                  counts={counts}
                  onPick={setPackId}
                  onOpen={rip}
                  canOpen={counts[packId] > 0}
                />
              )}
              {phase === "revealed" && game && (
                <Result
                  game={game}
                  calm={calm}
                  onPlay={() => onPlay?.(game)}
                  onDetails={() => onViewDetails?.(game)}
                  onAnother={rip}
                  canAnother={pool.length > 0}
                />
              )}
              <p aria-live="polite" className="sr-only">
                {phase === "revealed" && game ? `You pulled ${game.name}` : ""}
              </p>
            </>
          )}
        </Radix.Dialog.Content>
      </Radix.Dialog.Portal>
    </Radix.Dialog.Root>
  );
}

/* ── Pack and card ───────────────────────────────────────────────── */

const W = 220;
const H = 336;
const STRIP = 46;
// The ragged edge the tear leaves along the top of the pack.
const TORN = `polygon(0 ${STRIP + 4}px, 5% ${STRIP - 2}px, 11% ${STRIP + 5}px, 17% ${STRIP - 3}px, 24% ${STRIP + 4}px, 31% ${STRIP - 1}px, 38% ${STRIP + 6}px, 45% ${STRIP - 2}px, 52% ${STRIP + 3}px, 59% ${STRIP - 3}px, 66% ${STRIP + 5}px, 73% ${STRIP - 1}px, 80% ${STRIP + 4}px, 87% ${STRIP - 2}px, 94% ${STRIP + 5}px, 100% ${STRIP}px, 100% 100%, 0 100%)`;
const CRIMP = "repeating-linear-gradient(90deg, rgba(255,255,255,.22) 0 3px, rgba(0,0,0,.18) 3px 6px)";

function foil(pack: PackDef) {
  return `linear-gradient(155deg, ${pack.foil[0]}, ${pack.foil[1]})`;
}

function Stage({
  pack,
  game,
  phase,
  calm,
  canOpen,
  onOpen,
}: {
  pack: PackDef;
  game: Game | null;
  phase: Phase;
  calm: boolean;
  canOpen: boolean;
  onOpen: () => void;
}) {
  const [tilt, setTilt] = React.useState({ x: 0, y: 0 });
  const torn = phase !== "idle";
  const packGone = phase === "flipping" || phase === "revealed";
  const cardOut = phase === "rising" || phase === "flipping" || phase === "revealed";
  const faceUp = phase === "flipping" || phase === "revealed";
  const rarity = game ? rarityOf(game) : "common";

  return (
    <div className="relative flex items-center justify-center [perspective:1200px]" style={{ width: W + 120, height: H + 150 }}>
      {/* Burst behind the tear. */}
      {!calm && torn && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute size-[420px] rounded-full"
          style={{ background: `radial-gradient(circle, ${pack.foil[0]}aa, transparent 65%)` }}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: [0, 0.9, 0.35], scale: [0.6, 1.25, 1.1] }}
          transition={{ duration: 0.9, ease: EASE_OUT }}
        />
      )}

      <button
        type="button"
        data-testid={phase === "idle" ? "picker-pack" : "picker-skip"}
        aria-label={phase === "idle" ? `Open the ${pack.name} pack` : phase === "revealed" ? `${game?.name ?? "Game"} card` : "Skip to the card"}
        disabled={phase === "revealed" || (phase === "idle" && !canOpen)}
        onClick={onOpen}
        onPointerMove={(e) => {
          if (calm || phase !== "idle") return;
          const r = e.currentTarget.getBoundingClientRect();
          setTilt({ x: ((e.clientY - r.top) / r.height - 0.5) * -10, y: ((e.clientX - r.left) / r.width - 0.5) * 12 });
        }}
        onPointerLeave={() => setTilt({ x: 0, y: 0 })}
        className="relative outline-none transition-transform duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-black disabled:cursor-default"
        // Pointer tilt on the sealed pack only; the animated layers inside own their own transforms.
        style={{ width: W, height: H, transform: phase === "idle" ? `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` : undefined }}
      >
        {/* The card, tucked inside the pack until it rises. */}
        {game && (
          <motion.span
            className="absolute inset-0 block [transform-style:preserve-3d]"
            initial={calm ? { opacity: 0 } : { y: 40, rotateY: 180 }}
            animate={
              calm
                ? { opacity: 1, transition: { duration: 0.15 } }
                : {
                    y: phase === "rising" ? -150 : cardOut ? 0 : 40,
                    rotateY: faceUp ? 0 : 180,
                    scale: phase === "revealed" ? 1.06 : 1,
                    transition:
                      phase === "rising"
                        ? { duration: 0.55, ease: EASE_OUT }
                        : { type: "spring", duration: 0.7, bounce: 0.18 },
                  }
            }
            style={{ zIndex: cardOut && phase !== "rising" ? 3 : 1 }}
          >
            <CardFace game={game} rarity={rarity} shine={phase === "revealed" && !calm} />
            <CardBack pack={pack} />
          </motion.span>
        )}

        {/* Pack body: drops away once the card is out. */}
        <motion.span
          aria-hidden
          className="absolute inset-0 z-[2] block overflow-hidden rounded-[18px] shadow-[0_30px_60px_-20px_rgba(0,0,0,.8)]"
          style={{ background: foil(pack), clipPath: torn ? TORN : undefined }}
          initial={{ y: 0, opacity: 1 }}
          animate={packGone ? { y: 160, opacity: 0 } : { y: 0, opacity: 1 }}
          transition={{ duration: calm ? 0.15 : 0.35, ease: EASE_OUT }}
        >
          <span className="absolute inset-0 bg-[linear-gradient(115deg,transparent_25%,rgba(255,255,255,.28)_42%,transparent_58%)]" />
          <span className="absolute inset-x-0 bottom-0 h-3.5" style={{ background: CRIMP }} />
          <span className="absolute inset-x-0 flex flex-col items-center gap-2 text-center" style={{ top: STRIP + 46 }}>
            <img src={nexusLogo} alt="" className="size-14 drop-shadow-[0_6px_16px_rgba(0,0,0,.45)]" draggable={false} />
            <span className="text-[13px] font-black uppercase tracking-[0.32em] text-white/90">Nexus</span>
          </span>
          <span className="absolute inset-x-0 bottom-9 flex flex-col items-center gap-0.5 text-center">
            <span className="text-lg font-bold text-white">{pack.name}</span>
            <span className="text-xs font-medium text-white/75">1 game inside</span>
          </span>
        </motion.span>

        {/* Top strip: the bit that rips off. */}
        <motion.span
          aria-hidden
          className="absolute inset-x-0 top-0 z-[4] block rounded-t-[18px]"
          style={{ height: STRIP, background: `${CRIMP}, ${foil(pack)}`, backgroundSize: "100% 12px, 100% 100%", backgroundRepeat: "no-repeat" }}
          // Starts sealed even when the stage mounts mid-rip ("open another").
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
          animate={torn ? { x: 70, y: -90, rotate: 16, opacity: 0 } : { x: 0, y: 0, rotate: 0, opacity: 1 }}
          transition={{ duration: calm ? 0.15 : 0.42, ease: EASE_OUT }}
        />
      </button>
    </div>
  );
}

const RARITY_RING: Record<string, string> = {
  legendary: "var(--rarity-legendary)",
  epic: "var(--rarity-epic)",
  rare: "var(--rarity-rare)",
  common: "rgba(255,255,255,.35)",
};

function CardFace({ game, rarity, shine }: { game: Game; rarity: string; shine: boolean }) {
  const art = game.coverUrl ?? game.heroUrl;
  return (
    <span
      data-testid="result-cover"
      className="absolute inset-0 block overflow-hidden rounded-[16px] [backface-visibility:hidden]"
      style={{ boxShadow: `0 0 0 3px ${RARITY_RING[rarity]}, 0 0 48px -6px ${RARITY_RING[rarity]}` }}
    >
      {art ? (
        <img src={art} alt="" className="size-full object-cover" draggable={false} />
      ) : (
        <span className="flex size-full items-center justify-center p-5 text-center text-lg font-bold text-white" style={{ background: placeholderGradient(game.name) }}>
          {game.name}
        </span>
      )}
      {shine && (
        <motion.span
          aria-hidden
          className="absolute inset-y-0 -left-1/2 w-1/2 bg-[linear-gradient(100deg,transparent,rgba(255,255,255,.45),transparent)]"
          initial={{ x: "0%" }}
          animate={{ x: "400%" }}
          transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.1 }}
        />
      )}
    </span>
  );
}

function CardBack({ pack }: { pack: PackDef }) {
  return (
    <span
      aria-hidden
      className="absolute inset-0 flex items-center justify-center rounded-[16px] [backface-visibility:hidden] [transform:rotateY(180deg)]"
      style={{ background: foil(pack), boxShadow: "inset 0 0 0 6px rgba(255,255,255,.15)" }}
    >
      <img src={nexusLogo} alt="" className="size-16 opacity-90" draggable={false} />
    </span>
  );
}

/* ── Choosing a pack ─────────────────────────────────────────────── */

function PackPicker({
  packId,
  counts,
  onPick,
  onOpen,
  canOpen,
}: {
  packId: PackId;
  counts: Record<PackId, number>;
  onPick: (id: PackId) => void;
  onOpen: () => void;
  canOpen: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-5">
      <Radix.ToggleGroup.Root
        type="single"
        value={packId}
        onValueChange={(v) => v && onPick(v as PackId)}
        aria-label="Pack"
        className="flex flex-wrap justify-center gap-2.5"
      >
        {PACKS.map((p) => (
          <Radix.ToggleGroup.Item
            key={p.id}
            value={p.id}
            disabled={counts[p.id] === 0}
            data-testid={`picker-pack-${p.id}`}
            className={cn(
              "pressable flex w-[150px] items-center gap-2.5 rounded-xl border border-white/15 bg-white/5 p-2.5 text-left outline-none",
              "hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40",
              "data-[state=on]:border-white/60 data-[state=on]:bg-white/15",
            )}
          >
            <span aria-hidden className="h-10 w-7 shrink-0 rounded-[5px]" style={{ background: foil(p) }} />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold text-white">{p.name}</span>
              <span className="block text-xs tabular-nums text-white/65">
                {counts[p.id]} {counts[p.id] === 1 ? "game" : "games"}
              </span>
            </span>
          </Radix.ToggleGroup.Item>
        ))}
      </Radix.ToggleGroup.Root>
      <p className="text-sm text-white/70">{PACKS.find((p) => p.id === packId)!.hint}</p>
      <button
        type="button"
        data-testid="picker-open"
        onClick={onOpen}
        disabled={!canOpen}
        className="pressable h-12 rounded-xl bg-primary px-8 text-base font-semibold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        Open pack
      </button>
    </div>
  );
}

/* ── The pull ────────────────────────────────────────────────────── */

function Result({
  game,
  calm,
  onPlay,
  onDetails,
  onAnother,
  canAnother,
}: {
  game: Game;
  calm: boolean;
  onPlay: () => void;
  onDetails: () => void;
  onAnother: () => void;
  canAnother: boolean;
}) {
  const queued = useQueueStore((s) => s.entries.some((e) => e.gameId === game.id));
  const rarity = rarityOf(game);
  const facts = [
    game.genres?.slice(0, 2).join(" · "),
    game.hltbMainH ? `${Math.round(game.hltbMainH)}h to beat` : null,
    game.totalPlayTimeS > 0 ? `${formatPlayTime(game.totalPlayTimeS)} played` : "Never played",
  ].filter(Boolean);
  const rise = (i: number) =>
    calm ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, ease: EASE_OUT, delay: 0.08 * i } };

  return (
    <div data-testid="picker-result" className="flex max-w-xl flex-col items-center gap-3 text-center">
      <motion.span
        {...rise(0)}
        className="text-xs font-semibold uppercase tracking-[0.14em]"
        style={{ color: rarity === "common" ? "rgba(255,255,255,.7)" : RARITY_RING[rarity] }}
      >
        {RARITY_LABEL[rarity]}
        {game.criticScore ? ` · critics ${Math.round(game.criticScore)}%` : ""}
      </motion.span>
      <motion.h2 {...rise(1)} className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-white">
        {game.name}
      </motion.h2>
      <motion.p {...rise(2)} className="text-sm text-white/75">
        {facts.join(" · ")}
      </motion.p>
      <motion.div {...rise(3)} className="mt-2 flex flex-wrap justify-center gap-2.5">
        <button
          type="button"
          data-testid="picker-play"
          // The pack button goes inert on reveal; land focus on the obvious next step.
          autoFocus
          onClick={onPlay}
          className="pressable flex h-11 items-center gap-2 rounded-xl bg-primary pl-4 pr-5 text-[15px] font-semibold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Play className="size-4 fill-current" strokeWidth={2} />
          Play
        </button>
        <button
          type="button"
          data-testid="picker-queue"
          aria-pressed={queued}
          onClick={() => {
            const q = useQueueStore.getState();
            if (queued) q.remove(game.id, game.name);
            else q.add(game.id, game.name);
          }}
          className="pressable flex h-11 items-center gap-2 rounded-xl border border-white/20 px-4 text-[15px] font-semibold text-white outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {queued ? <ListChecks className="size-4" strokeWidth={2} /> : <ListPlus className="size-4" strokeWidth={2} />}
          {queued ? "In your queue" : "Add to queue"}
        </button>
        <button
          type="button"
          data-testid="picker-details"
          onClick={onDetails}
          className="pressable flex h-11 items-center gap-2 rounded-xl border border-white/20 px-4 text-[15px] font-semibold text-white outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Eye className="size-4" strokeWidth={2} />
          Details
        </button>
        <button
          type="button"
          data-testid="picker-another"
          onClick={onAnother}
          disabled={!canAnother}
          className="pressable flex h-11 items-center gap-2 rounded-xl px-4 text-[15px] font-semibold text-white/85 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
        >
          <RefreshCw className="size-4" strokeWidth={2} />
          Open another
        </button>
      </motion.div>
    </div>
  );
}
