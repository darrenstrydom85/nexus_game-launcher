use base64::Engine;
use tauri::command;

/// Writes a PNG image (supplied as a base64-encoded string) to the system clipboard.
/// Uses the `arboard` crate for cross-platform clipboard image support.
#[command]
pub fn write_image_to_clipboard(base64_png: String) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&base64_png)
        .map_err(|e| format!("base64 decode error: {e}"))?;

    // Decode PNG to raw RGBA pixels
    let decoder = png::Decoder::new(std::io::Cursor::new(&bytes));
    let mut reader = decoder.read_info().map_err(|e| format!("PNG decode error: {e}"))?;
    let buf_size = reader.output_buffer_size()
        .ok_or_else(|| "PNG output buffer size unavailable".to_string())?;
    let mut img_data = vec![0u8; buf_size];
    let info = reader.next_frame(&mut img_data).map_err(|e| format!("PNG frame error: {e}"))?;

    let width = info.width as usize;
    let height = info.height as usize;

    // Ensure RGBA — arboard requires RGBA
    let rgba_data = match info.color_type {
        png::ColorType::Rgba => img_data[..info.buffer_size()].to_vec(),
        png::ColorType::Rgb => {
            // Convert RGB → RGBA by inserting alpha=255
            let rgb = &img_data[..info.buffer_size()];
            let mut rgba = Vec::with_capacity(width * height * 4);
            for chunk in rgb.chunks(3) {
                rgba.extend_from_slice(chunk);
                rgba.push(255);
            }
            rgba
        }
        _ => return Err("Unsupported PNG color type for clipboard".to_string()),
    };

    let img = arboard::ImageData {
        width,
        height,
        bytes: std::borrow::Cow::Owned(rgba_data),
    };

    let mut clipboard = arboard::Clipboard::new().map_err(|e| format!("clipboard init error: {e}"))?;
    clipboard.set_image(img).map_err(|e| format!("clipboard write error: {e}"))?;

    Ok(())
}
