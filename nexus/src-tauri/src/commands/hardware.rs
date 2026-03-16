use serde::Serialize;
use std::process::Command;
use sysinfo::{CpuRefreshKind, RefreshKind, System};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HardwareInfo {
    pub cpu_brand: String,
    pub cpu_name: String,
    pub gpu_brand: String,
    pub gpu_name: String,
}

fn classify_cpu_brand(brand_string: &str) -> &'static str {
    let lower = brand_string.to_lowercase();
    if lower.contains("intel") {
        "intel"
    } else if lower.contains("amd") {
        "amd"
    } else {
        "unknown"
    }
}

struct GpuEntry {
    name: String,
    brand: &'static str,
}

fn classify_gpu_brand(name: &str) -> &'static str {
    let lower = name.to_lowercase();
    if lower.contains("nvidia") {
        "nvidia"
    } else if lower.contains("amd") || lower.contains("radeon") {
        "amd"
    } else if lower.contains("intel") || lower.contains("arc") || lower.contains("uhd") {
        "intel"
    } else {
        "unknown"
    }
}

fn parse_wmic_output(output: &str) -> Vec<GpuEntry> {
    output
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            let name = trimmed.strip_prefix("Name=")?;
            let name = name.trim();
            if name.is_empty() {
                return None;
            }
            Some(GpuEntry {
                brand: classify_gpu_brand(name),
                name: name.to_string(),
            })
        })
        .collect()
}

fn pick_best_gpu(gpus: Vec<GpuEntry>) -> (String, String) {
    if gpus.is_empty() {
        return ("unknown".to_string(), String::new());
    }

    // Prefer discrete (NVIDIA or AMD) over integrated (Intel)
    let discrete = gpus.iter().find(|g| g.brand == "nvidia" || g.brand == "amd");
    match discrete {
        Some(g) => (g.brand.to_string(), g.name.clone()),
        None => {
            let first = &gpus[0];
            (first.brand.to_string(), first.name.clone())
        }
    }
}

fn detect_cpu() -> (String, String) {
    let sys = System::new_with_specifics(
        RefreshKind::nothing().with_cpu(CpuRefreshKind::nothing()),
    );

    match sys.cpus().first() {
        Some(cpu) => {
            let brand_string = cpu.brand().to_string();
            let brand = classify_cpu_brand(&brand_string).to_string();
            (brand, brand_string)
        }
        None => ("unknown".to_string(), String::new()),
    }
}

fn parse_powershell_output(output: &str) -> Vec<GpuEntry> {
    output
        .lines()
        .filter_map(|line| {
            let name = line.trim();
            if name.is_empty() {
                return None;
            }
            Some(GpuEntry {
                brand: classify_gpu_brand(name),
                name: name.to_string(),
            })
        })
        .collect()
}

fn new_hidden_command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

fn detect_gpu() -> (String, String) {
    // Try wmic first (available on older Windows builds)
    if let Ok(output) = new_hidden_command("wmic")
        .args(["path", "Win32_VideoController", "get", "Name", "/format:list"])
        .output()
    {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let gpus = parse_wmic_output(&stdout);
        if !gpus.is_empty() {
            return pick_best_gpu(gpus);
        }
    }

    // Fallback: PowerShell Get-CimInstance (wmic removed in newer Windows)
    if let Ok(output) = new_hidden_command("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name",
        ])
        .output()
    {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let gpus = parse_powershell_output(&stdout);
        if !gpus.is_empty() {
            return pick_best_gpu(gpus);
        }
    }

    ("unknown".to_string(), String::new())
}

