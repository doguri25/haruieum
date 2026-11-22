# 하루이음 (스마트 전자칠판)

교실 전자칠판용 시간표·종·판서·알림장 앱입니다. Tauri 2 + Vite + TypeScript (일렉트론 v1.6.11 에서 옮겨 옴).
3.0.0 부터 저장소는 https://github.com/doguri25/haruieum 입니다 (2.x 까지는 doguri25/smartboard-v2).

## 현재 상태: v3.0.0 — 하루이음 Aurora (새 화면)
- 1단계: Tauri 창에서 기존 앱 실행
- 2단계:
  - 인라인 스크립트 → `src/legacy-app.js` 로 분리 (기능 변경 없음)
  - 두 번 정의돼 있던 함수 8개 정리, 일렉트론 전용 코드 제거
  - Tailwind·아이콘을 CDN 대신 앱에 포함 → 인터넷 없이도 화면이 뜸 (폰트는 아직 CDN)
  - 창 크기에 따라 앱 전체가 같은 비율로 줄어들도록 배율 적용 (`src/responsive.css`)
  - '항상 위' 버튼을 Tauri 창 API로 연결
  - 깃허브 액션으로 윈도우 설치 파일(exe) 자동 빌드 (`.github/workflows/build-windows.yml`)
  - 떠 있는 팝업(팝업 노트·타이머·소음 측정기·학습 약속) 드래그 이동, 오른쪽 아래 손잡이로 크기 조절,
    위치·크기 기억 (`src/floating.ts`, `src/floating.css`)
- 3단계:
  - 저장을 localStorage 에서 **파일**로 교체 (`src/storage.ts` ↔ Rust `save_store`)
    - 종류별로 파일을 나눔: settings / board / notice / saved-boards / popup-note
    - 입력 후 0.4초 멈추면 저장, 임시 파일에 쓴 뒤 교체(원자적), 직전 내용은 `.bak` 으로 보관
    - 파일이 깨져 있으면 `.bak` 에서 자동 복구, 창을 닫을 때 저장 안 된 것을 먼저 씀
    - 처음 실행 시 v1(일렉트론) 저장 파일이 있으면 자동으로 가져옴
  - 알림 모드에서 사진·글자 크기·지우기 조작 시 판서가 덮어써지던 버그 수정
  - 알람 소리: 'MP3 찾기' 버튼으로 파일 선택 → 앱 데이터 폴더로 복사 → 기본음/사용자 소리 재생 (`src/alarm-audio.ts`)
- 4단계: 판서 편집기를 TipTap 으로 교체 (`src/board-editor.ts`, `src/board-editor.css`)
  - 글꼴·크기·색이 **선택한 글자에만** 적용됨 (선택이 없으면 판서 전체의 기본 글꼴·크기 변경)
  - 사진: 모서리 손잡이로 크기 조절, 정렬(왼쪽/가운데/오른쪽), ±10%, 드래그 앤 드롭·붙여넣기 삽입
  - 글꼴 파일을 앱에 포함 (주아·나눔고딕·나눔명조·손글씨·감자꽃) → 오프라인에서도 같은 모양
  - 메이플스토리체 추가: 넥슨 배포 파일 2개를 `public/fonts/` 에 넣으면 적용 (README.txt 참고)
  - 되돌리기(Ctrl+Z), 굵게(Ctrl+B), 기울임(Ctrl+I), 밑줄(Ctrl+U), 표(열 너비 드래그 조절), 목록("1. ", "- " 입력)
- 5단계:
  - 날씨를 **기상청 단기예보 + 에어코리아**(공공데이터포털, 국내 서버)로 교체 (`src/weather.ts`, `src/regions.ts`)
    - 지역은 시/도 → 시/군/구 선택(전국 229곳 내장), 기상청 격자 좌표는 자동 계산
    - 날씨 창 ⚙ 에 공공데이터포털 인증키를 한 번 넣으면 됨 (아래 "API 키 준비" 참고)
  - 유튜브 **앱 안 검색 + 바로 재생** (`src/youtube.ts`): 검색 결과 12개를 썸네일로 보여주고 누르면 재생.
    주소 붙여넣기는 키 없이 재생. 검색은 유튜브 창 🔑 에 YouTube Data API 키 필요
  - 외부 API 는 Tauri http 플러그인으로 호출(브라우저 CORS 제약 없음). 허용 주소는 `src-tauri/capabilities/default.json`
- 6단계:
  - 앱이 다른 창 밑에 있거나 최소화돼도 타이머·알람이 정확히 울림 (`src/host.ts`, `src-tauri/src/lib.rs`)
    - 웹뷰의 setInterval 은 창이 가려지면 브라우저가 느리게 돌려서 생기던 문제. 시계를 Rust 스레드가 1초마다 보내는 이벤트로 돌림
    - 타이머는 남은 초를 세지 않고 '종료 시각'에서 계산 → tick 이 늦어도 실제 시간과 일치
    - 절전 등으로 몇 분이 통째로 빠져도, 그 사이 시각의 알람을 순서대로 울림(최대 10분)
    - 알람 팝업이 뜰 때 창을 앞으로 가져옴
  - 가로 메뉴에 팅커벨·아이스크림 버튼 추가. 누르면 기본 브라우저가 아닌 **앱 자체 창(최대화)** 으로 열림
    (사이트가 iframe 삽입을 막는 경우가 많아 별도 창을 씀. 로그인은 앱과 같은 프로필에 유지됨). 도구 설정에서 숨길 수 있음
