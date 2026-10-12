import { getSystemHardware, type HardwareInfo } from "@/lib/tauri";

let cached: Promise<HardwareInfo> | null = null;

/** System CPU/GPU, fetched once per session (the backend spawns a process each call). */
export function getHardwareCached(): Promise<HardwareInfo> {
  cached ??= getSystemHardware().catch((err) => {
    cached = null;
    throw err;
  });
  return cached;
}

export function trimCpuName(brand: string, fullName: string): string {
  if (!fullName) return "";
  let name = fullName.replace(/\(R\)/gi, "").replace(/\(TM\)/gi, "");
  if (brand === "intel") {
    name = name.replace(/^Intel\s+Core\s+/i, "").replace(/\s+Processor$/i, "");
  } else if (brand === "amd") {
    name = name.replace(/^AMD\s+/i, "");
  }
  return name.replace(/\s+/g, " ").trim();
}

export function trimGpuName(brand: string, fullName: string): string {
  if (!fullName) return "";
  let name = fullName;
  if (brand === "nvidia") name = name.replace(/^NVIDIA\s+/i, "");
  else if (brand === "amd") name = name.replace(/^AMD\s+/i, "");
  else if (brand === "intel") name = name.replace(/^Intel\s*\(R\)\s*/i, "");
  return name.replace(/\s+/g, " ").trim();
}