#[tauri::command]
pub async fn get_system_hardware() -> HardwareInfo {
    tokio::task::spawn_blocking(|| {
        let (cpu_brand, cpu_name) = detect_cpu();
        let (gpu_brand, gpu_name) = detect_gpu();

        HardwareInfo {
            cpu_brand,
            cpu_name,
            gpu_brand,
            gpu_name,
        }
    })
    .await
    .unwrap_or_else(|_| HardwareInfo {
        cpu_brand: "unknown".to_string(),
        cpu_name: String::new(),
        gpu_brand: "unknown".to_string(),
        gpu_name: String::new(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cpu_brand_intel() {
        assert_eq!(classify_cpu_brand("Intel(R) Core(TM) i9-13900K"), "intel");
        assert_eq!(classify_cpu_brand("12th Gen Intel(R) Core(TM) i7-12700K"), "intel");
    }

    #[test]
    fn cpu_brand_amd() {
        assert_eq!(classify_cpu_brand("AMD Ryzen 9 7950X"), "amd");
        assert_eq!(classify_cpu_brand("AMD Ryzen 5 5600X 6-Core Processor"), "amd");
    }

    #[test]
    fn cpu_brand_unknown() {
        assert_eq!(classify_cpu_brand(""), "unknown");
        assert_eq!(classify_cpu_brand("Some Other CPU"), "unknown");
    }

    #[test]
    fn gpu_brand_nvidia() {
        assert_eq!(classify_gpu_brand("NVIDIA GeForce RTX 4090"), "nvidia");
        assert_eq!(classify_gpu_brand("NVIDIA GeForce GTX 1080 Ti"), "nvidia");
    }

    #[test]
    fn gpu_brand_amd_radeon() {
        assert_eq!(classify_gpu_brand("AMD Radeon RX 7900 XTX"), "amd");
        assert_eq!(classify_gpu_brand("Radeon RX 580"), "amd");
    }

    #[test]
    fn gpu_brand_intel_integrated() {
        assert_eq!(classify_gpu_brand("Intel UHD Graphics 770"), "intel");
        assert_eq!(classify_gpu_brand("Intel(R) Arc(TM) A770"), "intel");
    }

    #[test]
    fn gpu_brand_unknown() {
        assert_eq!(classify_gpu_brand(""), "unknown");
        assert_eq!(classify_gpu_brand("Matrox G200eW"), "unknown");
    }

    #[test]
    fn parse_wmic_single_gpu() {
        let output = "\r\n\r\nName=NVIDIA GeForce RTX 4090\r\n\r\n\r\n";
        let gpus = parse_wmic_output(output);
        assert_eq!(gpus.len(), 1);
        assert_eq!(gpus[0].name, "NVIDIA GeForce RTX 4090");
        assert_eq!(gpus[0].brand, "nvidia");
    }

    #[test]
    fn parse_wmic_multiple_gpus() {
        let output = "\r\n\r\nName=Intel UHD Graphics 770\r\n\r\n\r\nName=NVIDIA GeForce RTX 4090\r\n\r\n\r\n";
        let gpus = parse_wmic_output(output);
        assert_eq!(gpus.len(), 2);
        assert_eq!(gpus[0].name, "Intel UHD Graphics 770");
        assert_eq!(gpus[1].name, "NVIDIA GeForce RTX 4090");
    }

    #[test]
    fn parse_wmic_empty_output() {
        let gpus = parse_wmic_output("");
        assert!(gpus.is_empty());
    }

    #[test]
    fn parse_wmic_no_name_lines() {
        let output = "\r\n\r\nSomething=else\r\n\r\n";
        let gpus = parse_wmic_output(output);
        assert!(gpus.is_empty());
    }

    #[test]
    fn multi_gpu_prefers_discrete_nvidia() {
        let gpus = vec![
            GpuEntry { name: "Intel UHD Graphics 770".to_string(), brand: "intel" },
            GpuEntry { name: "NVIDIA GeForce RTX 4090".to_string(), brand: "nvidia" },
        ];
        let (brand, name) = pick_best_gpu(gpus);
        assert_eq!(brand, "nvidia");
        assert_eq!(name, "NVIDIA GeForce RTX 4090");
    }

    #[test]
    fn multi_gpu_prefers_discrete_amd() {
        let gpus = vec![
            GpuEntry { name: "Intel UHD Graphics 770".to_string(), brand: "intel" },
            GpuEntry { name: "AMD Radeon RX 7900 XTX".to_string(), brand: "amd" },
        ];
        let (brand, name) = pick_best_gpu(gpus);
        assert_eq!(brand, "amd");
        assert_eq!(name, "AMD Radeon RX 7900 XTX");
    }

    #[test]
    fn single_integrated_gpu_returned() {
        let gpus = vec![
            GpuEntry { name: "Intel UHD Graphics 770".to_string(), brand: "intel" },
        ];
        let (brand, name) = pick_best_gpu(gpus);
        assert_eq!(brand, "intel");
        assert_eq!(name, "Intel UHD Graphics 770");
    }

    #[test]
    fn no_gpus_returns_defaults() {
        let (brand, name) = pick_best_gpu(vec![]);
        assert_eq!(brand, "unknown");
        assert_eq!(name, "");
    }

    #[test]
    fn parse_powershell_single_gpu() {
        let output = "NVIDIA GeForce RTX 4090\r\n";
        let gpus = parse_powershell_output(output);
        assert_eq!(gpus.len(), 1);
        assert_eq!(gpus[0].name, "NVIDIA GeForce RTX 4090");
        assert_eq!(gpus[0].brand, "nvidia");
    }

    #[test]
    fn parse_powershell_multiple_gpus() {
        let output = "AMD Radeon RX 9070 XT\r\nAMD Radeon(TM) Graphics\r\n";
        let gpus = parse_powershell_output(output);
        assert_eq!(gpus.len(), 2);
        assert_eq!(gpus[0].name, "AMD Radeon RX 9070 XT");
        assert_eq!(gpus[0].brand, "amd");
        assert_eq!(gpus[1].name, "AMD Radeon(TM) Graphics");
        assert_eq!(gpus[1].brand, "amd");
    }

    #[test]
    fn parse_powershell_empty_output() {
        let gpus = parse_powershell_output("");
        assert!(gpus.is_empty());
    }

    #[test]
    fn multi_gpu_prefers_discrete_over_integrated_amd() {
        let gpus = vec![
            GpuEntry { name: "AMD Radeon RX 9070 XT".to_string(), brand: "amd" },
            GpuEntry { name: "AMD Radeon(TM) Graphics".to_string(), brand: "amd" },
        ];
        let (brand, name) = pick_best_gpu(gpus);
        assert_eq!(brand, "amd");
        assert_eq!(name, "AMD Radeon RX 9070 XT");
    }
}