- v2.1.0:
  - **디자인 테마 5종** (`src/skins.css`, `src/skins.ts`): 밝은 기본·다크·칠판·파스텔·종이 노트. 환경설정 → 디자인 테마.
    회색 계열 색·모서리·그림자를 전부 CSS 변수로 묶고 `tailwind.config.js` 에서 연결. 강조색·바탕색·판넬색 설정은 그 위에 덧입혀짐
  - **가로 도구 메뉴 자동 맞춤** (`src/fit.ts`): 버튼 전체 너비가 남은 공간보다 크면 비율로 줄이고, 여유가 있으면 1.25배까지 키움
  - **자동 업데이트** (`src/updater.ts`, Rust `check_update`/`install_update`): 아래 "자동 업데이트 운영" 참고
  - **버전 정보 자동화** (`src/version.ts`, `src/changelog.json`): 로고를 누르면 현재 버전과 변경 이력이 자동 표시.
    새 버전은 `node scripts/bump.mjs 2.3.0 "제목" "변경1" "변경2"` 로 올림 (package.json·tauri.conf.json·Cargo.toml·changelog 동시 갱신)
- v2.2.0:
  - 학습 약속 팝업도 크기 조절 (`src/floating.ts` — scale 모드)
  - 열고 닫는 효과·클릭 효과 (`src/motion.ts`, `src/motion.css`): 모달·떠 있는 창이 살짝 커지며 열리고 작아지며 닫힘.
    기존 코드가 `.active/.hidden` 을 바로 바꾸므로 MutationObserver 로 닫히는 순간을 잡아 `.closing` 을 잠깐 붙임. 버튼은 눌림(scale)+물결(ripple)
  - 디자인 다듬기 (`src/polish.css`): 유리 느낌 머리글, 도구 버튼 하이라이트, 시간표 현재 교시 강조, 떠 있는 창 손잡이 표시, 입력칸 초점 링
  - 판서 글꼴 변경 버그: 드래그 선택 뒤 글꼴 상자를 누르면 브라우저가 선택을 푸는 경우가 있어, 마지막 선택 범위를 기억해 두었다가 적용 (`src/board-editor.ts` lastRange)
- v2.2.1:
  - **창 닫기 버그 수정**: 닫기 전에 저장을 마치려고 close 를 가로챈 뒤 `destroy()` 로 닫는데, `core:window:allow-destroy` 권한이 빠져 있어
    X 버튼이 듣지 않았음 (`src-tauri/capabilities/default.json`, `src/main.ts`). 저장이 3초 넘게 걸려도 닫히도록 함
  - 학습 약속 묶음 상자의 테두리·그림자 제거 (안의 알약에만 적용)
  - 머리글 테마 연동: `--sk-header-*` 변수 (`src/skins.css`) 를 `src/polish.css` 에서 사용
  - 테마 추가: 오션(진한 바다색 다크), 모노(흑백 미니멀·평면 버튼), 라벤더(연보라), 그라파이트(흑연색 다크) — 총 9종
- v2.2.2:
  - 판서 도구 모음 둘레의 검정/흰 선 제거: 색 없이 `border` 만 쓴 곳의 기본 테두리색(DEFAULT)이 테마 매핑에서 빠져
    currentColor 로 그려지던 것 (`tailwind.config.js` borderColor.DEFAULT → `--sk-line`)
  - 테마 추가: 선셋(복숭아·코랄 그라데이션) — 총 10종
- v2.2.3: 학습 약속 팝업은 아래·왼쪽이 고정된 채 위로 자라므로 손잡이를 오른쪽 위로 옮기고, 가로·세로 끈 거리의 평균으로 배율 계산 (`src/floating.ts`)
- v2.3.0:
  - 급식 알레르기 표시 (`src/lunch.ts`): NEIS 식단의 "(1.2.5.)" 번호를 읽어, 급식 창 ⚠ 에서 체크한 재료가 든 메뉴를 붉게 + 재료 배지로 표시.
    체크하지 않은 번호는 숨김. 저장 키 `smartBoardAllergens`
  - 급식·학교 검색을 Tauri http 플러그인 경유로 전환 (허용 주소에 open.neis.go.kr 추가)
  - 시간표 제목 `whitespace-nowrap` + 볼륨 슬라이더가 줄어들 수 있게, 교시/시간/과목 글자 한 단계 키움
- v2.4.0:
  - 날씨 3일 예보 (`src/weather.ts` daily): 단기예보에서 날짜별 TMX/TMN·대표 하늘·가장 심한 강수형태·최대 강수확률
  - 유튜브를 모달에서 떠 있는 창(`#floating-youtube`, box 모드)으로 전환. 처음엔 화면 가운데(`centerFirst`), 이후 위치·크기 기억
  - 판서 ↔ 알림 전환 효과(`sb-mode-out/in`) + 모드별 스크롤 위치 저장(`smartBoardScroll_board/notice`), 포커스는 스크롤 없이(`focusNoScroll`)
  - 도구 메뉴 컨테이너 `overflow-hidden`, 최소 배율 0.3, 여유 8px — 가로 스크롤바가 생기지 않음
  - 버전 이력 최근 5개 + 더보기 (`src/version.ts`)
  - 버그 수정: 떠 있는 창 감시자 안에서 class 를 매번 건드려 무한 반복(CPU 100%)에 빠지던 문제 — 감시 전에 한 번만 정리
