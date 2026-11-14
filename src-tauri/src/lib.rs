// ============================================================
// 스마트 전자칠판 v2 — Rust(백엔드) 쪽
// 3단계: 파일 저장(원자적 쓰기 + 백업), 알람 MP3 가져오기/읽기, v1 데이터 가져오기
// 5단계: http 플러그인(기상청·에어코리아·유튜브 API 호출, CORS 없이)
// 6단계: 1초 tick 이벤트(백그라운드에서도 타이머·알람 정확히), 사이트 창 열기 권한
// 2.1.0: 자동 업데이트 (check_update / install_update)
// 2.5.0: 로그인 기억 — WebView2(엣지 엔진)의 비밀번호 저장/자동 채우기 켜기
// 2.6.0: 판서 사진을 data/images 파일로 (save_image·read_image·cleanup_images, sbimg 프로토콜)
// 2.7.0: 창 위치·크기 기억 (tauri-plugin-window-state), 데이터 백업·복원 (export_backup / import_backup)
// 2.8.0: PC 켜면 자동 실행 (tauri-plugin-autostart)
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

// ---------- 2.7.0: 데이터 백업·복원 ----------
// 백업 파일(.zip) 안: <저장소>.json (settings·board·notice·saved-boards·popup-note), images/<사진>, alarm/<소리>,
//                      haruieum-backup.json (만든 날짜·버전 표시용)
// 창 위치(.window-state.json)와 사이트 로그인은 PC 마다 다르므로 넣지 않음.
const STORE_NAMES: [&str; 5] = ["settings", "board", "notice", "saved-boards", "popup-note"];
const BACKUP_MARK: &str = "haruieum-backup.json";

/// 표시용 시각 문자열(JS 가 넘김)은 숫자·하이픈만
fn check_stamp(stamp: &str) -> Result<(), String> {
    if stamp.is_empty() || stamp.len() > 32 || !stamp.chars().all(|c| c.is_ascii_digit() || c == '-') {
        return Err(format!("잘못된 시각: {stamp}"));
    }
    Ok(())
}

fn write_backup_zip(app: &tauri::AppHandle, dest: &std::path::Path, stamp: &str) -> Result<u32, String> {
    use zip::write::SimpleFileOptions;
    let dir = data_dir(app)?;
    let tmp = dest.with_extension("zip.tmp");
    let file = std::fs::File::create(&tmp).map_err(|e| format!("백업 파일을 만들 수 없습니다: {e}"))?;
    let mut zip = zip::ZipWriter::new(file);
    let deflated = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let stored = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored); // 사진·소리는 이미 압축됨
    let mut count = 0u32;
    let mut add = |zip: &mut zip::ZipWriter<std::fs::File>, name: String, path: &std::path::Path, opts: SimpleFileOptions| -> Result<(), String> {
        let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
        zip.start_file(name, opts).map_err(|e| e.to_string())?;
        zip.write_all(&bytes).map_err(|e| e.to_string())?;
        count += 1;
        Ok(())
    };
    let result = (|| -> Result<(), String> {
        for name in STORE_NAMES {
            let p = dir.join(format!("{name}.json"));
            if p.is_file() {
                add(&mut zip, format!("{name}.json"), &p, deflated)?;
            }
        }
        for sub in ["images", "alarm"] {
            let Ok(rd) = std::fs::read_dir(dir.join(sub)) else { continue };
            for entry in rd.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if entry.path().is_file() && !name.ends_with(".tmp") && check_file_name(&name).is_ok() {
                    add(&mut zip, format!("{sub}/{name}"), &entry.path(), stored)?;
                }
            }
        }
        let info = serde_json::json!({ "app": "하루이음", "version": app.package_info().version.to_string(), "created": stamp });
        zip.start_file(BACKUP_MARK, deflated).map_err(|e| e.to_string())?;
        zip.write_all(info.to_string().as_bytes()).map_err(|e| e.to_string())?;
        Ok(())
    })();
    let finished = result.and_then(|_| zip.finish().map(|_| ()).map_err(|e| e.to_string()));
    if let Err(e) = finished {
        let _ = std::fs::remove_file(&tmp);
        return Err(format!("백업 중 오류: {e}"));
    }
    std::fs::rename(&tmp, dest).map_err(|e| e.to_string())?;
    Ok(count)
}

/// 지금 데이터를 dest(.zip) 로 백업. 담은 파일 수를 돌려줌 (JS 가 먼저 저장을 마친 뒤 호출)
#[tauri::command]
fn export_backup(app: tauri::AppHandle, dest: String, stamp: String) -> Result<u32, String> {
    check_stamp(&stamp)?;
    write_backup_zip(&app, std::path::Path::new(&dest), &stamp)
}

