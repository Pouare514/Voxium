use actix_multipart::Multipart;
use actix_web::{HttpRequest, HttpResponse};
use futures_util::StreamExt;
use std::io::Write;
use uuid::Uuid;

use crate::auth::extract_claims;

/// POST /api/upload — Upload an image file (authenticated)
pub async fn upload_image(
    req: HttpRequest,
    mut payload: Multipart,
) -> HttpResponse {
    let claims = match extract_claims(&req) {
        Some(c) => c,
        None => return HttpResponse::Unauthorized().finish(),
    };

    // Ensure uploads directory exists
    let upload_dir = std::path::Path::new("uploads");
    if !upload_dir.exists() {
        std::fs::create_dir_all(upload_dir).ok();
    }

    while let Some(Ok(mut field)) = payload.next().await {
        let content_disposition = match field.content_disposition() {
            Some(cd) => cd.clone(),
            None => continue,
        };

        let original_filename = content_disposition
            .get_filename()
            .unwrap_or("file")
            .to_string();

        // Extract extension
        let extension = original_filename
            .rsplit('.')
            .next()
            .unwrap_or("png")
            .to_lowercase();

        // Only allow image types
        let allowed = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];
        if !allowed.contains(&extension.as_str()) {
            return HttpResponse::BadRequest().json(serde_json::json!({
                "error": "Only image files are allowed (png, jpg, jpeg, gif, webp, svg, bmp)"
            }));
        }

        // Generate unique filename
        let filename = format!("{}_{}.{}", claims.sub, Uuid::new_v4(), extension);
        let filepath = upload_dir.join(&filename);

        // Write file
        let mut file = match std::fs::File::create(&filepath) {
            Ok(f) => f,
            Err(_) => {
                return HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": "Failed to save file"
                }));
            }
        };

        let mut total_size: usize = 0;
        let max_size: usize = 8 * 1024 * 1024; // 8MB limit

        while let Some(Ok(chunk)) = field.next().await {
            total_size += chunk.len();
            if total_size > max_size {
                // Clean up partial file
                drop(file);
                std::fs::remove_file(&filepath).ok();
                return HttpResponse::BadRequest().json(serde_json::json!({
                    "error": "File too large (max 8MB)"
                }));
            }
            if file.write_all(&chunk).is_err() {
                return HttpResponse::InternalServerError().json(serde_json::json!({
                    "error": "Failed to write file"
                }));
            }
        }

        // Return the URL to the uploaded file
        let url = format!("/uploads/{}", filename);
        return HttpResponse::Ok().json(serde_json::json!({
            "url": url,
            "filename": original_filename
        }));
    }

    HttpResponse::BadRequest().json(serde_json::json!({
        "error": "No file provided"
    }))
}