- v2.5.0:
  - 유튜브 검색 결과 제목이 잘리던 문제 (`src/youtube.ts`): 결과 그리드가 높이가 정해진 상자 안에 바로 들어 있어
    CSS 그리드가 행을 상자 높이에 맞춰 눌렀고, 카드가 `overflow-hidden` 이라 썸네일 아래 제목이 잘렸음.
    스크롤 상자 안에 별도 그리드(`#youtube-results-grid`)를 두고 카드를 `<div role="button">` 으로 바꿔 내용 높이대로 표시
  - 커서 물결 (`src/motion.ts` cursorRipple, `src/motion.css` `.sb-cursor-ripple`): 버튼이 아니어도 화면 어디를 누르든
    누른 지점에 테마 강조색 원이 퍼짐. 맨 위 고정 층(`#sb-click-fx`, pointer-events 없음)에 그리므로 어떤 창 위에서도 보임. 터치는 조금 더 크게
  - **로그인 기억** (`src-tauri/src/lib.rs` enable_login_memory):
    - 메인 창과 사이트 창(팅커벨·아이스크림·유튜브)은 같은 WebView2 프로필(`%LOCALAPPDATA%\com.doguri.smartboard\EBWebView`)을 쓰므로
      쿠키(로그인 상태)가 앱을 껐다 켜도 남음. 사이트에서 "로그인 유지/자동 로그인"을 켜면 다음 실행 때 바로 로그인된 상태
    - WebView2 의 비밀번호 저장·자동 채우기(`IsPasswordAutosaveEnabled`, `IsGeneralAutofillEnabled`)는 기본이 꺼져 있어 켜 줌.
      엣지처럼 로그인할 때 "비밀번호 저장" 안내가 뜨고, 다음에는 아이디·비밀번호가 자동으로 채워짐 (Windows DPAPI 로 암호화 저장, 앱은 비밀번호를 보관하지 않음)
    - 유튜브 플레이어 머리글에 '유튜브 로그인' 버튼: youtube.com 을 앱 창으로 열어 로그인하면 같은 프로필이라 플레이어(임베드)에도 적용
    - Windows 전용 의존성 `webview2-com`, `windows-core` (`src-tauri/Cargo.toml`, tauri 와 같은 버전)
- v2.5.1: 학습 약속 팝업의 크기 조절 손잡이를 다른 창처럼 오른쪽 아래로 (`src/floating.ts` attachResize).
  이 창은 아래·왼쪽 기준으로 놓이므로, 조절하는 동안만 위·왼쪽 고정(`top`/`transform-origin: top left`)으로 바꿔 끄는 방향으로 커지게 하고,
  놓으면 보이는 위치 그대로 `bottom` 값으로 환산해 저장 (`.sb-resize-grip-top` 제거)
- v2.5.2: 깃허브 자동 업데이트 연결 — 저장소 https://github.com/doguri25/smartboard-v2
  - 앱의 업데이트 주소 기본값을 `https://github.com/doguri25/smartboard-v2/releases/latest/download/latest.json` 으로 내장 (`src/updater.ts` DEFAULT_UPDATE_URL).
    환경설정의 주소 칸은 비워 두면 기본값을 씀
  - `.github/workflows/build-windows.yml`: main 에 push 된 버전의 릴리스가 없으면 윈도우 러너에서 빌드 → 릴리스 생성 → setup.exe / .sig / latest.json 게시 (tauri-action).
    릴리스 본문은 `scripts/release-notes.mjs` 가 changelog 에서 만듦
- v2.5.3: 판서·알림 사진 넣기 수정
  - 윈도우 앱에서 사진을 끌어다 놓아도 반응이 없던 문제: Tauri 2 는 창 설정 `dragDropEnabled` 기본값이 true 라 파일 놓기를 Tauri 가 가로채고,
    윈도우(WebView2)에서는 웹 화면에 HTML5 `drop` 이벤트가 오지 않음. 메인 창에 `"dragDropEnabled": false` (`src-tauri/tauri.conf.json`)
  - 그 대신 편집 영역 밖에 파일을 놓으면 웹뷰가 그 파일을 열어 앱 화면이 사라지므로, 창 전체의 파일 dragover/drop 기본 동작을 막음.
    편집 영역(`#notepad-editor`)은 글자 영역 바깥 여백에 놓아도 사진이 들어감 (`src/board-editor.ts` insertDroppedFiles)
  - 열 수 없는 사진(아이폰 HEIC, 손상된 파일)은 `img.onload` 가 오지 않아 조용히 끝났음 → `onerror` 에서 이유를 안내.
    윈도우에 HEIF 확장이 없으면 .heic 의 형식(type)이 비어 오므로 확장자로도 사진 여부를 판단
