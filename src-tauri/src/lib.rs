// ============================================================
// 스마트 전자칠판 v2 — Rust(백엔드) 쪽
// 3단계: 파일 저장(원자적 쓰기 + 백업), 알람 MP3 가져오기/읽기, v1 데이터 가져오기
// 5단계: http 플러그인(기상청·에어코리아·유튜브 API 호출, CORS 없이)
// 6단계: 1초 tick 이벤트(백그라운드에서도 타이머·알람 정확히), 사이트 창 열기 권한
// 2.1.0: 자동 업데이트 (check_update / install_update)
// 2.5.0: 로그인 기억 — WebView2(엣지 엔진)의 비밀번호 저장/자동 채우기 켜기
// 2.6.0: 판서 사진을 data/images 파일로 (save_image·read_image·cleanup_images, sbimg 프로토콜)
//
// 저장 위치: <앱 데이터 폴더>/data/
//   settings.json, board.json, notice.json, saved-boards.json, popup-note.json
//   각 파일은 *.json.tmp 에 먼저 쓰고 이름을 바꿔 교체하므로 쓰다가 전원이 꺼져도
//   원본은 깨지지 않고, 직전 내용은 *.json.bak 에 남습니다.
//   alarm/<파일명>  사용자가 고른 알람 소리
// ============================================================
use std::io::Write;
use tauri::{Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

/// data 폴더 경로 (없으면 만듦)
fn data_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("data");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// 저장소 이름은 영문 소문자·숫자·하이픈만 (경로 조작 방지)
fn check_store_name(name: &str) -> Result<(), String> {
    if name.is_empty()
        || !name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    {
        return Err(format!("잘못된 저장소 이름: {name}"));
    }
    Ok(())
}

/// 파일 이름은 폴더 구분자·상위 이동 금지
fn check_file_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err(format!("잘못된 파일 이름: {name}"));
    }
    Ok(())
}

/// <name>.json 내용을 읽음. 없거나 비어 있으면 빈 문자열.
#[tauri::command]
fn load_store(app: tauri::AppHandle, name: String) -> Result<String, String> {
    check_store_name(&name)?;
    let path = data_dir(&app)?.join(format!("{name}.json"));
    Ok(std::fs::read_to_string(&path).unwrap_or_default())
}

/// <name>.json.bak 내용을 읽음 (원본이 깨졌을 때 JS가 호출)
#[tauri::command]
fn load_store_backup(app: tauri::AppHandle, name: String) -> Result<String, String> {
    check_store_name(&name)?;
    let path = data_dir(&app)?.join(format!("{name}.json.bak"));
    Ok(std::fs::read_to_string(&path).unwrap_or_default())
}

/// <name>.json 을 원자적으로 저장: tmp 에 쓰고(디스크 동기화) → 기존을 bak 으로 복사 → tmp 를 본 파일로 교체
#[tauri::command]
fn save_store(app: tauri::AppHandle, name: String, content: String) -> Result<(), String> {
    check_store_name(&name)?;
    let dir = data_dir(&app)?;
    let main = dir.join(format!("{name}.json"));
    let tmp = dir.join(format!("{name}.json.tmp"));
    let bak = dir.join(format!("{name}.json.bak"));

    {
        let mut f = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
        f.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
        f.sync_all().map_err(|e| e.to_string())?;
    }
    if main.exists() {
        std::fs::copy(&main, &bak).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&tmp, &main).map_err(|e| e.to_string())?;
    Ok(())
}

/// 사용자가 고른 소리 파일을 data/alarm/ 로 복사하고 파일 이름을 돌려줌
#[tauri::command]
fn import_alarm_mp3(app: tauri::AppHandle, src: String) -> Result<String, String> {
    let dir = data_dir(&app)?.join("alarm");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let src_path = std::path::Path::new(&src);
    let file_name = src_path
        .file_name()
        .ok_or_else(|| "파일 이름을 알 수 없습니다".to_string())?
        .to_string_lossy()
        .to_string();
    let dest = dir.join(&file_name);
    std::fs::copy(src_path, &dest).map_err(|e| e.to_string())?;
    Ok(file_name)
}