/// src(.zip) 로 복원. 먼저 지금 데이터를 <앱 데이터>/backups/before-restore-<시각>.zip 으로 남긴 뒤,
/// 저장 파일(json)을 백업의 것으로 바꾸고 사진·소리를 추가함. 끝나면 JS 가 화면을 다시 읽음.
/// 돌려주는 값: 자동으로 남긴 '복원 전' 백업 파일 경로
#[tauri::command]
fn import_backup(app: tauri::AppHandle, src: String, stamp: String) -> Result<String, String> {
    check_stamp(&stamp)?;
    let file = std::fs::File::open(&src).map_err(|e| format!("백업 파일을 열 수 없습니다: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|_| "하루이음 백업 파일(.zip)이 아닙니다.".to_string())?;
    let names: Vec<String> = archive.file_names().map(String::from).collect();
    if !names.iter().any(|n| n == BACKUP_MARK || n == "settings.json") {
        return Err("하루이음 백업 파일이 아닙니다.".into());
    }
    // 저장 파일은 바꾸기 전에 전부 읽어서 JSON 인지 확인 (깨진 백업으로 지금 데이터를 지우지 않게)
    let mut stores: Vec<(String, Vec<u8>)> = Vec::new();
    for name in STORE_NAMES {
        let entry_name = format!("{name}.json");
        if let Ok(mut f) = archive.by_name(&entry_name) {
            let mut buf = Vec::new();
            std::io::Read::read_to_end(&mut f, &mut buf).map_err(|e| e.to_string())?;
            serde_json::from_slice::<serde_json::Map<String, serde_json::Value>>(&buf)
                .map_err(|_| format!("백업 안의 {entry_name} 가 손상되었습니다."))?;
            stores.push((entry_name, buf));
        }
    }
    if stores.is_empty() {
        return Err("백업 파일에 저장된 내용이 없습니다.".into());
    }

    // 1) 지금 데이터 보관
    let backups = app.path().app_data_dir().map_err(|e| e.to_string())?.join("backups");
    std::fs::create_dir_all(&backups).map_err(|e| e.to_string())?;
    let before = backups.join(format!("before-restore-{stamp}.zip"));
    write_backup_zip(&app, &before, &stamp)?;

    // 2) 사진·소리 (없는 것만 추가. 같은 이름의 사진은 내용도 같음)
    let dir = data_dir(&app)?;
    for i in 0..archive.len() {
        let mut f = archive.by_index(i).map_err(|e| e.to_string())?;
        let Some(path) = f.enclosed_name() else { continue };
        let rel = path.to_string_lossy().replace('\\', "/");
        let Some((sub, name)) = rel.split_once('/') else { continue };
        let ok = match sub {
            "images" => is_image_name(name),
            "alarm" => check_file_name(name).is_ok(),
            _ => false,
        };
        if !ok || name.contains('/') {
            continue;
        }
        let target_dir = dir.join(sub);
        std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
        let target = target_dir.join(name);
        if sub == "images" && target.exists() {
            continue;
        }
        let tmp = target_dir.join(format!("{name}.tmp"));
        let mut out = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
        std::io::copy(&mut f, &mut out).map_err(|e| e.to_string())?;
        out.sync_all().map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, &target).map_err(|e| e.to_string())?;
    }

    // 3) 저장 파일 교체: 백업에 없는 저장소는 비움(지난 데이터가 섞이지 않게), .bak 도 지움
    for name in STORE_NAMES {
        let _ = std::fs::remove_file(dir.join(format!("{name}.json.bak")));
        let _ = std::fs::remove_file(dir.join(format!("{name}.json")));
    }
    for (entry_name, bytes) in stores {
        let tmp = dir.join(format!("{entry_name}.tmp"));
        {
            let mut f = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
            f.write_all(&bytes).map_err(|e| e.to_string())?;
            f.sync_all().map_err(|e| e.to_string())?;
        }
        std::fs::rename(&tmp, dir.join(&entry_name)).map_err(|e| e.to_string())?;
    }
    Ok(before.to_string_lossy().to_string())
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
        // 2.8.0: PC 를 켜면 자동 실행 (환경설정에서 켜고 끔. 윈도우는 사용자 레지스트리 Run 항목)
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        // 2.7.0: 메인 창의 위치·크기·최대화를 기억 (듀얼 모니터에서 닫은 화면에 다시 뜸).
        // 저장된 위치가 지금 연결된 어느 모니터에도 걸치지 않으면(모니터를 뺀 경우) 위치는 되살리지 않고 OS 에 맡김.
        // 창은 숨긴 채 만들어지고(tauri.conf.json visible:false) 위치를 되살린 뒤 이 플러그인이 보여 줌
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::MAXIMIZED
                        | tauri_plugin_window_state::StateFlags::VISIBLE,
                )
                .with_filter(|label| label == "main")
                .build(),
        )
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
            export_backup,
            import_backup,
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