- v2.6.0: 사진 기능 강화
  - **사진을 파일로 저장** (`src/board-images.ts`, Rust `save_image`/`read_image`/`cleanup_images`/`snapshot_store_once`, `sbimg` 프로토콜):
    - 사진은 `data/images/<내용 SHA-256 앞 32자>.<jpg|png|gif|webp>` 에 한 번만 저장 (같은 사진은 같은 이름 → 한 장). 바이트는 invoke 원시 본문 + `x-image-name` 머리글로 보냄
    - HTML 에는 `<img src="sbimg 주소" data-file="이름">`. 주소는 `convertFileSrc(이름, "sbimg")` — 윈도우 `https://sbimg.localhost/…`(useHttpsScheme), macOS·리눅스 `sbimg://localhost/…`.
      운영체제마다 다르므로 읽을 때 `data-file` 로 다시 만듦 (`BoardImage` 의 src parseHTML, 보관 기록 보기는 `resolveImagesIn`)
    - 시작할 때 판서·알림·보관 목록의 예전 base64 사진을 파일로 옮김. 옮기기 전 원본은 `<저장소>.before-images.json` 으로 한 번 보관
    - 시작 30초 뒤, 어떤 저장 내용에도 없는 사진 파일 중 7일 지난 것을 지움 (규칙에 맞는 이름만)
    - 브라우저(`npm run dev`)에서는 예전처럼 data URL
  - **아이폰 사진(HEIC) 자동 변환**: `heic-to`(libheif wasm, LGPL-3.0, 약 3MB)를 처음 필요할 때만 불러옴(별도 청크). 이름이 .jpg 여도 파일 머리(ftyp)가 HEIC 면 변환
  - **투명 PNG 유지**: 그린 뒤 투명 픽셀이 있으면 PNG, 없으면 JPEG 0.8 (예전엔 모두 JPEG 라 투명한 곳이 검게 변했음)
  - **사진 90° 돌리기·크게 보기** (`src/image-viewer.ts`): 돌리기는 원본 바이트(`read_image`)를 캔버스에서 돌려 새 파일로 저장(되돌리기 가능).
    크게 보기는 사진 도구 버튼 또는 사진 두 번 누르기(판서·알림·보관 기록 보기), 누르거나 ESC 로 닫힘
  - **±10% 버튼 버그**: TipTap 크기 조절 노드뷰는 처음 그릴 때만 width/height 를 화면에 적용해서, 속성이 바뀌어도 화면 크기는 그대로였음 →
    `BoardImage.addNodeView` 에서 update 때마다 맞춤
- v2.7.0: 버그 9건 수정 + 창 위치 기억 + 학사일정·휴일 무음 + 급식 날짜 이동 + 기록 불러오기 + 알림장 자동 보관 + 백업·복원
  - 버그 수정
    - **되돌리기 덮어쓰기**: `setHTML`(시작·판서↔알림 전환)이 되돌리기 기록에 남아, 알림으로 바꾼 뒤 Ctrl+Z 한 번에 판서 내용이 돌아와
      알림장으로 저장됐음 → 내용을 바꿀 때 `EditorState.create` 로 기록을 비움 (`src/board-editor.ts`)
    - **도구 메뉴 무한 반복**: `fit.ts` 가 바꾼 style 을 자기 MutationObserver 가 다시 잡아 매 프레임 재계산 → 계산 끝에 `takeRecords()` 로 버림
    - 점심 시작에 "수업이 시작되었습니다" 대신 점심 안내, 수업이 하나도 없는 날(주말)엔 점심 칸만으로 종이 울리지 않음 (`checkAlarms`)
    - '내 MP3' + 파일 없음(기본음) → 경고창 대신 `public/alarm.mp3` 재생
    - 판서 배경색: 시작할 때 모드별 키(`smartBoardNotepadBg_board`)를 읽음
    - 날짜가 바뀌면(`updateClock` 의 `onDayChanged`) 시간표 다시 그리기·알림장 자동 보관·학사일정 새로 받기
    - 교시 칸 종 끄기/켜기 전에 확인, 보관 기록 삭제 버튼을 hover 없이도 표시
    - 미세먼지: PM2.5 는 자체 기준(15/35/75)으로, 머리글은 PM10·PM2.5 중 나쁜 쪽 (`src/weather.ts` worstDustGrade)
  - **창 위치·크기 기억** (`tauri-plugin-window-state`, main 창만): 위치·크기·최대화를 `<설정 폴더>/.window-state.json` 에.
    저장된 위치가 지금 연결된 모니터에 걸치지 않으면(모니터를 뺀 경우) 위치는 되살리지 않음.
    창은 `visible:false` 로 만들고 플러그인이 위치를 되살린 뒤 보여 줌(깜빡임 없음). JS 가 시작하자마자 숨겨져 있으면 보이게(안전장치),
    옮기거나 크기를 바꾸면 1.5초 뒤 저장(앱을 닫지 않고 PC 를 꺼도 남음, 권한 `window-state:allow-save-window-state`)
  - **NEIS 공용** (`src/neis.ts`): 인증키(선택, `smartBoardNeisKey`)가 있으면 KEY·pSize=1000. 급식 창 학교 검색 아래에서 입력
  - **학사일정·휴일 자동 무음** (`src/school-calendar.ts`): SchoolSchedule 을 월 단위로 받아(키가 없으면 평일 주 단위 + 오늘 하루 따로) 저장(12시간 캐시).
    수업공제일 구분이 휴업일·공휴일이면 `checkAlarms` 가 수업 종·퇴근 알람을 건너뛰고 시간표에 '오늘은 쉬는 날' 표시.
    '오늘은 종 울리기'로 그날만 해제(`smartBoardHolidayOverride`). 달력 창은 날짜 칸에 일정, 아래에 이달 일정 목록 (토요휴업일은 숨김)
  - **급식 날짜 이동** (`src/lunch.ts`): ◀ ▶(주말 건너뜀)·오늘·하루/이번 주(월~금, 중식 `MMEAL_SC_CODE=2`). 하루 보기도 중식을 골라 표시
  - **기록 불러와서 고치기** (`loadViewedBoard`): [판서]→판서, [알림]→알림, 그 밖은 지금 화면으로. 지금 내용이 있으면 확인 후 목록에 자동 보관하고 바꿈
  - **알림장 날짜별 자동 보관** (`autoArchiveNotice`): 날짜가 바뀌면 전날 알림장을 "[알림] 날짜 (자동 보관)"으로. 내용은 그대로 두고, 같은 내용은 다시 보관하지 않음(해시).
    기록 목록 창에서 끄기(`smartBoardNoticeAutoArchive`). 시작 때 호출은 `currentBoardMode` 선언 뒤에 실행되도록 setTimeout
  - **데이터 백업·복원** (`src/backup.ts`, Rust `export_backup`/`import_backup`, `zip` 크레이트): 저장 파일 json·images·alarm 을 zip 하나로.
    복원은 백업 안의 json 을 먼저 모두 검사한 뒤, 지금 데이터를 `<앱 데이터>/backups/before-restore-<시각>.zip` 으로 남기고 교체 → 화면 다시 읽기.
    교체 중에는 `storage.suspend()` 로 메모리의 옛 내용이 파일을 덮어쓰지 않게 함. 창 위치·로그인 정보는 넣지 않음