/// data/alarm/<name> 의 바이트를 그대로 돌려줌 (JS 에서 Blob 으로 재생)
#[tauri::command]
fn read_alarm_mp3(app: tauri::AppHandle, name: String) -> Result<tauri::ipc::Response, String> {
    check_file_name(&name)?;
    let path = data_dir(&app)?.join("alarm").join(&name);
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

// ---------- 2.6.0: 판서·알림 사진을 파일로 ----------
// 예전에는 사진을 base64 글자로 판서 HTML 안에 넣어서, 보관할 때마다 저장 파일이 커지고 같은 사진이 계속 복사됐음.
// 이제 사진은 data/images/<내용 SHA-256 앞 32자>.<jpg|png|gif|webp> 로 한 번만 저장하고,
// HTML 에는 sbimg 프로토콜 주소와 data-file="<파일 이름>" 만 남김. (같은 사진은 같은 이름 → 자동으로 한 장만)
// 웹뷰 주소: 윈도우 https://sbimg.localhost/<이름>, macOS·리눅스 sbimg://localhost/<이름> (JS 의 convertFileSrc 가 만듦)

fn images_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = data_dir(app)?.join("images");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// 사진 파일 이름 규칙: 16진수 32자 + 허용 확장자 (경로 조작·다른 파일 접근 방지)
fn is_image_name(name: &str) -> bool {
    let Some((stem, ext)) = name.split_once('.') else { return false };
    stem.len() == 32
        && stem.chars().all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c))
        && matches!(ext, "jpg" | "png" | "gif" | "webp")
}

fn image_mime(name: &str) -> &'static str {
    match name.rsplit('.').next() {
        Some("png") => "image/png",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        _ => "image/jpeg",
    }
}

/// 사진 저장. 본문은 사진 바이트 그대로(raw), 파일 이름은 x-image-name 머리글로 받음.
/// 같은 이름이 이미 있으면(같은 내용) 다시 쓰지 않음.
#[tauri::command]
fn save_image(app: tauri::AppHandle, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("사진 데이터 형식이 올바르지 않습니다".into());
    };
    let name = request
        .headers()
        .get("x-image-name")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default();
    if !is_image_name(name) {
        return Err(format!("잘못된 사진 이름: {name}"));
    }
    if bytes.is_empty() {
        return Err("빈 사진입니다".into());
    }
    let dir = images_dir(&app)?;
    let path = dir.join(name);
    if path.exists() {
        return Ok(());
    }
    let tmp = dir.join(format!("{name}.tmp"));
    {
        let mut f = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
        f.write_all(bytes).map_err(|e| e.to_string())?;
        f.sync_all().map_err(|e| e.to_string())?;
    }
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

