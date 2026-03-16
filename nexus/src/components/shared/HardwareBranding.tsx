import * as React from "react";
import { cn } from "@/lib/utils";
import { Cpu, Monitor } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getSystemHardware, type HardwareInfo } from "@/lib/tauri";

import intelLogo from "@/assets/hardware/intel.png";
import amdLogo from "@/assets/hardware/amd.png";
import nvidiaLogo from "@/assets/hardware/nvidia.png";

const BRAND_LOGOS: Record<string, { src: string; label: string }> = {
  intel: { src: intelLogo, label: "Intel" },
  amd: { src: amdLogo, label: "AMD" },
  nvidia: { src: nvidiaLogo, label: "NVIDIA" },
};

let cachedHardwareInfo: HardwareInfo | null = null;

function trimCpuName(brand: string, fullName: string): string {
  if (!fullName) return "";
  let name = fullName;
  name = name.replace(/\(R\)/gi, "").replace(/\(TM\)/gi, "");
  if (brand === "intel") {
    name = name.replace(/^Intel\s+Core\s+/i, "").replace(/\s+Processor$/i, "");
  } else if (brand === "amd") {
    name = name.replace(/^AMD\s+/i, "");
  }
  return name.replace(/\s+/g, " ").trim();
}

function trimGpuName(brand: string, fullName: string): string {
  if (!fullName) return "";
  let name = fullName;
  if (brand === "nvidia") {
    name = name.replace(/^NVIDIA\s+/i, "");
  } else if (brand === "amd") {
    name = name.replace(/^AMD\s+/i, "");
  } else if (brand === "intel") {
    name = name.replace(/^Intel\s*\(R\)\s*/i, "");
  }
  return name.replace(/\s+/g, " ").trim();
}

interface BrandRowProps {
  brand: string;
  fullName: string;
  type: "cpu" | "gpu";
  expanded: boolean;
}

function BrandRow({ brand, fullName, type, expanded }: BrandRowProps) {
  const logoInfo = BRAND_LOGOS[brand];
  const trimmedName =
    type === "cpu" ? trimCpuName(brand, fullName) : trimGpuName(brand, fullName);
  const tooltipLabel = logoInfo
    ? `${logoInfo.label} ${trimmedName}`
    : fullName || (type === "cpu" ? "Unknown CPU" : "Unknown GPU");

  const icon = logoInfo ? (
    <img
      src={logoInfo.src}
      alt={tooltipLabel}
      className="opacity-60 transition-opacity duration-200 group-hover/hw:opacity-100"
      style={{ height: expanded ? 20 : 16, width: "auto" }}
    />
  ) : type === "cpu" ? (
    <Cpu
      className="text-muted-foreground/60 transition-opacity duration-200 group-hover/hw:text-muted-foreground"
      style={{ height: expanded ? 20 : 16, width: expanded ? 20 : 16 }}
      aria-label={tooltipLabel}
    />
  ) : (
    <Monitor
      className="text-muted-foreground/60 transition-opacity duration-200 group-hover/hw:text-muted-foreground"
      style={{ height: expanded ? 20 : 16, width: expanded ? 20 : 16 }}
      aria-label={tooltipLabel}
    />
  );

  if (!expanded) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="group/hw flex items-center justify-center"
            tabIndex={0}
            aria-label={tooltipLabel}
          >
            {icon}
          </span>
        </TooltipTrigger>
        <TooltipContent side="right">{tooltipLabel}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="group/hw flex items-center gap-2 overflow-hidden">
      <span className="shrink-0">{icon}</span>
      <span
        className="truncate font-[family-name:var(--font-geist-sans)] text-[10px] leading-tight text-muted-foreground/60"
        title={tooltipLabel}
      >
        {trimmedName}
      </span>
    </div>
  );
}

interface HardwareBrandingProps {
  sidebarOpen: boolean;
}

export function HardwareBranding({ sidebarOpen }: HardwareBrandingProps) {
  const [hardware, setHardware] = React.useState<HardwareInfo | null>(
    cachedHardwareInfo,
  );

  React.useEffect(() => {
    if (cachedHardwareInfo) return;
    let cancelled = false;
    getSystemHardware().then((info) => {
      if (cancelled) return;
      cachedHardwareInfo = info;
      setHardware(info);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!hardware) return null;

  const showCpu = hardware.cpuBrand !== "unknown";
  const showGpu = hardware.gpuBrand !== "unknown";
  if (!showCpu && !showGpu) return null;

  const content = (
    <div
      data-testid="hardware-branding"
      className={cn(
        "flex border-t border-border",
        sidebarOpen ? "flex-col gap-1 px-3 py-2" : "flex-col items-center gap-1 py-2",
      )}
    >
      {showCpu && (
        <BrandRow
          brand={hardware.cpuBrand}
          fullName={hardware.cpuName}
          type="cpu"
          expanded={sidebarOpen}
        />
      )}
      {showGpu && (
        <BrandRow
          brand={hardware.gpuBrand}
          fullName={hardware.gpuName}
          type="gpu"
          expanded={sidebarOpen}
        />
      )}
    </div>
  );

  if (!sidebarOpen) {
    return <TooltipProvider>{content}</TooltipProvider>;
  }

  return content;
}