- v2.8.0: PC 켜면 자동 실행 · 타이머 미리 알림 · QR 코드 · 작은 수정
  - **자동 실행** (`src/autostart.ts`, `tauri-plugin-autostart`, 권한 `autostart:default`): 환경설정 → 앱 시작 체크. 누르는 즉시 등록/해제
    (윈도우: HKCU Run, 리눅스: ~/.config/autostart/SmartBoard.desktop). 처음엔 꺼짐
  - **타이머**: 진행 막대(`#timer-progress`, 남은 비율 = 남은 시간 / 전체 시간, 시간을 더하면 전체도 늘어남),
    미리 알림 5·3·1분 전(`checkTimerWarnings`) — 그 분을 지나는 순간 한 번 종 + "N분 남았습니다", 그 분보다 짧은 타이머는 안 울림,
    시간을 더해 다시 위로 올라가면 다시 울릴 수 있음. 체크 상태는 `smartBoardTimerWarn`
  - **QR 코드** (`src/qr.ts`, qrcode-generator MIT): 도구 메뉴 'QR'(도구 설정에서 숨김 가능). UTF-8 로 넣어 한글도 됨.
    크게 보기는 PNG 를 이미지 보기 창으로, 판서에 넣기는 `boardEditor.insertPreparedImage` 로 다시 압축하지 않고 PNG 그대로
  - 선생님 입력(과목·명렬표·뽑기 결과·보관 기록 제목)을 HTML 에 넣을 때 escape (`escHtml`), 날씨 오류 문구 escape
  - GIF 는 10MB 이하면 원본 그대로 저장(움직임 유지). 회전하면 PNG 로 (첫 장면)
- v2.8.1: 여러 에이전트(영역별 5명 + 영역별 반박 검증 5명)로 점검해 확인된 버그 28건 수정. 수정마다 회귀 검사를 두고, 수정 전 코드에서 실패하는 것도 확인
  - 저장·백엔드 (`src-tauri/src/lib.rs`, `src/storage.ts`, `src/backup.ts`)
    - **두 번 실행 방지** `tauri-plugin-single-instance`(첫 플러그인): 두 번째 실행은 기존 창을 앞으로 가져오고 끝남
    - `load_store`: 파일 없음만 빈 문자열, 그 밖의 읽기 오류는 오류로. JS 는 '읽지 못함'이면 .bak → 그래도 안 되면 그 저장소는 이번 실행에서 저장 안 함(`blocked`),
      '내용 깨짐'이면 .bak → 없으면 `<이름>.corrupt.json` 으로 남기고 빈 상태로. 문제가 있었으면 '처음 실행' 가져오기를 하지 않음. .bak 에서 복구한 것은 바로 다시 씀
    - `save_store`: 본 파일이 정상 JSON 일 때만 .bak 으로 복사 (깨진 본 파일이 멀쩡한 .bak 을 덮지 않게)
    - `check_file_name` 에서 ':' 금지 (윈도우 'C:이름' 은 join 하면 데이터 폴더를 벗어남) + 복원 시 대상 폴더 확인
    - 복원: 새 저장 파일을 모두 `.restore.tmp` 로 쓴 뒤에야 지금 파일을 지우고 교체. JS 는 실패하면 `storage.resume(true)` 로 메모리 내용을 다시 씀
  - 편집기 (`src/board-editor.ts`): 내용 교체 때 기억한 선택 범위(`lastRange`) 초기화, 붙여넣기에 글자가 있는 HTML 이 있으면 그림 대신 HTML(엑셀 표),
    사진 처리 중 판서↔알림이 바뀌면 넣지 않음(`docGen`), 빈 표·목록도 저장(`getHTML`), 기록 보기에 `.sb-rich`, 팝업노트 보관 시 escape
  - 시간·알람 (`src/legacy-app.js`): 점심 순서 선택은 설정 창 미리보기만(입력 칸 유지, 저장 때 적용), 놓친 분 확인 기준 60초, 종이 울리는 중엔 타이머 미리 알림 소리 없음,
    알람 창을 바깥 클릭으로 닫아도 `closeAlarm`, 소음 규칙 저장(없는 3번째 칸), 소음 측정기 시작 중 중복·닫힘 처리, 내 MP3 미리듣기는 창에서 고른 파일(파일 선택만으로는 저장 안 함),
    달력 달 이동은 1일 기준, 학습 약속 메뉴를 펴면 화면 안으로(`refitFloating`)
  - 학사일정·급식·날씨·유튜브: 캐시는 이번 달에서 먼 달부터 버림(이번 달·방금 받은 달 유지), 받는 동안 학교가 바뀌면 버림,
    학교 선택·인증키 저장 뒤 시간표 다시 그림, 급식은 받기 시작할 때 이전 식단을 비우고 늦은 실패 응답 무시,
    한 글자 구 이름(중구·동구…)은 측정소 이름이 정확히 같을 때만, 유튜브 검색 순번으로 늦은 결과 무시
  - 떠 있는 창 (`src/floating.ts`): pointerdown 마다 '끌었음' 표시 초기화(터치), z-index 119 에서 순서대로 다시 매김