/// 사진 바이트를 그대로 돌려줌 (회전처럼 픽셀을 다시 그릴 때. 프로토콜 주소를 캔버스에 그리면 출처 제한에 걸릴 수 있어서)
#[tauri::command]
fn read_image(app: tauri::AppHandle, name: String) -> Result<tauri::ipc::Response, String> {
    if !is_image_name(&name) {
        return Err(format!("잘못된 사진 이름: {name}"));
    }
    let bytes = std::fs::read(images_dir(&app)?.join(&name)).map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// 어느 저장 내용에서도 쓰지 않는 사진 파일 중 grace_days 일이 지난 것을 지움 (시작할 때 JS 가 호출).
/// keep: 지금 저장 내용 전체에서 찾은 사진 이름들. 지운 개수를 돌려줌.
#[tauri::command]
fn cleanup_images(app: tauri::AppHandle, keep: Vec<String>, grace_days: u64) -> Result<u32, String> {
    let keep: std::collections::HashSet<String> = keep.into_iter().collect();
    let grace = std::time::Duration::from_secs(grace_days * 24 * 60 * 60);
    let now = std::time::SystemTime::now();
    let mut removed = 0;
    for entry in std::fs::read_dir(images_dir(&app)?).map_err(|e| e.to_string())? {
        let Ok(entry) = entry else { continue };
        let name = entry.file_name().to_string_lossy().to_string();
        if !is_image_name(&name) || keep.contains(&name) {
            continue; // 규칙에 안 맞는 파일은 건드리지 않음
        }
        let old_enough = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| now.duration_since(t).ok())
            .is_some_and(|age| age >= grace);
        if old_enough && std::fs::remove_file(entry.path()).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}

/// <name>.json 을 <name>.<tag>.json 으로 한 번만 복사해 둠 (이미 있으면 그대로). 사진을 파일로 옮기기 전 원본 보관용
#[tauri::command]
fn snapshot_store_once(app: tauri::AppHandle, name: String, tag: String) -> Result<(), String> {
    check_store_name(&name)?;
    check_store_name(&tag)?;
    let dir = data_dir(&app)?;
    let src = dir.join(format!("{name}.json"));
    let dest = dir.join(format!("{name}.{tag}.json"));
    if src.exists() && !dest.exists() {
        std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// sbimg 프로토콜: data/images/<이름> 을 웹뷰에 보내 줌. 이름이 내용의 해시라 바뀌지 않으므로 오래 캐시
fn serve_image(app: &tauri::AppHandle, request: &tauri::http::Request<Vec<u8>>) -> tauri::http::Response<Vec<u8>> {
    let name = request.uri().path().trim_start_matches('/');
    let builder = tauri::http::Response::builder().header("Access-Control-Allow-Origin", "*");
    let (status, mime, body) = if !is_image_name(name) {
        (400, "text/plain", b"bad image name".to_vec())
    } else {
        match images_dir(app).and_then(|d| std::fs::read(d.join(name)).map_err(|e| e.to_string())) {
            Ok(bytes) => (200, image_mime(name), bytes),
            Err(_) => (404, "text/plain", b"not found".to_vec()),
        }
    };
    let builder = if status == 200 {
        builder.header("Cache-Control", "public, max-age=31536000, immutable")
    } else {
        builder
    };
    builder
        .status(status)
        .header("Content-Type", mime)
        .body(body)
        .unwrap_or_else(|_| tauri::http::Response::new(Vec::new()))
}

/// v1(일렉트론) 앱이 남긴 저장 파일 내용. 없으면 빈 문자열.
/// Windows: %APPDATA%\SmartBoardApp\SmartBoard_SaveData.json
/// macOS:   ~/Library/Application Support/SmartBoardApp/SmartBoard_SaveData.json
#[tauri::command]
fn load_v1_data(app: tauri::AppHandle) -> Result<String, String> {
    let base = app.path().data_dir().map_err(|e| e.to_string())?;
    let path = base.join("SmartBoardApp").join("SmartBoard_SaveData.json");
    Ok(std::fs::read_to_string(&path).unwrap_or_default())
}

// ---------- 자동 업데이트 (2.1.0) ----------
// 업데이트 주소(latest.json)는 앱 설정에 저장되어 있어 JS 가 넘겨줍니다.
#[derive(serde::Serialize)]
struct UpdateInfo {
    version: String,
    current: String,
    notes: Option<String>,
    date: Option<String>,
}

async fn build_updater(app: &tauri::AppHandle, endpoint: &str) -> Result<tauri_plugin_updater::Updater, String> {
    let url: tauri::Url = endpoint.trim().parse().map_err(|e| format!("업데이트 주소가 올바르지 않습니다: {e}"))?;
    app.updater_builder()
        .endpoints(vec![url])
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())
}

/// 새 버전이 있는지 확인. 없으면 None.
#[tauri::command]
async fn check_update(app: tauri::AppHandle, endpoint: String) -> Result<Option<UpdateInfo>, String> {
    let updater = build_updater(&app, &endpoint).await?;
    match updater.check().await {
        Ok(Some(u)) => Ok(Some(UpdateInfo {
            version: u.version.clone(),
            current: u.current_version.clone(),
            notes: u.body.clone(),
            date: u.date.map(|d| d.to_string()),
        })),
        Ok(None) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// 내려받아 설치. 진행률은 "sb-update-progress" 이벤트로 보냄. 설치가 끝나면 앱을 다시 시작.
#[tauri::command]
async fn install_update(app: tauri::AppHandle, endpoint: String) -> Result<(), String> {
    let updater = build_updater(&app, &endpoint).await?;
    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "새 버전이 없습니다.".to_string())?;
    let mut downloaded: u64 = 0;
    let h = app.clone();
    let h2 = app.clone();
    update
        .download_and_install(
            move |chunk, total| {
                downloaded += chunk as u64;
                let _ = h.emit("sb-update-progress", serde_json::json!({ "downloaded": downloaded, "total": total }));
            },
            move || {
                let _ = h2.emit("sb-update-progress", serde_json::json!({ "installing": true }));
            },
        )
        .await
        .map_err(|e| e.to_string())?;
    app.restart();
}

/// 데이터 폴더 경로 (설정 화면 안내용)
#[tauri::command]
fn get_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    Ok(data_dir(&app)?.to_string_lossy().to_string())
}

// ------------------------------------------------------------
// 2.5.0: 로그인 기억
//   모든 창(메인 + 팅커벨·아이스크림·유튜브 사이트 창)은 같은 WebView2 프로필
//   (%LOCALAPPDATA%\com.doguri.smartboard\EBWebView) 을 쓰므로 쿠키(로그인 상태)는
//   앱을 껐다 켜도 남습니다. 여기에 더해 WebView2 의 "비밀번호 저장/자동 채우기" 기능을 켭니다.
//   (기본값이 꺼져 있음) 켜면 엣지처럼 로그인할 때 "비밀번호 저장" 안내가 뜨고,
//   다음 방문 때 아이디·비밀번호가 자동으로 채워집니다. 저장은 Windows DPAPI 로 암호화됩니다.
// ------------------------------------------------------------
fn enable_login_memory<R: tauri::Runtime>(webview: &tauri::Webview<R>) {
    #[cfg(windows)]
    {
        let label = webview.label().to_string();
        let _ = webview.with_webview(move |pw| {
            use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings4;
            use windows_core::Interface;
            unsafe {
                let ok = (|| -> windows_core::Result<()> {
                    let core = pw.controller().CoreWebView2()?;
                    let settings = core.Settings()?;
                    let s4: ICoreWebView2Settings4 = settings.cast()?;
                    s4.SetIsGeneralAutofillEnabled(true)?;
                    s4.SetIsPasswordAutosaveEnabled(true)?;
                    Ok(())
                })();
                if let Err(e) = ok {
                    eprintln!("[{label}] 비밀번호 자동 채우기 설정 실패: {e}");
                }
            }
        });
    }
    #[cfg(not(windows))]
    {
        let _ = webview;
    }
}

fn login_memory_plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("login-memory")
        .on_webview_ready(|webview| enable_login_memory(&webview))
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 6단계: 1초마다 "sb-tick" 이벤트를 보냄.
        // 웹뷰의 setInterval 은 창이 가려지거나 최소화되면 브라우저가 느리게 돌려서
        // 타이머·알람이 늦거나 빠지므로, 시계는 Rust 스레드가 대신 쳐 줍니다.
        .setup(|app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(std::time::Duration::from_secs(1));
                let ms = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);
                let _ = handle.emit("sb-tick", ms);
            });
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(login_memory_plugin())
        // 2.6.0: 판서 사진 파일 (data/images) 을 웹뷰에 보여 주는 주소
        .register_uri_scheme_protocol("sbimg", |ctx, request| serve_image(ctx.app_handle(), &request))
        .invoke_handler(tauri::generate_handler![
            load_store,
            load_store_backup,
            save_store,
            save_image,
            read_image,
            cleanup_images,
            snapshot_store_once,
            import_alarm_mp3,
            read_alarm_mp3,
            load_v1_data,
            get_data_dir,
            check_update,
            install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