- v2.8.2: 2차 여러 에이전트 점검(영역을 새로 나눠 5명 + 반박 검증 5명) → 확인된 19건 + 불확실 2건 수정. 회귀 검사 18개는 2.8.1 코드에서 13개 실패하는 것 확인
  - Rust: 메인 창이 없어지면 `app.exit(0)` (사이트 창이 남아 창 없는 앱이 계속 돌던 문제), `check_file_name` 은 점으로만 된 이름만 금지('...' 허용),
    `import_alarm_mp3` 는 같은 이름의 다른 소리면 '이름 (2).mp3', 백업·복원 명령은 `#[tauri::command(async)]`,
    `read_text_or_empty` 는 깨진 UTF-8 을 '내용 깨짐'으로(손실 변환해 돌려줌 → JS 가 사본 남기고 계속 저장)
  - 저장: 깨진 저장소 사본은 `<이름>.corrupt-<시각>.json` (깨질 때마다), `storage.unsafeForCleanup`(읽기 문제·복원 중)이면 사진 정리 안 함,
    닫는 중 두 번째 close 요청은 무시
  - 편집기: 붙여넣기 '글자 있음'은 DOMParser 의 body 글자만 (워드 head 의 XML 때문에 그림이 file:/// 로 들어가던 문제)
  - `src/legacy-app.js`: `soundBusy()`(멜로디·대기 중·말하는 중) 동안 소음 경고 안 함, 타이머 종료는 미뤘다가(`timerEndPending`) 소리가 끝나면,
    음성만 있는 알람도 앞 알람 소리를 멈춤, 밝은 판서 배경은 글씨색 고정(#1e293b), 기본 시간표가 바뀐 경우에만 오늘 바꾼 과목 지움,
    `smartBoardAlarmDuration` 저장, 명렬표 붙여넣기 줄 단위(빈 줄 유지·마지막 칸), 판서 초기화 때 알림장도, 숨은 초기화 항목은 네 항목 모두 체크했을 때만,
    기록 목록은 id 를 HTML 에 넣지 않고 addEventListener, 기록 보기는 `sanitizeHtml`(위험 태그·on*·javascript: 제거)
  - 학사일정은 받기 실패 시 5분마다 재시도, 급식은 받기 순번(`loadSeq`)으로 학교가 바뀐 경우도 늦은 응답 무시
  - 주의: 시작할 때(onReady) 바로 실행되는 코드가 쓰는 `let` 변수는 startLegacyApp 위쪽에 선언해야 함 — 아래쪽에 두면 선언 전 접근 오류가
    try/catch 에 묻혀 시작이 중간에 멈춤(이번에 색 팔레트가 비는 것을 회귀 검사로 잡음)

- v3.0.0: **하루이음 Aurora** — 유리 판·아래쪽 Dock·위쪽 상태 바를 갖춘 새 화면. 기능 코드(`src/legacy-app.js`)의 id·onclick 은 그대로 두고 화면 뼈대만 바꿈
  - 뼈대 `index.html`, 동작 `src/shell.ts`, 모양 `src/aurora.css` (모든 테마 변수 `--sk-*`·`--brand-*` 를 써서 11개 테마 어디서나 맞게)
  - 상단 바: 왼쪽 '모든 도구', 가운데 **지금 수업 상태**(몇 교시·몇 분 남음·진행 고리 — 시간표 칸을 읽어 계산, 휴업일·주말·쉬는 시간·수업 전·방과 후),
    오른쪽 날씨·미세먼지, **빠른 설정**(음량·수업 종·항상 위·전체 화면·PC 켜면 실행·디자인 테마), 환경 설정
  - 왼쪽 사이드바: 큰 시계 '지금' 카드(오전/오후는 작게) + 오늘의 시간표
  - 판서 창: 머리줄(보관·기록 | 판서/알림장 전환 버튼 | 배경·지우기·집중 모드) + 판 아래쪽에 떠 있는 판서 도구
  - **Dock**: 도구를 아래쪽 유리 막대로, 손을 올리면 커지고 이웃도 살짝, 열려 있는 도구 아래 점. 도구 설정에서 위/아래 선택
  - **모든 도구 모아 보기**: 열린 화면(판서·알림장 미리보기, 지난 기록) + 도구·설정 22개 + 검색(Enter 로 첫 번째 실행, Esc)
  - **집중 모드**: 판서만 크게 (사이드바·위젯·Dock 숨김, '도구 모음' 버튼으로 잠깐 꺼냄, Esc 로 나감)
  - 오른쪽 위젯(가로 1500px 이상): 오늘 급식(우리 반 알레르기 표시, 주말이면 다음 월요일) · 2주 안 학사일정
  - **오로라 테마**(새 기본): 해 뜨는 언덕 배경(앱에 내장된 SVG), 유리 판, 노을 주황(#EF6B3F)·자두(#7B2F55). 글꼴 Nunito(숫자·영문, `@fontsource/nunito`) + 나눔고딕 (3.0.1 에서 바꿈)
  - 3.0 으로 처음 켤 때 한 번(`sb.v3.aurora`): 오로라 테마·노을 주황·Dock 아래로 바꾸고 바탕색·판 색 지정은 테마 기본으로 (다시 고를 수 있음). 시간표·판서·기록은 그대로
  - 기능 코드에 추가: `getBoardMode/setBoardMode`, `isBellEnabled/setBellEnabled`, 도구 위치는 `.sb-dock-top`
  - **자동 업데이트 서명키를 새로 만듦** (3.0.0 부터, `tauri.conf.json` 의 pubkey 교체). 2.x 와 키가 달라 2.x → 3.0 은 설치 파일로 한 번 직접 설치. 새 비공개키는 haruieum 저장소 시크릿 `TAURI_SIGNING_PRIVATE_KEY` 와 선생님 PC 에만 보관
- v3.0.1 (지금): 디자인 다듬기 — 다른 운영체제와 '비슷한 느낌'만 남기고 하루이음만의 모습으로
  - 색: 하루이음 '노을 주황'(#EF6B3F)·'자두'(#7B2F55), 배경 언덕 색도 새로. 강조색 값 이름 `ubuntu` → `noeul` (3.0.0 사용자 자동 변환, CSS 는 둘 다 같은 색)
  - 숫자·시계 글꼴 Ubuntu → Nunito (둥근 모양, 숫자 폭이 같아 시계가 흔들리지 않음)
  - 왼쪽 위 버튼: '활동'(점 세 개) → '모든 도구'(격자 아이콘), 앱 안 문구에서 다른 회사·운영체제 이름 뺌
  - 검사: 기존 브라우저 회귀 검사 전부 + 새 화면 49개 + 위젯 9개(NEIS 가짜 응답) + 실제 앱(tauri-driver)

## 개발 PC 준비 (macOS, 한 번만)
```bash
xcode-select --install
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh   # 질문에는 Enter
```
Rust 설치 후 터미널을 껐다 켭니다. Node.js는 nodejs.org에서 LTS 설치.

## 실행
```bash
npm install
npm run tauri dev
```

## 자동 업데이트 운영 (깃허브 릴리스)
저장소: https://github.com/doguri25/haruieum (공개 — 앱이 로그인 없이 latest.json 을 받아야 함. 2.x 는 doguri25/smartboard-v2)

준비 (한 번만): 저장소 Settings → Secrets and variables → Actions → New repository secret →
이름 `TAURI_SIGNING_PRIVATE_KEY`, 값은 `src-tauri/updater.key` 파일 내용 전체. (키 파일은 절대 저장소에 올리지 말 것 — .gitignore 에 제외돼 있음)

새 버전 내는 순서:
```
node scripts/bump.mjs 2.6.0 "제목" "변경 사항 1" "변경 사항 2"
git add -A && git commit -m "v2.6.0" && git push
```
main 에 올라온 버전의 릴리스가 아직 없으면 워크플로가 알아서 빌드해 `v2.6.0` 릴리스를 만듭니다(이미 있는 버전이면 건너뜀).
몇 분 뒤 Releases 에 `SmartBoard_2.6.0_x64-setup.exe`, `.sig`, `latest.json` 이 올라가고,
설치된 앱은 시작할 때(그리고 6시간마다) 확인해 안내 띠를 띄움 → [지금 업데이트] → 내려받기 → 설치 → 재시작.
로고를 눌러 나오는 버전 창의 [업데이트 확인] 으로 바로 확인할 수도 있음.
Actions 탭에서 "Run workflow" 로 태그 없이 수동 실행도 가능(현재 package.json 버전으로 릴리스).

수동 배포(깃허브 액션 없이 직접 빌드한 경우): `node scripts/make-latest-json.mjs` 로 latest.json 을 만들고
setup.exe · .sig · latest.json 세 파일을 해당 버전 릴리스에 올리면 됨.

## 윈도우 설치 파일
- `SmartBoard_2.4.0_x64-setup.exe` — 설치 파일. 두 번 클릭 → 설치 → 시작 메뉴/바탕화면의 "SmartBoard" 실행.
  관리자 권한 없이 현재 사용자 계정에 설치됩니다. 처음 실행 때 v1(일렉트론)의 시간표·설정을 자동으로 가져옵니다.
- 서명이 없는 파일이라 Windows SmartScreen 경고("Windows의 PC 보호")가 뜰 수 있습니다.
  **추가 정보 → 실행** 을 누르면 됩니다.
- 이 파일은 리눅스에서 `x86_64-pc-windows-gnu` 타깃으로 크로스 컴파일해 만든 것입니다
  (`src-tauri/.cargo/config.toml`, `src-tauri/tauri.cross.conf.json` 이 그 설정). 일반 개발 PC 에서는 아래 깃허브 액션이 더 쉽습니다.

## 윈도우 설치 파일 만들기 (깃허브 액션)
맥에서는 윈도우 exe를 만들 수 없어서 깃허브 서버에서 빌드합니다.
1. 이 폴더에서 처음 한 번:
   ```bash
   git init
   git add .
   git commit -m "v2 2단계: Tauri 이전, 코드 분리, 반응형 배율"
   ```
2. github.com → New repository → 이름 `haruieum` (자동 업데이트를 쓰려면 Public) → Create
3. 화면에 나오는 안내대로:
   ```bash
   git remote add origin https://github.com/<내계정>/haruieum.git
   git branch -M main
   git push -u origin main
   ```
4. 저장소 → **Actions** 탭 → 왼쪽 "Windows 설치 파일 빌드" → **Run workflow**
5. 10~15분 뒤 완료되면 실행 페이지 하단 **Artifacts** 에서 `SmartBoard-windows-installer` 다운로드
   (압축을 풀면 `SmartBoard_2.0.0_x64-setup.exe` 가 나옵니다)

이후에는 코드를 고치고 `git add . && git commit -m "..." && git push` 한 뒤 4~5번만 반복하면 됩니다.

## API 키 준비 (한 번만)
**공공데이터포털 (날씨·미세먼지)** — data.go.kr
1. 회원가입 → 로그인
2. 검색창에 "기상청_단기예보" → `기상청_단기예보 ((구)_동네예보) 조회서비스` → 활용신청 (자동 승인)
3. 검색창에 "에어코리아 대기오염정보" → `한국환경공단_에어코리아_대기오염정보` → 활용신청
4. 마이페이지 → 인증키 발급현황 → **일반 인증키(Encoding 또는 Decoding, 아무거나)** 복사
5. 앱의 날씨 창 → ⚙ → 지역 선택 + 인증키 붙여넣기 → 저장
   (신청 직후에는 키가 아직 안 먹을 수 있어요. 최대 1시간 정도 걸립니다)

**YouTube Data API (검색용, 선택)** — console.cloud.google.com
1. 프로젝트 만들기 → "API 및 서비스" → 라이브러리 → `YouTube Data API v3` 사용 설정
2. 사용자 인증 정보 → 사용자 인증 정보 만들기 → API 키 → 복사
3. 앱의 유튜브 창 → 🔑 → 붙여넣기 → 저장
- 무료 할당량으로 하루 약 100회 검색. 주소 붙여넣기 재생은 키와 무관.

## 데이터 파일 위치
- Windows: `%APPDATA%\com.doguri.smartboard\data\`
- macOS: `~/Library/Application Support/com.doguri.smartboard/data/`
- 안에 `settings.json`, `board.json`, `notice.json`, `saved-boards.json`, `popup-note.json` 과 각각의 `.bak`,
  그리고 `alarm/` 폴더(선택한 알람 소리)가 생깁니다. 이 폴더를 통째로 복사하면 다른 PC로 옮길 수 있습니다.

## 알아둘 점
- 판서 안의 사진은 HTML 안에 base64(최대 1024px, JPEG) 로 들어갑니다. 파일 저장이라 용량 제한은 없습니다.
- v1 에서 만든 판서는 그대로 불러오지만, 예전 방식(`<font>` 태그)으로 넣은 글자색은 유지되지 않을 수 있습니다.
- `npm run dev` 로 브라우저에서만 열면 파일 대신 localStorage 를 씁니다(테스트용).
- 소음측정기(마이크)는 macOS에서 권한 설정을 추가로 해야 해서 아직 동작하지 않습니다.
- 로그인 기억은 사이트가 세션 쿠키만 쓰면(로그인 유지 옵션이 없으면) 앱을 껐다 켰을 때 다시 로그인해야 하지만,
  아이디·비밀번호는 자동으로 채워져 있으니 로그인 버튼만 누르면 됩니다. 저장된 비밀번호는 WebView2 프로필 폴더를 지우면 함께 지워집니다.
- `legacy/` 는 v1 원본 보관용입니다. 빌드에 포함되지 않습니다.

## 폴더
```
index.html               화면 (HTML만 남음)
src/main.ts              TypeScript 진입점: 아이콘, Tauri 창 API, 화면 배율
src/legacy-app.js        v1 기능 코드 전체 (다음 단계에서 모듈로 분리)
src/responsive.css       창 크기에 따른 배율 규칙
src/floating.ts/.css     떠 있는 팝업 드래그·크기조절·위치 기억
src/storage.ts           저장소 (메모리 캐시 + 파일 저장, 버킷 분리)
src/alarm-audio.ts       알람 소리 선택·재생
src/board-editor.ts/.css 판서 편집기 (TipTap): 선택 서식, 사진 크기·정렬, 표
src/weather.ts           기상청·에어코리아 날씨 (지역·인증키 설정 포함)
src/regions.ts           전국 시/군/구 좌표표 + 기상청 격자 변환
src/youtube.ts           유튜브 검색·재생
src/lunch.ts             급식 식단·학교 검색·알레르기 표시
src/net.ts               외부 API 호출 도우미 (Tauri http 플러그인)
src/host.ts              1초 tick·창 앞으로·사이트 창 열기 (Tauri 창 API)
src/skins.ts/.css        디자인 테마 (변수 정의·적용·설정 카드)
src/fit.ts               가로 도구 메뉴 너비 맞춤
src/updater.ts           자동 업데이트 확인·설치 UI
src/version.ts           버전 정보 창 (changelog.json)
src/motion.ts/.css       열고 닫는 효과·클릭 효과
src/polish.css           디자인 다듬기
scripts/bump.mjs         버전 올리기
scripts/make-latest-json.mjs  업데이트용 latest.json 만들기
public/fonts/            메이플스토리체 파일을 넣는 곳
src-tauri/src/lib.rs     Rust 명령: 파일 저장/읽기, MP3 가져오기, v1 데이터 가져오기
src/tailwind.css         Tailwind 진입 파일 (설정은 tailwind.config.js)
public/alarm.mp3         기본 알람음
legacy/                  v1 원본 보관
src-tauri/               Rust/Tauri 설정 (tauri.conf.json, 권한, 아이콘)
.github/workflows/       윈도우 exe 자동 빌드
app-icon.png             아이콘 원본 (1024x1024)
```
