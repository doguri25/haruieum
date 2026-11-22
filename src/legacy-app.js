// ============================================================
// 스마트 전자칠판 v1 기능 코드 (index.html 인라인 스크립트에서 분리)
// 6단계: 시계는 Rust tick(window.smartboardHost.onTick), 타이머는 종료 시각 기준, 알람 때 창 앞으로, 사이트 창 열기.
// 5단계: 날씨(src/weather.ts)·유튜브(src/youtube.ts) 는 새 모듈이 담당.
// 4단계: 판서 편집은 src/board-editor.ts(TipTap) 가 담당하고 여기서는 window.boardEditor 를 호출.
// 3단계: 저장은 전부 src/storage.ts 를 통함 (localStorage 직접 사용 없음),
//        알림 모드에서 판서가 덮어써지던 버그 수정, MP3 선택을 호스트 API로.
// main.ts 가 저장소 로딩을 끝낸 뒤 startLegacyApp() 을 부릅니다.
// 다음 단계에서 이 파일을 기능별 모듈로 쪼갭니다.
// ============================================================
import { storage } from "./storage";
import { boardEditor } from "./board-editor";

const onReady = (fn) => (document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", fn, { once: true }) : fn());

export function startLegacyApp() {

        // 2.8.0: 선생님이 입력한 글자(과목·학생 이름·기록 제목)를 HTML 에 넣을 때 쓰는 escape.
        // 예전엔 그대로 넣어서 과목에 큰따옴표(")를 쓰면 시간표 칸이 깨졌음
        function escHtml(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }

        // (일렉트론 전용 localStorage 파일 패치는 제거됨 — 3단계에서 Tauri 파일 저장으로 대체)

        let timeSlots = [ { id: 1, name: '1교시', start: '09:00', end: '09:40' }, { id: 2, name: '2교시', start: '09:50', end: '10:30' }, { id: 3, name: '3교시', start: '10:40', end: '11:20' }, { id: 4, name: '4교시', start: '11:30', end: '12:10' }, { id: 5, name: '점심', start: '12:10', end: '13:00' }, { id: 6, name: '5교시', start: '13:00', end: '13:40' }, { id: 7, name: '6교시', start: '13:50', end: '14:30' } ];
        try { if(storage.getItem('smartBoardTimeSlots')) timeSlots = JSON.parse(storage.getItem('smartBoardTimeSlots')); } catch(e){}

        let schedule = { 1: ['국어', '사회', '수학', '과학', '점심', '체육', '미술'], 2: ['수학', '국어', '영어', '음악', '점심', '도덕', '실과'], 3: ['사회', '과학', '체육', '국어', '점심', '수학', ''], 4: ['영어', '수학', '국어', '사회', '점심', '과학', '체육'], 5: ['국어', '도덕', '미술', '미술', '점심', '수학', '창체'] };
        try { if(storage.getItem('smartBoardSchedule')) schedule = JSON.parse(storage.getItem('smartBoardSchedule')); } catch(e){}

        let dailyOverride = { date: '', overrides: {} };
        try { if(storage.getItem('smartBoardDailyOverride')) dailyOverride = JSON.parse(storage.getItem('smartBoardDailyOverride')); } catch(e){}

        let savedTheme = storage.getItem('smartBoardTheme') || 'default';
        let savedBgColor = storage.getItem('smartBoardBgColor') || 'skin';
        let savedPanelColor = storage.getItem('smartBoardPanelColor') || 'skin';
        let lunchPos = parseInt(storage.getItem('smartBoardLunchPos')) || 4; 
        
        let currentBoardFontSize = parseInt(storage.getItem('smartBoardFontSize')) || 32;
        let currentBoardFont = storage.getItem('smartBoardFont') || "Jua";
        if (currentBoardFont.includes(',')) {
            currentBoardFont = currentBoardFont.split(',')[0].replace(/['"]/g, '').trim(); 
        } else {
            currentBoardFont = currentBoardFont.replace(/['"]/g, '').trim();
        }

        let use24HourClock = JSON.parse(storage.getItem('smartBoardUse24HourClock')) || false; 
        let closeOnOutsideClick = JSON.parse(storage.getItem('smartBoardCloseOutside')) ?? true;
        let isAlarmPopupEnabled = storage.getItem('smartBoardAlarmPopupEnabled') !== 'false';
        let startAlarmOffset = parseInt(storage.getItem('smartBoardStartOffset')) || 0;
        let endAlarmOffset = parseInt(storage.getItem('smartBoardEndOffset')) || 0;
        let alarmDurationSec = parseInt(storage.getItem('smartBoardAlarmDuration')) || 60; 
        let alarmMelody = parseInt(storage.getItem('smartBoardAlarmMelody')) || 1;
        let customMp3FileName = storage.getItem('smartBoardCustomMp3') || '';
        let startAlarmMessage = storage.getItem('smartBoardStartMsg') || "수업이 시작되었습니다.";
        let endAlarmMessage = storage.getItem('smartBoardEndMsg') || "쉬는 시간입니다.";
        let closingAlarmMessage = storage.getItem('smartBoardClosingMsg') || "오늘 하루도 수고하셨습니다. 하교 시간입니다.";
        let customAlarmEnabled = JSON.parse(storage.getItem('smartBoardCustomAlarmEnabled')) || false;
        let customAlarmTime = storage.getItem('smartBoardCustomAlarmTime') || '12:00';
        let customAlarmMessage = storage.getItem('smartBoardCustomAlarmMsg') || '지정된 시간입니다.';
        let customAlarmFreq = storage.getItem('smartBoardCustomAlarmFreq') || 'once';
        let mutedPeriods = JSON.parse(storage.getItem('smartBoardMutedPeriods')) || {};
        
        let isLeaveWorkEnabled = storage.getItem('smartBoardLeaveWorkEnabled') !== 'false'; 
        let leaveWorkTime = storage.getItem('smartBoardLeaveWorkTime') || "16:30";
        let leaveWorkPopupEnabled = JSON.parse(storage.getItem('smartBoardLeaveWorkPopupEnabled') || 'true');
        let leaveWorkPopupDuration = storage.getItem('smartBoardLeaveWorkPopupDuration') || '10';

        let toolVisibility = { picker: true, timer: true, noise: true, attention: true, lunch: true, youtube: true, tinkerbell: true, iscream: true, popupnote: true, activity: true };
        try { if(storage.getItem('smartBoardToolVisibility')) toolVisibility = JSON.parse(storage.getItem('smartBoardToolVisibility')); } catch(e){}
        let studentNames = Array(35).fill(''); try { if(storage.getItem('smartBoardStudentNames')) studentNames = JSON.parse(storage.getItem('smartBoardStudentNames')); } catch(e){}
        let savedBoards = []; try { if(storage.getItem('smartBoardSavedData')) savedBoards = JSON.parse(storage.getItem('smartBoardSavedData')); } catch(e){}
        let globalVolume = storage.getItem('smartBoardVolume') !== null ? parseFloat(storage.getItem('smartBoardVolume')) : 0.5; let maxPickerNum = 25; try { if(storage.getItem('smartBoardMaxPicker')) maxPickerNum = parseInt(storage.getItem('smartBoardMaxPicker')); } catch(e){}
        let timetablePos = storage.getItem('smartBoardTimetablePos') || 'left';
        let tempTimetablePos = timetablePos;
        // 3.0.0: 도구는 아래쪽 Dock 이 기본 ('top' 이면 상단 바 아래)
        let toolPanelPos = storage.getItem('smartBoardToolPos') || 'bottom';
        let tempToolPanelPos = toolPanelPos;
        
        let timerRemaining = 0; let isTimerRunning = false;
        // 2.8.0: 진행 막대용 전체 시간(초)과 미리 알림(5·3·1분 전, 체크로 켜고 끔)
        let timerTotal = 0;
        let timerWarned = {};
        let timerWarn = { 5: true, 3: true, 1: true };
        try { const w = JSON.parse(storage.getItem('smartBoardTimerWarn') || 'null'); if (w && typeof w === 'object') timerWarn = { ...timerWarn, ...w }; } catch(e) {}
        let audioCtx = null; let isAudioPlaying = false; let currentOscillators = []; let chimeTimeout = null; let alarmCountdownIntervalId = null;
        let currentMp3Audio = null;
        let currentCalendarDate = new Date(); let isFakeFullscreen = false;
        
        let lastCheckedMinuteStr = null; 
        let lastTickTime = null;   // 마지막으로 시계를 돌린 시각 (놓친 분 확인용)
        let lastClockDay = null;   // 날짜가 바뀌었는지 확인용 (켜 둔 채 밤을 넘기는 경우)
        // 2.8.2: 시작할 때 시계(initClock)가 바로 쓰므로 여기서 선언 (아래쪽에 두면 선언 전에 읽혀 시작이 중간에 멈춤)
        let ttsPending = false;       // 안내 음성이 곧 나올 예정(0.3초 대기 중) — 이때도 '말하는 중'으로 봄
        let timerEndPending = false;  // 종소리·안내 중에 끝난 타이머 → 소리가 끝나면 알림
        let timerEndAt = 0;        // 타이머 종료 시각(ms). 남은 시간은 매 tick 마다 여기서 계산
        let lastAlarmKey = null;
        let audioUnlocked = false;
        let isAlwaysOnTop = false;

        let currentSaveTarget = 'board';

        let popupNoteFontSize = parseInt(storage.getItem('smartBoardPopupNoteFontSize')) || 24;
        let popupNoteIsBold = storage.getItem('smartBoardPopupNoteIsBold') === 'true';
        let popupNoteColor = storage.getItem('smartBoardPopupNoteColor') || '#1e293b';
        
        // 판서 배경색은 모드별 키(_board/_notice)에 저장됨. 예전엔 시작할 때 옛 키만 읽어서 다시 켜면 배경이 돌아오지 않았음
        let boardBgColor = storage.getItem('smartBoardNotepadBg_board') || storage.getItem('smartBoardNotepadBg') || 'inherit';
        
        // 소음 측정기 변수
        let noiseStream = null;
        let noiseAudioCtx = null;
        let noiseAnalyser = null;
        let noiseDataArray = null;
        let isNoiseRunning = false;
        let noiseSensitivity = parseInt(storage.getItem('smartBoardNoiseSensitivity')) || 5; 
        let noiseWarningCount = 0;
        let noiseWarningCooldown = false;
        let noiseRule1Count = parseInt(storage.getItem('sbNoiseR1C')) || 3;
        let noiseRule1Text = storage.getItem('sbNoiseR1T') || '';
        let noiseRule2Count = parseInt(storage.getItem('sbNoiseR2C')) || 5;
        let noiseRule2Text = storage.getItem('sbNoiseR2T') || '';
        let noiseRule3Count = parseInt(storage.getItem('sbNoiseR3C')) || 10;
        let noiseRule3Text = storage.getItem('sbNoiseR3T') || '';
        let noiseConsecutiveRedCount = 0;

        onReady(() => {
            try { changeTheme(savedTheme); changeBgColor(savedBgColor); changePanelColor(savedPanelColor); } catch(e) {}
            
            try {
                const editorEl = document.getElementById('notepad-editor');
                if (editorEl && window.boardEditor) {
                    boardEditor.init(editorEl);
                    boardEditor.setHTML(storage.getItem('smartBoardCurrentNotepad') || '');
                    // 기본 글꼴: 저장된 이름("Jua")을 글꼴 목록의 전체 스택("Jua", "Nanum Gothic", ...)에 맞춤
                    const fontSelect = document.getElementById('board-font-select');
                    if (fontSelect) {
                        let matched = null;
                        for (const opt of fontSelect.options) {
                            if (opt.value === currentBoardFont || opt.value.startsWith('"' + currentBoardFont + '"') || opt.value.split(',')[0].replace(/"/g,'').trim() === currentBoardFont) { matched = opt.value; break; }
                        }
                        currentBoardFont = matched || fontSelect.options[0].value;
                        fontSelect.value = currentBoardFont;
                    }
                    editorEl.style.fontFamily = currentBoardFont;
                    editorEl.style.fontSize = currentBoardFontSize + 'px';
                    const fontSizeInput = document.getElementById('board-font-size-input');
                    if (fontSizeInput) fontSizeInput.value = currentBoardFontSize;
                    // 내용이 바뀔 때마다 현재 모드(판서/알림)의 키에 저장
                    boardEditor.onUpdate(() => { storage.setItem(currentEditorKey(), boardEditor.getHTML()); });
                    // 어제 켜 두었던 알림장을 기록 목록에 (날짜가 바뀐 경우만).
                    // 이 시점엔 아래쪽의 currentBoardMode 가 아직 선언 전이라, 시작이 끝난 뒤에 실행
                    setTimeout(() => { try { autoArchiveNotice(); } catch (e) { console.error('알림장 자동 보관 실패:', e); } }, 0);
                }
                const ta = document.getElementById('popup-note-textarea');
                if(ta) {
                    ta.value = storage.getItem('smartBoardDraftPopupNote') || '';
                    ta.addEventListener('input', () => { storage.setItem('smartBoardDraftPopupNote', ta.value); });
                }
                
                const r1c = document.getElementById('noise-rule1-count'); if(r1c) r1c.value = noiseRule1Count;
                const r1t = document.getElementById('noise-rule1-text'); if(r1t) r1t.value = noiseRule1Text;
                const r2c = document.getElementById('noise-rule2-count'); if(r2c) r2c.value = noiseRule2Count;
                const r2t = document.getElementById('noise-rule2-text'); if(r2t) r2t.value = noiseRule2Text;
                const r3c = document.getElementById('noise-rule3-count'); if(r3c) r3c.value = noiseRule3Count;
                const r3t = document.getElementById('noise-rule3-text'); if(r3t) r3t.value = noiseRule3Text;

                const sens = document.getElementById('noise-sens-input');
                if(sens) sens.value = noiseSensitivity;
                const sensVal = document.getElementById('noise-sens-val');
                if(sensVal) sensVal.innerText = noiseSensitivity;

                // 칠판 배경색 초기화
                const bgSelect = document.getElementById('board-bg-select');
                if(bgSelect) bgSelect.value = boardBgColor;
                applyBoardBg(boardBgColor);

                applyPopupNoteStyles(); 
            } catch(e) {}

            try { refreshIcons(); applyLunchPosition(); initClock(); renderTimetable(); setupControls(); applyToolVisibility(); renderBoardColors(); renderTimerWarnToggles(); } catch(e) {}
            // 학사일정(휴업일)을 받아 오면 시간표를 다시 그림 (휴업일이면 '쉬는 날' 표시)
            if (window.schoolCalendar) window.schoolCalendar.refreshToday().then(() => { try { renderTimetable(); } catch(e) {} });
            try { fetchWeatherData(); setInterval(fetchWeatherData, 1800000); } catch(e) {}
            
            applyTimetablePos();
            applyToolPos();

            if (storage.getItem('smartBoardPopupNoteVisible') === 'true') {
                const n = document.getElementById('floating-popup-note');
                if(n) { n.classList.remove('hidden'); n.classList.add('flex'); }
            }
            if (storage.getItem('smartBoardTimerVisible') === 'true') {
                const t = document.getElementById('floating-timer');
                if(t) { t.classList.remove('hidden'); t.classList.add('flex'); }
            }

            document.querySelectorAll('.modal').forEach(m => m.addEventListener('mousedown', (e) => { if (e.target === m && closeOnOutsideClick) closeModal(m.id); }));
            
            const unlockAudio = () => {
                if (!audioUnlocked) {
                    try {
                        initAudio();
                        if(audioCtx) { 
                            const o = audioCtx.createOscillator(); 
                            const g = audioCtx.createGain(); 
                            g.gain.value = 0; 
                            o.connect(g); 
                            g.connect(audioCtx.destination); 
                            o.start(0); 
                            o.stop(audioCtx.currentTime + 0.01); 
                        }
                        audioUnlocked = true;
                        document.removeEventListener('click', unlockAudio); 
                        document.removeEventListener('touchstart', unlockAudio); 
                        document.removeEventListener('keydown', unlockAudio);
                    } catch(e) { console.error("Audio unlock error:", e); }
                }
            };
            document.addEventListener('click', unlockAudio); 
            document.addEventListener('touchstart', unlockAudio); 
            document.addEventListener('keydown', unlockAudio);
        });

        // 소음 측정기 함수
        async function toggleNoiseMeter() {
            const m = document.getElementById('floating-noise-meter');
            if(m.classList.contains('hidden')) {
                m.classList.remove('hidden'); m.classList.add('flex');
                startNoiseMeter();
            } else {
                m.classList.add('hidden'); m.classList.remove('flex');
                stopNoiseMeter();
            }
        }

        // 2.8.1: 마이크 준비(권한 확인)를 기다리는 동안 다시 누르거나 닫으면 마이크가 두 개 켜지거나 숨은 채로 계속 측정됐음
        let noiseStarting = false;
        async function startNoiseMeter() {
            if(isNoiseRunning || noiseStarting) return;
            noiseStarting = true;
            const panel = document.getElementById('floating-noise-meter');
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                if (panel.classList.contains('hidden')) { stream.getTracks().forEach(t => t.stop()); return; } // 기다리는 사이 닫힘
                noiseStream = stream;
                noiseAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
                noiseAnalyser = noiseAudioCtx.createAnalyser();
                noiseAnalyser.fftSize = 256;
                const source = noiseAudioCtx.createMediaStreamSource(noiseStream);
                source.connect(noiseAnalyser);
                
                noiseDataArray = new Uint8Array(noiseAnalyser.frequencyBinCount);
                isNoiseRunning = true;
                measureNoiseLoop();
            } catch(e) {
                alert("마이크 접근 권한을 허용해야 소음 측정이 가능합니다.");
                if (!panel.classList.contains('hidden')) toggleNoiseMeter(); 
            } finally {
                noiseStarting = false;
            }
        }

        function stopNoiseMeter() {
            isNoiseRunning = false;
            if(noiseStream) {
                noiseStream.getTracks().forEach(track => track.stop());
                noiseStream = null;
            }
            if(noiseAudioCtx && noiseAudioCtx.state !== 'closed') {
                noiseAudioCtx.close();
                noiseAudioCtx = null;
            }
            updateTrafficLight(0);
            document.getElementById('noise-level-bar').style.width = '0%';
        }

        function measureNoiseLoop() {
            if (!isNoiseRunning) return;
            requestAnimationFrame(measureNoiseLoop);
            
            noiseAnalyser.getByteFrequencyData(noiseDataArray);
            let sum = 0;
            for(let i = 0; i < noiseDataArray.length; i++) {
                sum += noiseDataArray[i];
            }
            let average = sum / noiseDataArray.length;
            
            let threshold = 130 - (noiseSensitivity * 10); 
            if (threshold <= 0) threshold = 10;
            
            let levelPercent = (average / threshold) * 100;
            if(levelPercent > 100) levelPercent = 100;
            
            updateNoiseVisuals(levelPercent);
        }

        function updateNoiseVisuals(level) {
            const bar = document.getElementById('noise-level-bar');
            bar.style.width = `${level}%`;
            
            if(level < 40) bar.className = "h-full transition-all duration-100 bg-emerald-500";
            else if(level < 80) bar.className = "h-full transition-all duration-100 bg-yellow-400";
            else bar.className = "h-full transition-all duration-100 bg-red-500";

            updateTrafficLight(level);

            if(level >= 80) {
                noiseConsecutiveRedCount++;
                if(noiseConsecutiveRedCount > 10 && !noiseWarningCooldown) { 
                    triggerNoiseWarning();
                }
            } else {
                noiseConsecutiveRedCount = 0; 
            }
        }

        function updateTrafficLight(level) {
            const g = document.getElementById('nl-green');
            const y = document.getElementById('nl-yellow');
            const r = document.getElementById('nl-red');
            
            g.style.opacity = '0.2'; g.style.boxShadow = 'none';
            y.style.opacity = '0.2'; y.style.boxShadow = 'none';
            r.style.opacity = '0.2'; r.style.boxShadow = 'none';
            
            if(level === 0) return;
            
            if(level < 40) {
                g.style.opacity = '1'; g.style.boxShadow = '0 0 20px rgba(16,185,129,0.8)';
            } else if(level < 80) {
                y.style.opacity = '1'; y.style.boxShadow = '0 0 20px rgba(234,179,8,0.8)';
            } else {
                r.style.opacity = '1'; r.style.boxShadow = '0 0 20px rgba(239,68,68,0.8)';
            }
        }

        function triggerNoiseWarning() {
            // 2.8.2: 종소리·안내 중이거나 알람 창이 떠 있으면 경고하지 않음 (예전엔 경고 음성이 종 안내를 끊었고, 종소리를 소음으로 세었음)
            if (soundBusy() || document.getElementById('modal-alarm')?.classList.contains('active')) { noiseConsecutiveRedCount = 0; return; }
            noiseWarningCooldown = true;
            noiseWarningCount++;
            document.getElementById('noise-warning-count').innerText = noiseWarningCount;
            
            playNote(1046.50, audioCtx ? audioCtx.currentTime : 0, 0.3, 'square');
            
            let msg = `소음 경고 ${noiseWarningCount}회 입니다.`;
            if(noiseWarningCount === noiseRule1Count && noiseRule1Text.trim() !== '') {
                msg += ` 약속한 대로 ${noiseRule1Text} 를 실시합니다.`;
            } else if(noiseWarningCount === noiseRule2Count && noiseRule2Text.trim() !== '') {
                msg += ` 약속한 대로 ${noiseRule2Text} 를 실시합니다.`;
            } else if(noiseWarningCount === noiseRule3Count && noiseRule3Text.trim() !== '') {
                msg += ` 약속한 대로 ${noiseRule3Text} 를 실시합니다.`;
            }
            playTTS(msg);

            const modal = document.getElementById('floating-noise-meter');
            modal.classList.add('bg-red-100');
            setTimeout(() => modal.classList.remove('bg-red-100'), 500);

            setTimeout(() => { noiseWarningCooldown = false; noiseConsecutiveRedCount = 0; }, 5000);
        }

        function updateNoiseSens(val) {
            noiseSensitivity = parseInt(val);
            document.getElementById('noise-sens-val').innerText = noiseSensitivity;
            storage.setItem('smartBoardNoiseSensitivity', noiseSensitivity);
        }

        function saveNoiseRules() {
            noiseRule1Count = parseInt(document.getElementById('noise-rule1-count').value) || 3;
            noiseRule1Text = document.getElementById('noise-rule1-text').value;
            noiseRule2Count = parseInt(document.getElementById('noise-rule2-count').value) || 5;
            noiseRule2Text = document.getElementById('noise-rule2-text').value;
 
            // 2.8.1: 세 번째 규칙 칸은 화면에 없어서, 예전엔 여기서 오류가 나 규칙이 저장되지 않았음
            const r3c = document.getElementById('noise-rule3-count'); if (r3c) noiseRule3Count = parseInt(r3c.value) || 10;
            const r3t = document.getElementById('noise-rule3-text'); if (r3t) noiseRule3Text = r3t.value;
            
            storage.setItem('sbNoiseR1C', noiseRule1Count);
            storage.setItem('sbNoiseR1T', noiseRule1Text);
            storage.setItem('sbNoiseR2C', noiseRule2Count);
            storage.setItem('sbNoiseR2T', noiseRule2Text);
            storage.setItem('sbNoiseR3C', noiseRule3Count);
            storage.setItem('sbNoiseR3T', noiseRule3Text);
        }

        function resetNoiseWarning() {
            noiseWarningCount = 0;
            document.getElementById('noise-warning-count').innerText = "0";
            noiseConsecutiveRedCount = 0;
        }


        // 판서 사진 삽입 및 편집 플로팅 툴바 기능

        /* setupImageDragAndDrop: 4단계에서 편집기(board-editor.ts)로 이동 */

        /* showImageToolbar: 4단계에서 편집기(board-editor.ts)로 이동 */

        /* hideImageToolbar: 4단계에서 편집기(board-editor.ts)로 이동 */

        /* resizeSelectedImage: 4단계에서 편집기(board-editor.ts)로 이동 */

        /* removeSelectedImage: 4단계에서 편집기(board-editor.ts)로 이동 */

        function handleBoardImageUpload(e) {
            if (e.target.files && e.target.files.length > 0) {
                processAndInsertImage(e.target.files[0]);
                e.target.value = '';
            }
        }

        function processAndInsertImage(file) {
            if (!file) return;
            // 형식 확인·안내는 편집기가 함 (형식 정보가 빈 .heic 도 알맞은 안내를 받도록)
            boardEditor.insertImageFile(file);
        }

        function applyPopupNoteStyles() {
            const ta = document.getElementById('popup-note-textarea');
            if(ta) {
                ta.style.fontSize = popupNoteFontSize + 'px';
                ta.style.fontWeight = popupNoteIsBold ? 'bold' : 'normal';
                ta.style.color = popupNoteColor;
            }
            const sd = document.getElementById('popup-note-size-display');
            if(sd) sd.innerText = popupNoteFontSize;
            
            const btnB = document.getElementById('btn-popup-bold');
            if(btnB) {
                if(popupNoteIsBold) { btnB.classList.add('bg-amber-300'); btnB.classList.remove('bg-white'); }
                else { btnB.classList.remove('bg-amber-300'); btnB.classList.add('bg-white'); }
            }
            
            const cols = ['#1e293b', '#ef4444', '#3b82f6'];
            cols.forEach((c, i) => {
                const el = document.getElementById(`p-col-${i+1}`);
                if(el) {
                    if(popupNoteColor === c) { el.classList.add('border-white', 'ring-2', 'ring-amber-400'); el.classList.remove('border-transparent'); }
                    else { el.classList.remove('border-white', 'ring-2', 'ring-amber-400'); el.classList.add('border-transparent'); }
                }
            });
        }

        function changePopupNoteFontSize(delta) { popupNoteFontSize += delta; if(popupNoteFontSize < 10) popupNoteFontSize = 10; if(popupNoteFontSize > 100) popupNoteFontSize = 100; storage.setItem('smartBoardPopupNoteFontSize', popupNoteFontSize); applyPopupNoteStyles(); }
        function togglePopupNoteBold() { popupNoteIsBold = !popupNoteIsBold; storage.setItem('smartBoardPopupNoteIsBold', popupNoteIsBold); applyPopupNoteStyles(); }
        function changePopupNoteColor(col) { popupNoteColor = col; storage.setItem('smartBoardPopupNoteColor', popupNoteColor); applyPopupNoteStyles(); }
        function refreshIcons() { try { if (typeof lucide !== 'undefined') lucide.createIcons(); } catch(e) {} }
        
        function renderBoardColors() { 
            // ⭐️ 공간 확보를 위해 기본 색상을 4개로 축소
            const cols = ['#000000', '#ef4444', '#3b82f6', '#10b981']; 
            const c = document.getElementById('board-colors'); 
            if(c) {
                c.innerHTML = cols.map(col => `<button onclick="boardEditor.setColor('${col}')" class="w-7 h-7 rounded-full border border-slate-300 hover:scale-110 shadow-sm transition-transform shrink-0" style="background-color: ${col};" title="색상 변경"></button>`).join('') +
                `<div class="relative w-7 h-7 rounded-full border border-slate-300 shadow-sm overflow-hidden hover:scale-110 transition-transform cursor-pointer shrink-0" title="더 많은 색상 고르기" style="background: conic-gradient(red, yellow, lime, aqua, blue, magenta, red);">
                    <input type="color" onchange="boardEditor.setColor(this.value)" class="absolute -top-4 -left-4 w-16 h-16 cursor-pointer opacity-0">
                </div>`;
            }
        }

        // ⭐️ 판서 배경색 변경 함수
    function changeBoardBg(val) {
    boardBgColor = val;
    // 현재 모드에 따라 배경색을 독립적으로 저장합니다.
        if (currentBoardMode === 'board') {
        storage.setItem('smartBoardNotepadBg_board', val);
        } else {
        storage.setItem('smartBoardNotepadBg_notice', val);
        }
       applyBoardBg(val);
     }

        function applyBoardBg(val) {
            const ed = document.getElementById('notepad-editor');
            if(!ed) return;
            if(val === 'inherit') {
                ed.style.backgroundColor = 'transparent';
                ed.style.color = ''; // 테마 글씨색
                ed.classList.remove('text-slate-50');
                ed.classList.add('text-slate-800');
            } else {
                ed.style.backgroundColor = val;
                // 어두운 칠판 계열을 선택하면 기본 글씨색을 하얀색으로 변경하여 분필 느낌 연출
                if (val === '#064e3b' || val === '#1e293b') {
                    ed.style.color = '';
                    ed.classList.remove('text-slate-800');
                    ed.classList.add('text-slate-50');
                } else {
                    // 2.8.2: 화이트보드·옐로우보드는 테마와 상관없이 어두운 글씨 (어두운 테마에선 글씨가 흰색이라 보이지 않았음)
                    ed.style.color = '#1e293b';
                    ed.classList.remove('text-slate-50');
                    ed.classList.add('text-slate-800');
                }
            }
        }


        function openTableModal() {
            document.getElementById('input-table-rows').value = 3;
            document.getElementById('input-table-cols').value = 3;
            document.getElementById('modal-table-input').classList.add('active');
            setTimeout(() => document.getElementById('input-table-rows').focus(), 100);
        }

        function confirmInsertTable() {
            const r = parseInt(document.getElementById('input-table-rows').value, 10);
            const c = parseInt(document.getElementById('input-table-cols').value, 10);
            if (isNaN(r) || isNaN(c) || r <= 0 || c <= 0 || r > 30 || c > 12) { alert("올바른 숫자를 입력해주세요. (행 1~30, 열 1~12)"); return; }
            closeModal('modal-table-input');
            boardEditor.insertTable(r, c);
        }

 
        function closeModal(id) { 
            // 2.8.1: 알람 팝업은 closeAlarm 으로 (예전엔 바깥을 눌러 닫으면 숨은 카운트다운이 남아, 나중에 다른 소리를 끊었음)
            if (id === 'modal-alarm') { closeAlarm(); return; }
            const m = document.getElementById(id); 
            if(m) { 
                m.classList.remove('active'); 
                if (id === 'modal-weather') document.getElementById('region-selector-panel')?.classList.add('hidden'); 
                if (id === 'modal-lunch') document.getElementById('school-selector-panel')?.classList.add('hidden'); 
                if (id === 'modal-alarm-settings' || id === 'modal-alarm') stopAudio(); 
            } 
        }

        function openSettingsModal() { 
            renderSettingsInputs(); 
            if (window.updater) window.updater.renderSettings();
            if (window.skins) window.skins.render();
            document.getElementById('setting-lunch-pos').value = lunchPos; 
            document.getElementById('toggle-leave-work').checked = isLeaveWorkEnabled; 
            document.getElementById('input-leave-work-time').value = leaveWorkTime; 
            document.getElementById('toggle-leave-work-popup').checked = leaveWorkPopupEnabled;
            document.getElementById('select-leave-work-duration').value = leaveWorkPopupDuration;
            
            document.getElementById('toggle-close-outside').checked = closeOnOutsideClick; 
            if (window.appAutostart) window.appAutostart.refresh();
            document.getElementById('modal-settings').classList.add('active'); 
        }
        
        async function pickCustomMp3() {
            if (!window.smartboardHost || !window.smartboardHost.pickAlarmMp3) { alert('파일 선택은 앱에서만 가능합니다.'); return; }
            try {
                const name = await window.smartboardHost.pickAlarmMp3();
                if (name) document.getElementById('input-custom-mp3').value = name;
            } catch (e) { console.error(e); alert('소리 파일을 가져오지 못했습니다: ' + e); }
        }
        function clearCustomMp3() { document.getElementById('input-custom-mp3').value = ''; }
        /** 팅커벨·아이스크림 같은 사이트를 앱 자체 창(최대화)으로 엶 */
        function openExternalSite(key) {
            if (window.smartboardHost && window.smartboardHost.openSite) window.smartboardHost.openSite(key);
            else alert('앱에서만 열 수 있습니다.');
        }
        function toggleMp3Input() { const val = document.getElementById('setting-alarm-melody').value; const container = document.getElementById('mp3-input-container'); if(val == '4') container.classList.remove('hidden'); else container.classList.add('hidden'); }
        
        function openAlarmSettingsModal() { 
            document.getElementById('toggle-alarm-popup').checked = isAlarmPopupEnabled; 
            document.getElementById('setting-start-alarm-offset').value = startAlarmOffset; 
            document.getElementById('setting-end-alarm-offset').value = endAlarmOffset; 
            document.getElementById('setting-alarm-melody').value = alarmMelody; 
            document.getElementById('input-alarm-duration').value = alarmDurationSec; 
            document.getElementById('input-custom-mp3').value = customMp3FileName; 
            toggleMp3Input(); 
            
            document.getElementById('input-start-message').value = startAlarmMessage; 
            document.getElementById('input-end-message').value = endAlarmMessage; 
            document.getElementById('input-closing-message').value = closingAlarmMessage; 
            document.getElementById('modal-alarm-settings').classList.add('active'); 
        }
        
        function saveAlarmSettings() { 
            isAlarmPopupEnabled = document.getElementById('toggle-alarm-popup').checked; 
            startAlarmOffset = Number(document.getElementById('setting-start-alarm-offset').value); 
            endAlarmOffset = Number(document.getElementById('setting-end-alarm-offset').value); 
            alarmMelody = parseInt(document.getElementById('setting-alarm-melody').value, 10) || 1; 
            alarmDurationSec = parseInt(document.getElementById('input-alarm-duration').value, 10) || 60; 
            customMp3FileName = document.getElementById('input-custom-mp3').value.trim(); 
            
            startAlarmMessage = document.getElementById('input-start-message').value || "수업이 시작되었습니다."; 
            endAlarmMessage = document.getElementById('input-end-message').value || "쉬는 시간입니다."; 
            closingAlarmMessage = document.getElementById('input-closing-message').value || "오늘 하루도 수고하셨습니다. 하교 시간입니다."; 
            
            storage.setItem('smartBoardAlarmPopupEnabled', isAlarmPopupEnabled); 
            storage.setItem('smartBoardStartOffset', startAlarmOffset); 
            storage.setItem('smartBoardEndOffset', endAlarmOffset); 
            storage.setItem('smartBoardAlarmMelody', alarmMelody);
            storage.setItem('smartBoardAlarmDuration', alarmDurationSec); // 2.8.2: 예전엔 저장하지 않아 다시 켜면 60초로 돌아갔음 
            storage.setItem('smartBoardCustomMp3', customMp3FileName); 
            storage.setItem('smartBoardStartMsg', startAlarmMessage); 
            storage.setItem('smartBoardEndMsg', endAlarmMessage); 
            storage.setItem('smartBoardClosingMsg', closingAlarmMessage); 
            
            closeModal('modal-alarm-settings'); 
            renderTimetable(); 
            stopAudio(); 
        }

        function toggleAllReset(el) { const chk = el.checked; ['reset-board', 'reset-note', 'reset-table', 'reset-alarm'].forEach(id => document.getElementById(id).checked = chk); }
        
        function executeReset() { 
            if(document.getElementById('reset-board').checked) { 
                storage.removeItem('smartBoardCurrentNotepad'); 
                storage.removeItem('smartBoardCurrentNotice'); // 2.8.2: 알림장도 (예전엔 남아 있다가 다시 나타났음)
                storage.removeItem('smartBoardSavedData'); 
                storage.removeItem('smartBoardNotepadBg');
                storage.removeItem('smartBoardNotepadBg_board');
                storage.removeItem('smartBoardNotepadBg_notice');
                boardEditor.clear(); 
                changeBoardBg('inherit');
                const sel = document.getElementById('board-bg-select');
                if(sel) sel.value = 'inherit';
            } 
            if(document.getElementById('reset-note').checked) { 
                storage.removeItem('smartBoardDraftPopupNote'); 
                storage.removeItem('smartBoardPopupNoteVisible');
                storage.removeItem('sb.widget.memo'); // 3.1.0: 첫 화면 메모 위젯도
                document.getElementById('popup-note-textarea').value=''; 
            } 
            if(document.getElementById('reset-table').checked) { 
                ['smartBoardLunchPos', 'smartBoardTimeSlots', 'smartBoardSchedule', 'smartBoardDailyOverride'].forEach(k=>storage.removeItem(k)); 
            } 
            if(document.getElementById('reset-alarm').checked) { 
                ['smartBoardStartOffset','smartBoardEndOffset','smartBoardStartMsg','smartBoardEndMsg','smartBoardClosingMsg','smartBoardAlarmMelody','smartBoardCustomAlarmEnabled','smartBoardMutedPeriods','smartBoardVolume', 'smartBoardAlarmPopupEnabled', 'smartBoardLeaveWorkEnabled', 'smartBoardLeaveWorkTime', 'smartBoardLeaveWorkPopupEnabled', 'smartBoardLeaveWorkPopupDuration'].forEach(k=>storage.removeItem(k)); 
            } 
 
            // 2.8.2: 명렬표·학교 등 목록에 없는 항목은 네 항목을 모두 체크했을 때만 (예전엔 '전체선택' 뒤 하나를 풀어도 지워졌음)
            const allChecked = ['reset-board', 'reset-note', 'reset-table', 'reset-alarm'].every(id => document.getElementById(id).checked);
            if(document.getElementById('reset-all').checked && allChecked) { 
                storage.removeItem('smartBoardSchool'); 
                storage.removeItem('smartBoardStudentNames'); 
                storage.removeItem('smartBoardTimerVisible');
            } 
            alert('선택한 항목이 초기화되었습니다.'); 
            // 파일 저장이 끝난 뒤에 다시 시작 (디바운스 중 새로고침하면 초기화가 안 됨)
            storage.flushAll().then(() => window.location.reload()); 
        }

        function togglePopupNote() { const n = document.getElementById('floating-popup-note'); if(n.classList.contains('hidden')) { n.classList.remove('hidden'); n.classList.add('flex'); storage.setItem('smartBoardPopupNoteVisible', 'true'); } else { n.classList.add('hidden'); n.classList.remove('flex'); storage.setItem('smartBoardPopupNoteVisible', 'false'); } }
        function toggleTimerPopup() { const t = document.getElementById('floating-timer'); if(t.classList.contains('hidden')) { t.classList.remove('hidden'); t.classList.add('flex'); storage.setItem('smartBoardTimerVisible', 'true'); } else { t.classList.add('hidden'); t.classList.remove('flex'); storage.setItem('smartBoardTimerVisible', 'false'); } }
        
        function savePopupNoteToList() { 
            const t = document.getElementById('popup-note-textarea').value.trim(); 
            if(!t) { document.getElementById('modal-alert-empty').classList.add('active'); return; } 
            currentSaveTarget = 'popupnote';
            openSaveModal('[팝업노트]');
        }
        
        function showVersionInfo() { document.getElementById('modal-version').classList.add('active'); if (window.renderVersionModal) window.renderVersionModal().then(() => refreshIcons()); }
        
        function toggleAlwaysOnTop() {
            isAlwaysOnTop = !isAlwaysOnTop;
            const btn = document.getElementById('btn-always-on-top');
            // 3.0.0: 빠른 설정의 '항상 위' 칸 (켜짐·꺼짐 표시는 aria-pressed)
            if (btn) btn.setAttribute('aria-pressed', String(isAlwaysOnTop));
            const st = document.getElementById('qs-pin-state'); if (st) st.textContent = isAlwaysOnTop ? '켜짐' : '꺼짐';
            document.body.classList.toggle('sb-pinned', isAlwaysOnTop);
            // main.ts가 window.smartboardHost에 Tauri 창 API를 노출함
            const host = window.smartboardHost;
            if (host && host.setAlwaysOnTop) {
                host.setAlwaysOnTop(isAlwaysOnTop).catch((e) => console.error('항상 위 설정 실패:', e));
            } else {
                console.warn('smartboardHost가 없어 항상 위 설정을 건너뜁니다.');
            }
        }

        function toggleFullscreen() { let e = document.documentElement; if (!document.fullscreenElement) { if (e.requestFullscreen) e.requestFullscreen().catch(()=>{}); else if (e.webkitRequestFullscreen) e.webkitRequestFullscreen(); } else { if (document.exitFullscreen) document.exitFullscreen().catch(()=>{}); } }
        function applyLunchPosition() { let p = 1; for(let i=0; i<7; i++) { if(i === lunchPos) timeSlots[i].name = '점심'; else { timeSlots[i].name = `${p}교시`; p++; } } }
        // 2.8.1: 점심 순서를 고르면 설정 창의 교시 이름만 미리 바꿈. 예전엔 입력 중이던 시간표·시간 칸이 저장된 값으로 되돌아가고,
        // 저장하지 않고 닫아도 오늘 시간표·종에는 바로 적용돼 버렸음. 실제 적용은 '저장 및 닫기'(saveMainSettings)
        function handleLunchPosChange(val) {
            const keep = {};
            document.querySelectorAll('#settings-schedule-grid input, #settings-time-list input').forEach(i => { if (i.id) keep[i.id] = i.value; });
            const prev = lunchPos;
            lunchPos = parseInt(val); applyLunchPosition(); renderSettingsInputs();
            lunchPos = prev; applyLunchPosition();
            Object.entries(keep).forEach(([id, v]) => { const i = document.getElementById(id); if (i) i.value = v; });
        }
        function initClock() {
            // 창이 가려지면 웹뷰의 setInterval 이 느려지므로 Rust 가 보내는 1초 tick 을 씀 (브라우저에서는 setInterval)
            if (window.smartboardHost && window.smartboardHost.onTick) window.smartboardHost.onTick(updateClock);
            else setInterval(updateClock, 1000);
            updateClock();
        }
        
        function updateClock() { 
            const now = new Date(); 
            // 3.0.0: '오전/오후'는 작게 (큰 시계 카드에 들어가게)
            const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: !use24HourClock });
            const timeEl = document.getElementById('current-time-text');
            if (timeEl && timeEl.dataset.t !== timeStr) {
                timeEl.dataset.t = timeStr;
                const mer = timeStr.match(/^(오전|오후)\s*(.*)$/);
                if (mer) timeEl.innerHTML = `<span class="sb-meridiem">${mer[1]}</span>${mer[2]}`; else timeEl.textContent = timeStr;
            }
            const days = ['일', '월', '화', '수', '목', '금', '토']; 
            document.getElementById('current-date-text').innerText = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 (${days[now.getDay()]}요일)`; 
            updateTimetableHighlight(now); 
            // tick 이 1분 넘게 끊겼다면(절전·백그라운드) 그 사이의 분을 순서대로 확인해 놓친 알람을 울림 (최대 10분)
            // (2.8.1: 기준을 90초 → 60초로. 60~90초 끊기면 그 사이의 분 하나를 건너뛰어 종이 안 울릴 수 있었음. 같은 분이 두 번 울리지는 않음)
            if (lastTickTime && now - lastTickTime > 60000 && now - lastTickTime < 10 * 60000) {
                for (let t = new Date(lastTickTime.getTime() + 60000); t < now; t = new Date(t.getTime() + 60000)) checkAlarms(t);
            }
            // 날짜가 바뀌면(켜 둔 채 자정을 넘기거나 절전에서 깨어남) 오늘 시간표로 다시 그림.
            // 예전엔 시작할 때만 그려서 화요일 아침에도 월요일 과목이 보였음
            const dayKey = now.toDateString();
            if (lastClockDay !== null && lastClockDay !== dayKey) onDayChanged(now);
            lastClockDay = dayKey;
            checkAlarms(now); 
            lastTickTime = now;
            tickTimer();
        }

        function onDayChanged(now) {
            try { renderTimetable(); } catch(e) { console.error('시간표 갱신 실패:', e); }
            try { autoArchiveNotice(now); } catch(e) { console.error('알림장 자동 보관 실패:', e); }
            if (window.schoolCalendar) window.schoolCalendar.refreshToday().then(() => { try { renderTimetable(); } catch(e) {} });
        }

        function setupControls() { const vs = document.getElementById('volume-slider'); const vv = document.getElementById('volume-val'); if(vs && vv) { vs.value = globalVolume; vv.innerText = Math.round(globalVolume * 100) + '%'; vs.addEventListener('input', (e) => { globalVolume = parseFloat(e.target.value); vv.innerText = Math.round(globalVolume * 100) + '%'; storage.setItem('smartBoardVolume', globalVolume); }); } }
        function openLunchModal() {
            document.getElementById('modal-lunch').classList.add('active');
            document.getElementById('allergy-panel')?.classList.add('hidden');
            if (window.lunch.hasSchool()) { document.getElementById('school-selector-panel').classList.add('hidden'); fetchLunchData(); }
            else { document.getElementById('school-selector-panel').classList.remove('hidden'); window.lunch.fillNeisKey(); }
        }
        function toggleSchoolSelector() { const p = document.getElementById('school-selector-panel'); p.classList.toggle('hidden'); if (!p.classList.contains('hidden')) { document.getElementById('allergy-panel')?.classList.add('hidden'); window.lunch.fillNeisKey(); document.getElementById('school-search-input').focus(); } }
        
        async function searchSchool() { return window.lunch.search(); }

        async function fetchLunchData() { return window.lunch.fetch(); }
        
        function changeBoardFontFamily(f) {
            if (boardEditor.hasSelection()) {
                boardEditor.setFontFamily(f);           // 선택한 글자에만
            } else {
                const ed = document.getElementById('notepad-editor');
                if (ed) ed.style.fontFamily = f;         // 판서 전체의 기본 글꼴 (개별 지정된 글자는 유지)
                currentBoardFont = f;
                storage.setItem('smartBoardFont', f);
                boardEditor.focus();
            }
        }

        function changeSelectedTextSize(editorId, delta, isAbsolute = false) {
            if (editorId === 'popup-note-textarea') {
                if (isAbsolute) popupNoteFontSize = delta; else popupNoteFontSize += delta;
                if (popupNoteFontSize < 10) popupNoteFontSize = 10;
                if (popupNoteFontSize > 100) popupNoteFontSize = 100;
                storage.setItem('smartBoardPopupNoteFontSize', popupNoteFontSize);
                applyPopupNoteStyles();
                return;
            }
            const editor = document.getElementById('notepad-editor');
            if (!editor) return;
            if (boardEditor.hasSelection()) {
                if (isAbsolute) boardEditor.setFontSize(delta);
                else boardEditor.adjustSelectionFontSize(delta, currentBoardFontSize);
                return;
            }
            if (isAbsolute) currentBoardFontSize = delta; else currentBoardFontSize += delta;
            if (currentBoardFontSize < 10) currentBoardFontSize = 10;
            if (currentBoardFontSize > 150) currentBoardFontSize = 150;
            editor.style.fontSize = currentBoardFontSize + 'px';
            const inp = document.getElementById('board-font-size-input');
            if (inp) inp.value = currentBoardFontSize;
            storage.setItem('smartBoardFontSize', currentBoardFontSize);
            boardEditor.focus();
        }

        function adjustBoardFontSize(d) { changeSelectedTextSize('notepad-editor', d, false); }
        function setBoardFontSize(v) { let n = parseInt(v, 10); if (!isNaN(n) && n >= 10 && n <= 150) { changeSelectedTextSize('notepad-editor', n, true); } }
        function applyBoardFontSize() { const inp = document.getElementById('board-font-size-input'); if(inp) inp.value = currentBoardFontSize; storage.setItem('smartBoardFontSize', currentBoardFontSize); }
        
        function promptClearNotepad() { document.getElementById('modal-confirm-clear').classList.add('active'); }

        function executeClearNotepad() {
            boardEditor.clear();
            storage.setItem(currentEditorKey(), '');
            closeModal('modal-confirm-clear');
        }
        
     function saveBoard() { 
    if (boardEditor.isEmpty()) { document.getElementById('modal-alert-empty').classList.add('active'); return; } 
    currentSaveTarget = 'board';
    
    // 현재 모드에 따라 [판서] 또는 [알림] 머리말을 자동으로 선택합니다.
    const prefix = (typeof currentBoardMode !== 'undefined' && currentBoardMode === 'notice') ? '[알림]' : '[판서]';
    openSaveModal(prefix);
}

        function openSaveModal(prefix) {
            const now = new Date(); 
            const ds = `${now.getFullYear()}.${now.getMonth()+1}.${now.getDate()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`; 
            const titleInput = document.getElementById('input-save-board-title');
            if(titleInput) titleInput.value = `${prefix} ${ds}`;
            document.getElementById('modal-save-board').classList.add('active');
            setTimeout(() => { if(titleInput) { titleInput.focus(); titleInput.select(); } }, 100);
        }

        function confirmSaveBoard() {
            const titleInput = document.getElementById('input-save-board-title');
            const t = titleInput ? titleInput.value.trim() : '';
            if(!t) { alert('제목을 입력해주세요.'); if(titleInput) titleInput.focus(); return; }
            const now = new Date(); const ds = `${now.getFullYear()}.${now.getMonth()+1}.${now.getDate()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`; 
            let c = '';
            if (currentSaveTarget === 'board') { c = boardEditor.getHTML(); } 
            // 2.8.1: 팝업노트 글은 HTML 이 아니므로 escape 후 줄바꿈만 <br> (예전엔 '<3단원>' 같은 글이 사라지거나 태그로 해석됐음)
            else if (currentSaveTarget === 'popupnote') { c = escHtml(document.getElementById('popup-note-textarea').value.trim()).replace(/\n/g, '<br>'); }
            savedBoards.unshift({ id: Date.now(), title: t, date: ds, content: c }); 
            storage.setItem('smartBoardSavedData', JSON.stringify(savedBoards)); 
            closeModal('modal-save-board');
            openSavedBoards();
        }

        function openSavedBoards() { renderSavedBoards(); const t = document.getElementById('toggle-notice-autoarchive'); if (t) t.checked = isNoticeAutoArchiveOn(); document.getElementById('modal-saved-list').classList.add('active'); }
        // 2.8.2: 백업 복원으로 다른 사람이 만든 기록이 들어올 수 있으므로 (1) 목록의 id 를 HTML 안에 넣지 않고
        // (2) 기록 보기는 위험한 태그·on* 속성·javascript: 주소를 지운 뒤 보여 줌. 예전엔 조작된 기록을 열면 스크립트가 실행될 수 있었음
        function renderSavedBoards() {
            const c = document.getElementById('saved-boards-container'); c.innerHTML = '';
            if(savedBoards.length === 0) { c.innerHTML = '<div class="text-center text-slate-500 py-10 font-bold bg-white rounded-xl">저장된 기록이 없습니다.</div>'; return; }
            savedBoards.forEach(b => {
                const el = document.createElement('div');
                el.className = 'flex items-center justify-between p-5 bg-white border border-slate-200 rounded-2xl hover:border-indigo-300 hover:shadow-md transition cursor-pointer group';
                el.innerHTML = `<div class="flex-1 overflow-hidden"><h4 class="font-bold text-slate-800 text-xl flex items-center mb-1 truncate"><i data-lucide="file-text" class="w-6 h-6 mr-2 text-indigo-500 shrink-0"></i>${escHtml(b.title)}</h4><span class="text-base text-slate-500 font-bold ml-8">${escHtml(b.date)}</span></div><button class="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition" title="삭제"><i data-lucide="trash-2" class="w-6 h-6"></i></button>`;
                el.firstElementChild.addEventListener('click', () => viewSavedBoard(b.id));
                el.querySelector('button').addEventListener('click', (ev) => deleteSavedBoard(b.id, ev));
                c.appendChild(el);
            });
            refreshIcons();
        }
        function sanitizeHtml(html) {
            const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
            doc.body.querySelectorAll('script,iframe,object,embed,base,link,meta,style,form,frame,frameset,svg,math,template').forEach(n => n.remove());
            doc.body.querySelectorAll('*').forEach(n => {
                for (const at of [...n.attributes]) {
                    const name = at.name.toLowerCase(), val = at.value.replace(/[\s\u0000-\u001f]+/g, '').toLowerCase();
                    if (name.startsWith('on') || ((name === 'href' || name === 'src' || name === 'xlink:href' || name === 'action' || name === 'formaction') && (val.startsWith('javascript:') || val.startsWith('vbscript:')))) n.removeAttribute(at.name);
                }
            });
            return doc.body.innerHTML;
        }
        function viewSavedBoard(id) { const b = savedBoards.find(x => x.id === id); if(!b) return; viewingBoardId = id; document.getElementById('viewer-date').innerText = b.date; const vc = document.getElementById('viewer-content'); vc.innerHTML = sanitizeHtml(b.content); if (window.boardImages) window.boardImages.resolveImagesIn(vc); document.getElementById('modal-board-viewer').classList.add('active'); }
        // ---------- 2.7.0: 보관한 기록 다시 불러와 고치기 ----------
        // [판서] 기록은 판서로, [알림] 기록은 알림으로, 그 밖(팝업노트 등)은 지금 화면으로 불러옴.
        // 지금 내용이 있으면 확인을 받고, 덮어쓰기 전에 지금 내용을 목록에 자동 보관함 (잃어버리지 않게)
        let viewingBoardId = null;
        function loadViewedBoard() {
            const b = savedBoards.find(x => x.id === viewingBoardId); if (!b) return;
            const target = b.title.startsWith('[알림]') ? 'notice' : (b.title.startsWith('[판서]') ? 'board' : currentBoardMode);
            const key = target === 'board' ? 'smartBoardCurrentNotepad' : 'smartBoardCurrentNotice';
            const label = target === 'board' ? '판서' : '알림';
            const cur = target === currentBoardMode ? boardEditor.getHTML() : (storage.getItem(key) || '');
            if (hasContent(cur) && cur !== b.content) {
                if (!confirm(`지금 ${label} 내용을 이 기록으로 바꿀까요?\n지금 내용은 기록 목록에 자동으로 보관됩니다.`)) return;
                savedBoards.unshift({ id: Date.now(), title: `[${label}] ${nowStamp()} (불러오기 전 자동 보관)`, date: nowStamp(), content: cur });
                storage.setItem('smartBoardSavedData', JSON.stringify(savedBoards));
            }
            storage.setItem(key, b.content);
            closeModal('modal-board-viewer'); closeModal('modal-saved-list');
            if (target === currentBoardMode) { boardEditor.setHTML(b.content); boardEditor.focusNoScroll(); }
            else toggleBoardMode(); // 전환하면서 방금 넣은 내용을 읽어 옴
        }

        // ---------- 2.7.0: 알림장 날짜별 자동 보관 ----------
        // 날짜가 바뀌면(앱을 켤 때, 또는 켜 둔 채 자정을 넘길 때) 전날 알림장을 기록 목록에 넣음.
        // 알림장 내용은 그대로 두어 이어서 고쳐 쓸 수 있고, 바뀌지 않은 내용은 다시 보관하지 않음.
        // 끄기: 기록 목록 창의 '알림장 날짜별 자동 보관' (키 smartBoardNoticeAutoArchive)
        function ymdKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
        function nowStamp(d = new Date()) { return `${d.getFullYear()}.${d.getMonth()+1}.${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
        function hasContent(html) { return !!html && (html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() !== '' || /<(img|table)\b/i.test(html)); }
        function textHash(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16) + ':' + str.length; }
        function isNoticeAutoArchiveOn() { return storage.getItem('smartBoardNoticeAutoArchive') !== 'false'; }
        function setNoticeAutoArchive(on) { storage.setItem('smartBoardNoticeAutoArchive', on ? 'true' : 'false'); }
        function autoArchiveNotice(now = new Date()) {
            const today = ymdKey(now);
            const lastDay = storage.getItem('smartBoardNoticeDay');
            if (lastDay === today) return;
            storage.setItem('smartBoardNoticeDay', today);
            if (!lastDay || !isNoticeAutoArchiveOn()) return;
            const html = currentBoardMode === 'notice' ? boardEditor.getHTML() : (storage.getItem('smartBoardCurrentNotice') || '');
            if (!hasContent(html)) return;
            const h = textHash(html);
            if (h === storage.getItem('smartBoardNoticeArchivedHash')) return;
            const [y, m, d] = lastDay.split('-').map(Number);
            savedBoards.unshift({ id: Date.now(), title: `[알림] ${y}.${m}.${d} (자동 보관)`, date: nowStamp(now), content: html });
            storage.setItem('smartBoardSavedData', JSON.stringify(savedBoards));
            storage.setItem('smartBoardNoticeArchivedHash', h);
        }

        function deleteSavedBoard(id, ev) { ev.stopPropagation(); if(confirm('이 기록을 정말 삭제하시겠습니까?')) { savedBoards = savedBoards.filter(b => b.id !== id); storage.setItem('smartBoardSavedData', JSON.stringify(savedBoards)); renderSavedBoards(); } }
        function applyToolVisibility() { const t = ['picker', 'timer', 'noise', 'attention', 'lunch', 'youtube', 'tinkerbell', 'iscream', 'popupnote', 'qr', 'activity']; t.forEach(id => { const el = document.getElementById(`btn-tool-${id}`); if(el) el.style.display = (toolVisibility[id] === false) ? 'none' : 'flex'; }); }
        
        function updateSubjectFast(idx, el) { 
            const todayStr = new Date().toLocaleDateString();
            if(dailyOverride.date !== todayStr) {
                dailyOverride = { date: todayStr, overrides: {} };
            }
            dailyOverride.overrides[idx] = el.value;
            storage.setItem('smartBoardDailyOverride', JSON.stringify(dailyOverride));
            el.className = `text-2xl font-bold px-2 py-1.5 rounded-xl border-2 shrink-0 w-32 text-center shadow-sm outline-none ${getSubjectColorClasses(el.value)} ml-1 slot-subject`; 
        }

        // 교시 이름·시간을 누르면 그 교시 종을 끄고 켬. 터치 칠판에서 스치기만 해도 매일 종이 꺼지던 문제 → 한 번 확인
        function ringBellsToday() { if (window.schoolCalendar) window.schoolCalendar.ringToday(); renderTimetable(); }
        function toggleMutePeriod(i) {
            const name = (timeSlots[i] && timeSlots[i].name) || `${i + 1}번째 시간`;
            const q = mutedPeriods[i] ? `${name} 종을 다시 켤까요?` : `${name} 종을 끌까요?\n끄면 매일 이 시간에 종이 울리지 않습니다. (다시 누르면 켤 수 있어요)`;
            if (!confirm(q)) return;
            mutedPeriods[i] = !mutedPeriods[i]; storage.setItem('smartBoardMutedPeriods', JSON.stringify(mutedPeriods)); renderTimetable();
        }
        function getSubjectColorClasses(s) { 
            if(!s) return 'bg-white text-slate-700 border-slate-200'; 
            if(s.includes('국어')) return 'bg-red-100 text-red-800 border-red-300'; 
            if(s.includes('수학')) return 'bg-blue-100 text-blue-800 border-blue-300'; 
            if(s.includes('사회')||s.includes('역사')) return 'bg-orange-100 text-orange-800 border-orange-300'; 
            if(s.includes('과학')) return 'bg-emerald-100 text-emerald-800 border-emerald-300'; 
            if(s.includes('영어')) return 'bg-purple-100 text-purple-800 border-purple-300'; 
            if(s.includes('체육')) return 'bg-yellow-100 text-yellow-800 border-yellow-400'; 
            if(s.includes('음악')) return 'bg-pink-100 text-pink-800 border-pink-300'; 
            if(s.includes('미술')) return 'bg-rose-100 text-rose-800 border-rose-300'; 
            if(s.includes('실과')) return 'bg-cyan-100 text-cyan-800 border-cyan-300'; 
            if(s.includes('도덕')) return 'bg-teal-100 text-teal-800 border-teal-300'; 
            if(s.includes('창체')||s.includes('자율')||s.includes('동아리')) return 'bg-indigo-100 text-indigo-800 border-indigo-300'; 
            if(s.includes('바생')||s.includes('바른')) return 'bg-amber-100 text-amber-800 border-amber-300'; 
            if(s.includes('슬생')||s.includes('슬기')) return 'bg-sky-100 text-sky-800 border-sky-300'; 
            if(s.includes('즐생')||s.includes('즐거운')) return 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300'; 
            if(s.includes('점심')) return 'bg-slate-200 text-slate-800 border-slate-400'; 
            return 'bg-white text-slate-700 border-slate-200'; 
        }
        
        function renderTimetable() { 
            const c = document.getElementById('timetable-container'); 
            c.innerHTML = ''; 
            const now = new Date();
            const d = now.getDay(); 
            
            const todayStr = now.toLocaleDateString();
            if(dailyOverride.date !== todayStr) { 
                dailyOverride = { date: todayStr, overrides: {} }; 
                storage.removeItem('smartBoardDailyOverride'); 
            }

            const baseSch = schedule[d] || []; 
            const s = [...baseSch];
            for (let idx in dailyOverride.overrides) { s[idx] = dailyOverride.overrides[idx]; }

            if(d === 0 || d === 6) { c.innerHTML = '<div class="flex h-full items-center justify-center text-slate-400 font-bold text-2xl">주말입니다!</div>'; return; } 
            // 2.7.0: 학사일정상 휴업일·공휴일이면 종이 울리지 않는다고 알림 (그날만 다시 켤 수 있음)
            const holidayName = window.schoolCalendar ? window.schoolCalendar.holidayOn(now) : null;
            if (holidayName) {
                const safe = holidayName.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
                c.innerHTML = `<div class="flex flex-col h-full items-center justify-center text-center gap-2 px-4"><i data-lucide="bell-off" class="w-10 h-10 text-rose-300"></i><span class="text-slate-500 font-bold text-2xl">오늘은 쉬는 날</span><span class="text-rose-500 font-bold text-xl">${safe}</span><span class="text-slate-400 font-bold text-sm">학사일정에 따라 종이 울리지 않습니다</span><button onclick="ringBellsToday()" class="mt-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm transition">오늘은 종 울리기</button></div>`;
                refreshIcons();
                return;
            }
            
            timeSlots.forEach((sl, i) => { 
                const m = mutedPeriods[i]; 
                const el = document.createElement('div'); 
                el.className = `flex items-center px-3 py-2 rounded-2xl border-2 border-slate-200 bg-slate-50 transition-all duration-300 timetable-slot flex-1 min-h-[48px]`; 
                el.dataset.start = sl.start; 
                el.dataset.end = sl.end; 
                el.innerHTML = `<div class="flex items-center flex-1 cursor-pointer hover:bg-slate-200/50 rounded-lg p-1" onclick="toggleMutePeriod(${i})"><div class="flex w-[5.5rem] shrink-0 items-center justify-center relative"><span class="text-2xl font-bold ${m?'text-slate-400':'text-slate-800'} slot-name">${sl.name}</span>${m?'<i data-lucide="bell-off" class="w-4 h-4 text-red-400 absolute -right-2"></i>':''}</div><span class="text-xl font-bold ${m?'text-slate-400 line-through':'text-slate-600'} flex-1 text-center whitespace-nowrap slot-time">${sl.start} - ${sl.end}</span></div><input type="text" value="${escHtml(s[i]||'')}" onchange="updateSubjectFast(${i}, this)" class="text-2xl font-bold px-2 py-1.5 rounded-xl border-2 shrink-0 w-32 text-center shadow-sm outline-none ${getSubjectColorClasses(s[i])} ml-1 slot-subject">`; 
                c.appendChild(el); 
            }); 
            updateTimetableHighlight(now); 
            refreshIcons(); 
        }

                function openWeather() { document.getElementById('modal-weather').classList.add('active'); if (!storage.getItem('smartBoardDataGoKrKey')) { document.getElementById('region-selector-panel').classList.remove('hidden'); window.weather.renderRegionPanel(); } }
        function toggleRegionSelector() { const p = document.getElementById('region-selector-panel'); p.classList.toggle('hidden'); if (!p.classList.contains('hidden')) window.weather.renderRegionPanel(); }
        /* searchWeatherRegion: 5단계에서 지역 선택(src/weather.ts)으로 대체 */
        async function fetchWeatherData() { return window.weather.refresh(); }
        /* parseWeatherCode: src/weather.ts 로 이동 */
        /* parseDust: src/weather.ts 로 이동 */
        /* updateWeatherUI: src/weather.ts 로 이동 */
        function openCalendar() { currentCalendarDate = new Date(); renderCalendar(); document.getElementById('modal-calendar').classList.add('active'); }
        // 2.7.0: 학사일정(휴업일·행사)을 함께 보여 주는 달력 (src/school-calendar.ts)
        function renderCalendar() { window.schoolCalendar.renderMonth(currentCalendarDate); }
        // 2.8.1: 1일 기준으로 이동 (예전엔 31일에 ▶ 를 누르면 2월을 건너뛰거나 ◀ 가 안 움직였음)
        function changeCalendarMonth(o) { currentCalendarDate = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + o, 1); renderCalendar(); }
        function resetCalendarToToday() { currentCalendarDate = new Date(); renderCalendar(); }

                                        
        // ⭐️ 가장 안전하고 단순한 방식의 TTS 출력
        /** 종소리·안내 음성이 나오는 중인지 (타이머·소음 경고가 이걸 끊지 않게) */
        function soundBusy() { return isAudioPlaying || ttsPending || !!(window.speechSynthesis && window.speechSynthesis.speaking); }
        function playTTS(text) { 
            if(!window.speechSynthesis || globalVolume === 0 || !text) return; 
            
            // 기존에 말하고 있던 것이 있다면 즉시 중단
            window.speechSynthesis.cancel(); 
            ttsPending = true;
            
            // 너무 빨리 호출하면 브라우저 엔진이 꼬이는 현상을 막기 위해 약간의 지연 시간을 줌
            setTimeout(() => {
                ttsPending = false;
                const utterance = new SpeechSynthesisUtterance(text); 
                utterance.lang = 'ko-KR'; 
                utterance.volume = Math.min(1.0, globalVolume * 2.0); 
                utterance.pitch = 1.2; 
                
                window.speechSynthesis.speak(utterance); 
            }, 300); // 0.3초 대기 후 재생
        }
        
        function initAudio() { 
            if(!audioCtx || audioCtx.state === 'closed') { 
                const AC = window.AudioContext || window.webkitAudioContext; 
                audioCtx = new AC(); 
            } 
            if(audioCtx.state === 'suspended') audioCtx.resume(); 
        }
        
        function playNote(freq, st, d, type='triangle') { 
            if(!audioCtx || !freq || isNaN(freq)) return; 
            try { 
                const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); 
                o.type = type; o.frequency.setValueAtTime(freq, st); 
                let v = globalVolume; 
                if(type === 'square') v = globalVolume * 0.05; 
                else if(type === 'triangle') v = globalVolume * 0.6; 
                else v = globalVolume; 
                g.gain.setValueAtTime(0, st); 
                g.gain.linearRampToValueAtTime(v, st + (d * 0.1)); 
                g.gain.exponentialRampToValueAtTime(Math.max(0.001, v*0.01), st + d); 
                o.connect(g); g.connect(audioCtx.destination); 
                o.start(st); o.stop(st + d); 
                currentOscillators.push(o); 
            } catch(e) { console.error(e); } 
        }

        // 2.8.1: 미리듣기는 지금 창에 보이는 파일로 (예전엔 저장된 파일·기본음이 나와 '새 파일이 안 된다'고 보였음)
        function previewMelody() {
            const sm = parseInt(document.getElementById('setting-alarm-melody').value);
            const prev = customMp3FileName;
            const inp = document.getElementById('input-custom-mp3');
            if (sm === 4 && inp) customMp3FileName = inp.value.trim();
            try { playAlarmMelody(sm, null, true); } finally { customMp3FileName = prev; }
        }

        function playAlarmMelody(type, ttsText, isPreview = false) { 
            if(globalVolume === 0) { if (ttsText && !isPreview) playTTS(ttsText); return 5; }
            stopAudio(); initAudio(); isAudioPlaying = true; 

            if (type === 4) {
                // 고른 파일이 없으면 기본음(public/alarm.mp3). 예전엔 경고창만 뜨고 아무 소리도 안 났음
                currentMp3Audio = new Audio(window.smartboardHost ? window.smartboardHost.getAlarmUrl(customMp3FileName) : (customMp3FileName || 'alarm.mp3'));
                currentMp3Audio.volume = globalVolume;
                currentMp3Audio.play().catch(e => {
                    console.error("MP3 재생 오류:", e);
                    alert("소리 파일을 재생할 수 없습니다. 환경설정에서 'MP3 찾기'로 다시 선택해 주세요.");
                });
                
                let timeoutMs = (alarmDurationSec || 60) * 1000;
                if(isPreview) timeoutMs = 15000; 
                
                chimeTimeout = setTimeout(() => {
                    if (currentMp3Audio) {
                        currentMp3Audio.pause();
                        currentMp3Audio.currentTime = 0;
                    }
                    isAudioPlaying = false;
                    if(ttsText && !isPreview) playTTS(ttsText); 
                }, timeoutMs);
                
                currentMp3Audio.onended = () => {
                    clearTimeout(chimeTimeout);
                    isAudioPlaying = false;
                    if(ttsText && !isPreview) playTTS(ttsText); 
                };
                
                return isPreview ? 15 : (alarmDurationSec || 60);
            }

            const f = { 'G2': 98, 'C3': 130.8, 'D3': 146.8, 'E3': 164.8, 'F3': 174.6, 'G3': 196, 'A3': 220, 'B3': 246.9, 'C4': 261.6, 'C#4': 277.1, 'D4': 293.6, 'Eb4': 311.1, 'E4': 329.6, 'F4': 349.2, 'F#4': 370, 'G4': 392, 'G#4': 415.3, 'A4': 440, 'Bb4': 466.1, 'B4': 493.8, 'C5': 523.2, 'C#5': 554.3, 'D5': 587.3, 'Eb5': 622.2, 'E5': 659.2, 'F5': 698.4, 'F#5': 740, 'G5': 784, 'G#5': 830.6, 'A5': 880, 'Bb5': 932.3, 'B5': 987.7, 'C6': 1046.5 }; 
            let t = audioCtx.currentTime + 0.1; let dur = 0;
            
            let targetDur = isPreview ? 15 : (alarmDurationSec || 60);

            if (type === 1) { 
                let sp = 0.35; let mel = ['G4','G4','A4','A4','G4','G4','E4','-','G4','G4','E4','E4','D4','-','-','-','G4','G4','A4','A4','G4','G4','E4','-','G4','E4','D4','E4','C4','-','-','-'];
                let cho = ['C3','C3','F3','F3','C3','C3','C3','-','G3','G3','C3','C3','G3','-','-','-','C3','C3','F3','F3','C3','C3','C3','-','G3','G3','G3','G3','C3','-','-','-'];
                let oneLoopDur = mel.length * sp;
                let lp = Math.ceil(targetDur / oneLoopDur); 
                for(let l=0; l<lp; l++) { for(let i=0; i<mel.length; i++) { 
                    if (t - audioCtx.currentTime > targetDur) break; 
                    if (mel[i] !== '-') playNote(f[mel[i]], t, sp * 0.8, 'sine'); 
                    if (cho[i] !== '-') playNote(f[cho[i]], t, sp * 1.5, 'triangle'); 
                    if (l >= 2 && mel[i] !== '-') { let nn = mel[i].slice(0, -1); let oc = parseInt(mel[i].slice(-1)); let hn = nn + (oc + 1); if (f[hn]) playNote(f[hn], t, sp * 0.8, 'sine'); } 
                    t += sp; 
                } }
                dur = targetDur;
            } else if (type === 2) { 
                let sp = 0.25; let pat = [['C4','E4','G4','C5'], ['G3','B3','D4','G4'], ['A3','C4','E4','A4'], ['E3','G3','B3','E4'], ['F3','A3','C4','F4'], ['C3','E3','G3','C4'], ['F3','A3','C4','F4'], ['G3','B3','D4','G4']];
                let oneLoopDur = pat.length * 4 * sp;
                let lp = Math.ceil(targetDur / oneLoopDur);
                for(let l=0; l<lp; l++) { pat.forEach((ch) => { 
                    if (t - audioCtx.currentTime > targetDur) return;
                    playNote(f[ch[0]]/2, t, sp * 4, 'triangle'); 
                    ch.forEach((n, i) => { playNote(f[n], t + (i * sp), sp * 1.5, 'sine'); if (l >= 2 && i === 0 && f[ch[3]]) playNote(f[ch[3]], t, sp * 2, 'sine'); }); 
                    t += sp * 4; 
                }); }
                dur = targetDur;
            } else { 
                let sp = 0.45; let mel = ['G4','-','G4','-','C5','-','B4','C5','D5','-','C5','D5','E5','-','D5','-','C5','-','B4','-','A4','-','B4','-','C5','-','-','-','-','-','-','-'];
                let cho = ['E4','-','E4','-','E4','-','D4','E4','F4','-','E4','F4','G4','-','F4','-','E4','-','D4','-','C4','-','D4','-','E4','-','-','-','-','-','-','-'];
                let oneLoopDur = mel.length * sp;
                let lp = Math.ceil(targetDur / oneLoopDur); 
                for(let l=0; l<lp; l++) { for(let i=0; i<mel.length; i++) { 
                    if (t - audioCtx.currentTime > targetDur) break;
                    if (mel[i] !== '-') playNote(f[mel[i]], t, sp * 1.2, 'sine'); 
                    if (cho[i] !== '-') playNote(f[cho[i]], t, sp * 1.2, 'triangle'); 
                    if (i % 2 === 0) playNote(f['C3'], t, sp * 0.5, 'square'); else playNote(f['G2'], t, sp * 0.5, 'square'); 
                    t += sp; 
                } }
                dur = targetDur;
            }
            
            const delayMs = Math.ceil(dur * 1000);
            chimeTimeout = setTimeout(() => { 
                currentOscillators.forEach(o => { try{o.stop();}catch(e){} });
                currentOscillators = [];
                isAudioPlaying = false; 
                if(ttsText && !isPreview) {
                    playTTS(ttsText); 
                }
            }, delayMs); 
            
            return dur;
        }

        function playAttentionBell() { 
            if(globalVolume === 0) return; 
            stopAudio(); initAudio(); 
            if(!audioCtx) return;
            try {
                const now = audioCtx.currentTime; 
                const freqs = [880, 1046.50, 1318.51]; 
                freqs.forEach((f, i) => {
                    const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); 
                    o.type = 'square'; 
                    o.frequency.setValueAtTime(f, now + (i * 0.15)); 
                    let v = Math.min(1, Math.max(0.5, globalVolume * 2)); 
                    g.gain.setValueAtTime(0, now + (i * 0.15)); 
                    g.gain.linearRampToValueAtTime(v, now + (i * 0.15) + 0.02); 
                    g.gain.exponentialRampToValueAtTime(0.01, now + (i * 0.15) + 0.2); 
                    o.connect(g); g.connect(audioCtx.destination); 
                    o.start(now + (i * 0.15)); 
                    o.stop(now + (i * 0.15) + 0.25); 
                    currentOscillators.push(o); 
                });
            } catch(e) { console.error(e); }
        }

                                function openTimeSettingsModal() { 
            document.getElementById('toggle-24hour-format').checked = use24HourClock; 
            document.getElementById('toggle-custom-alarm').checked = customAlarmEnabled; 
            document.getElementById('input-custom-alarm-freq').value = customAlarmFreq; 
            document.getElementById('input-custom-alarm-time').value = customAlarmTime; 
            document.getElementById('input-custom-alarm-msg').value = customAlarmMessage; 
            document.getElementById('modal-time-settings').classList.add('active'); 
        }

        function saveTimeSettings() { 
            use24HourClock = document.getElementById('toggle-24hour-format').checked; 
            customAlarmEnabled = document.getElementById('toggle-custom-alarm').checked; 
            customAlarmFreq = document.getElementById('input-custom-alarm-freq').value; 
            customAlarmTime = document.getElementById('input-custom-alarm-time').value; 
            customAlarmMessage = document.getElementById('input-custom-alarm-msg').value || '지정된 시간입니다.'; 
            storage.setItem('smartBoardUse24HourClock', JSON.stringify(use24HourClock)); 
            storage.setItem('smartBoardCustomAlarmEnabled', JSON.stringify(customAlarmEnabled)); 
            storage.setItem('smartBoardCustomAlarmFreq', customAlarmFreq); 
            storage.setItem('smartBoardCustomAlarmTime', customAlarmTime); 
            storage.setItem('smartBoardCustomAlarmMsg', customAlarmMessage); 
            updateClock(); 
            closeModal('modal-time-settings'); 
        }

        function renderSettingsInputs() { 
            const g = document.getElementById('settings-schedule-grid'); 
            g.innerHTML = '<div class="font-bold text-center text-slate-500 pb-2 border-b">교시</div>'; 
            ['월','화','수','목','금'].forEach(d => g.innerHTML += `<div class="font-bold text-center text-slate-500 pb-2 border-b">${d}</div>`); 
            timeSlots.forEach((slot, ri) => { 
                g.innerHTML += `<div class="font-bold text-center flex items-center justify-center bg-slate-50 rounded-lg text-sm">${slot.name}</div>`; 
                [1,2,3,4,5].forEach(di => { 
                    g.innerHTML += `<input type="text" id="sched-${di}-${ri}" value="${escHtml(schedule[di] && schedule[di][ri] ? schedule[di][ri] : '')}" class="w-full text-center p-2 border border-slate-300 rounded-lg font-bold">`; 
                }); 
            }); 
            const l = document.getElementById('settings-time-list'); 
            l.innerHTML = ''; 
            timeSlots.forEach((slot, i) => { 
                l.innerHTML += `<div class="flex items-center justify-between bg-slate-50 p-2 rounded-xl border border-slate-100 gap-1"><span class="font-bold whitespace-nowrap text-sm w-12">${slot.name}</span><input type="time" id="time-start-${i}" value="${slot.start}" class="p-1.5 border rounded-lg font-bold flex-1 w-full text-center"><span class="font-bold">-</span><input type="time" id="time-end-${i}" value="${slot.end}" class="p-1.5 border rounded-lg font-bold flex-1 w-full text-center"></div>`; 
            }); 
        }

        function saveMainSettings() { 
            lunchPos = parseInt(document.getElementById('setting-lunch-pos').value); 
            storage.setItem('smartBoardLunchPos', lunchPos); 
            applyLunchPosition(); 
            
            closeOnOutsideClick = document.getElementById('toggle-close-outside').checked; 
            storage.setItem('smartBoardCloseOutside', JSON.stringify(closeOnOutsideClick)); 
            
            isLeaveWorkEnabled = document.getElementById('toggle-leave-work').checked; 
            storage.setItem('smartBoardLeaveWorkEnabled', isLeaveWorkEnabled); 
            leaveWorkTime = document.getElementById('input-leave-work-time').value; 
            storage.setItem('smartBoardLeaveWorkTime', leaveWorkTime); 
            leaveWorkPopupEnabled = document.getElementById('toggle-leave-work-popup').checked; 
            storage.setItem('smartBoardLeaveWorkPopupEnabled', JSON.stringify(leaveWorkPopupEnabled)); 
            leaveWorkPopupDuration = document.getElementById('select-leave-work-duration').value; 
            storage.setItem('smartBoardLeaveWorkPopupDuration', leaveWorkPopupDuration); 
            
            // 2.8.2: 기본 시간표·시간이 실제로 바뀐 경우에만 '오늘만 바꾼 과목'을 지움 (예전엔 다른 설정만 저장해도 지워졌음)
            const timetableBefore = JSON.stringify([schedule, timeSlots]);
            for(let di=1; di<=5; di++){ 
                if(!schedule[di]) schedule[di] = [];
                timeSlots.forEach((_, ri) => {
                    const el = document.getElementById(`sched-${di}-${ri}`);
                    if(el) schedule[di][ri] = el.value;
                }); 
            } 
 
            storage.setItem('smartBoardSchedule', JSON.stringify(schedule)); 

            timeSlots.forEach((slot, i) => { 
                const sEl = document.getElementById(`time-start-${i}`);
                if(sEl) slot.start = sEl.value; 
                const eEl = document.getElementById(`time-end-${i}`);
                if(eEl) slot.end = eEl.value; 
            }); 
            storage.setItem('smartBoardTimeSlots', JSON.stringify(timeSlots)); 
            if (JSON.stringify([schedule, timeSlots]) !== timetableBefore) {
                dailyOverride = { date: new Date().toLocaleDateString(), overrides: {} };
                storage.removeItem('smartBoardDailyOverride');
            }

            if (window.updater) window.updater.saveSettings();
            closeModal('modal-settings'); 
            renderTimetable(); 
        }

        function changeTheme(t) { document.body.setAttribute('data-theme', t); storage.setItem('smartBoardTheme', t); }
        function changeBgColor(c) { document.body.style.backgroundColor = (c === 'skin' ? '' : c); storage.setItem('smartBoardBgColor', c); } // 'skin' = 디자인 테마 기본값
        function changePanelColor(c) { if (c === 'skin') document.documentElement.style.removeProperty('--panel-bg'); else document.documentElement.style.setProperty('--panel-bg', c); storage.setItem('smartBoardPanelColor', c); }

        function applyTimetablePos() {
            const container = document.getElementById('main-layout-container');
            if (container) {
                if (timetablePos === 'right') { container.classList.add('flex-row-reverse'); } 
                else { container.classList.remove('flex-row-reverse'); }
            }
        }

        function applyToolPos() {
            const container = document.getElementById('right-layout-container');
            if (container) {
                // 3.0.0: #right-layout-container = [본문, Dock]. 'top' 이면 Dock 을 위로 (예전 '도구 판넬 위' 와 같은 뜻)
                container.classList.toggle('sb-dock-top', toolPanelPos === 'top');
                container.classList.remove('flex-col-reverse');
            }
        }

        function setTempTimetablePos(pos) {
            tempTimetablePos = pos;
            const btnLeft = document.getElementById('pos-btn-left');
            const btnRight = document.getElementById('pos-btn-right');
            if (btnLeft && btnRight) {
                if (pos === 'left') {
                    btnLeft.className = 'px-4 py-2 rounded-lg font-bold text-base transition bg-white shadow-sm text-brand-600';
                    btnRight.className = 'px-4 py-2 rounded-lg font-bold text-base transition text-slate-500 hover:text-slate-700 hover:bg-slate-200';
                } else {
                    btnLeft.className = 'px-4 py-2 rounded-lg font-bold text-base transition text-slate-500 hover:text-slate-700 hover:bg-slate-200';
                    btnRight.className = 'px-4 py-2 rounded-lg font-bold text-base transition bg-white shadow-sm text-brand-600';
                }
            }
        }

        function setTempToolPos(pos) {
            tempToolPanelPos = pos;
            const btnTop = document.getElementById('tool-pos-btn-top');
            const btnBottom = document.getElementById('tool-pos-btn-bottom');
            if (btnTop && btnBottom) {
                if (pos === 'top') {
                    btnTop.className = 'px-4 py-2 rounded-lg font-bold text-base transition bg-white shadow-sm text-brand-600';
                    btnBottom.className = 'px-4 py-2 rounded-lg font-bold text-base transition text-slate-500 hover:text-slate-700 hover:bg-slate-200';
                } else {
                    btnTop.className = 'px-4 py-2 rounded-lg font-bold text-base transition text-slate-500 hover:text-slate-700 hover:bg-slate-200';
                    btnBottom.className = 'px-4 py-2 rounded-lg font-bold text-base transition bg-white shadow-sm text-brand-600';
                }
            }
        }

        function openToolSettings() { 
            const mx = document.getElementById('input-max-picker'); 
            if(mx) mx.value = maxPickerNum; 
            const tools = ['picker', 'timer', 'noise', 'attention', 'lunch', 'youtube', 'tinkerbell', 'iscream', 'popupnote', 'qr', 'activity']; 
            tools.forEach(id => { const el = document.getElementById(`toggle-tool-${id}`); if(el) el.checked = toolVisibility[id] !== false; }); 
            renderStudentGrid(); 
            setTempTimetablePos(timetablePos);
            setTempToolPos(toolPanelPos);
            document.getElementById('modal-tool-settings').classList.add('active'); 
        }

        function saveToolSettings() { 
            const mx = document.getElementById('input-max-picker'); 
            if(mx) maxPickerNum = parseInt(mx.value) || 25; 
            storage.setItem('smartBoardMaxPicker', maxPickerNum); 
            
            timetablePos = tempTimetablePos;
            storage.setItem('smartBoardTimetablePos', timetablePos);
            applyTimetablePos();

            toolPanelPos = tempToolPanelPos;
            storage.setItem('smartBoardToolPos', toolPanelPos);
            applyToolPos();

            for(let i=0; i<35; i++){ const ip = document.getElementById(`student-name-${i}`); if(ip) studentNames[i] = ip.value; } 
            storage.setItem('smartBoardStudentNames', JSON.stringify(studentNames)); 
            const tools = ['picker', 'timer', 'noise', 'attention', 'lunch', 'youtube', 'tinkerbell', 'iscream', 'popupnote', 'qr', 'activity']; 
            tools.forEach(id => { const el = document.getElementById(`toggle-tool-${id}`); if(el) toolVisibility[id] = el.checked; }); 
            storage.setItem('smartBoardToolVisibility', JSON.stringify(toolVisibility)); 
            applyToolVisibility(); 
            closeModal('modal-tool-settings'); 
        }

        function renderStudentGrid() { const c = document.getElementById('student-list-container'); c.innerHTML = studentNames.map((n, i) => `<div class="flex items-center bg-white border rounded-lg overflow-hidden"><div class="bg-slate-100 px-2 py-1 font-bold w-10 text-center border-r text-sm">${i+1}</div><input type="text" id="student-name-${i}" value="${escHtml(n)}" class="w-full px-2 py-1 outline-none text-base font-bold" onpaste="handleStudentPaste(event, ${i})"></div>`).join(''); }
        // 2.8.2: 엑셀에서 붙여넣을 때 빈 칸(전학 간 번호)을 건너뛰지 않음 — 예전엔 뒤 학생 이름이 한 칸씩 당겨졌음.
        // 번호·이름처럼 여러 칸을 복사하면 각 줄의 마지막 칸(이름)을 씀
        function handleStudentPaste(e, idx) { e.preventDefault(); const rows = e.clipboardData.getData('text').replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n'); rows.forEach((r, i) => { if (idx + i < 35) { const el = document.getElementById(`student-name-${idx + i}`); if (el) el.value = r.split('\t').pop().trim(); } }); }
        function clearStudentNames() { if(confirm('입력된 학생 명렬표를 초기화하시겠습니까?')) { studentNames = Array(35).fill(''); storage.setItem('smartBoardStudentNames', JSON.stringify(studentNames)); renderStudentGrid(); } }

        // 시간을 더하면 진행 막대의 전체 시간도 같이 늘어남 (시작 전이면 남은 시간이 곧 전체 시간)
        function adjustTimerTime(s) { syncTimerRemaining(); timerRemaining += s; if (timerRemaining < 0) timerRemaining = 0; timerTotal = Math.max(timerRemaining, timerTotal + s); if (isTimerRunning) timerEndAt = Date.now() + timerRemaining * 1000; updateTimerDisplay(); }
        function addTimerTime(s) { syncTimerRemaining(); timerRemaining += s; timerTotal = Math.max(timerRemaining, timerTotal + s); if (isTimerRunning) timerEndAt = Date.now() + timerRemaining * 1000; updateTimerDisplay(); }
        /** 3.1.0: 첫 화면 타이머 위젯이 읽는 현재 상태 */
        function getTimerState() { syncTimerRemaining(); return { remaining: timerRemaining, total: timerTotal, running: isTimerRunning }; }
        function syncTimerRemaining() { if (isTimerRunning) timerRemaining = Math.max(0, Math.ceil((timerEndAt - Date.now()) / 1000)); }
        function toggleTimer() {
            const btn = document.getElementById('btn-timer-toggle');
            if (isTimerRunning) { 
                timerRemaining = Math.max(0, Math.ceil((timerEndAt - Date.now()) / 1000));
                isTimerRunning = false; btn.innerText = '계속'; btn.dataset.state = 'paused'; 
                btn.classList.replace('bg-yellow-500', 'bg-blue-600'); btn.classList.replace('hover:bg-yellow-600', 'hover:bg-blue-700'); 
                updateTimerDisplay();
            } else { 
                if (timerRemaining <= 0) return; 
                if (timerTotal < timerRemaining) timerTotal = timerRemaining;
                timerEndAt = Date.now() + timerRemaining * 1000;
                isTimerRunning = true; btn.innerText = '정지'; btn.dataset.state = 'running'; 
                btn.classList.replace('bg-blue-600', 'bg-yellow-500'); btn.classList.replace('hover:bg-blue-700', 'hover:bg-yellow-600'); 
            }
        }
        /** 매초 tick 에서 호출: 남은 시간 갱신, 0이 되면 종료 알림 */
        // 2.8.2: 종소리·안내 음성이 나오는 중에 타이머가 끝나면, 예전엔 종을 끊고 알람 창 내용을 덮어써서
        // 학생들이 다음 과목 안내를 못 들었음 → 소리가 끝난 뒤 알림
        // (알람 창이 앞 소리를 멈추므로 창을 먼저 띄우고 '띵' 소리를 냄)
        function fireTimerEnd() { showAlarm("타이머 종료", "시간이 다 되었습니다!", false, "타이머가 종료되었습니다.", true); playAttentionBell(); }
        function tickTimer() {
            if (timerEndPending && !soundBusy()) { timerEndPending = false; fireTimerEnd(); }
            if (!isTimerRunning) return;
            timerRemaining = Math.max(0, Math.ceil((timerEndAt - Date.now()) / 1000));
            updateTimerDisplay();
            checkTimerWarnings();
            if (timerRemaining <= 0) {
                resetTimer();
                if (soundBusy()) timerEndPending = true; else fireTimerEnd();
            }
        }
        function resetTimer() { isTimerRunning = false; timerEndAt = 0; timerRemaining = 0; timerTotal = 0; timerWarned = {}; updateTimerDisplay(); const btn = document.getElementById('btn-timer-toggle'); btn.innerText = '시작'; btn.dataset.state = 'idle'; btn.classList.replace('bg-yellow-500', 'bg-blue-600'); btn.classList.replace('hover:bg-yellow-600', 'hover:bg-blue-700'); }
        function updateTimerDisplay() {
            const m = Math.floor(timerRemaining / 60); const s = timerRemaining % 60; const d = document.getElementById('timer-display'); if(d) d.innerText = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            // 진행 막대: 남은 비율만큼, 절반 이하 노랑 · 20% 이하 빨강
            const bar = document.getElementById('timer-progress');
            if (bar) {
                const r = timerTotal > 0 ? Math.max(0, Math.min(1, timerRemaining / timerTotal)) : 0;
                bar.style.width = (r * 100).toFixed(1) + '%';
                bar.className = `h-full rounded-full transition-all duration-700 ${r > 0.5 ? 'bg-blue-500' : (r > 0.2 ? 'bg-amber-400' : 'bg-red-500')}`;
            }
        }
        // ---------- 2.8.0: 타이머 미리 알림 (5·3·1분 전) ----------
        // 남은 시간이 그 분을 지나는 순간 한 번: 짧은 종 + "N분 남았습니다" + 타이머 창에 표시.
        // 그 분보다 짧게 맞춘 타이머에서는 울리지 않음. 시간을 더해 다시 그 위로 올라가면 다시 울릴 수 있음.
        function checkTimerWarnings() {
            const crossed = [];
            [5, 3, 1].forEach(min => {
                const t = min * 60;
                if (timerRemaining > t) { delete timerWarned[min]; return; }
                if (timerWarned[min] || timerRemaining <= 0 || timerTotal <= t) return;
                timerWarned[min] = true;
                if (timerWarn[min]) crossed.push(min);
            });
            if (crossed.length) announceTimerLeft(Math.min(...crossed)); // 절전 등으로 한꺼번에 지났으면 가장 가까운 것만
        }
        function announceTimerLeft(min) {
            const msg = document.getElementById('timer-warn-msg');
            if (msg) { msg.innerText = `${min}분 남았어요!`; msg.classList.remove('hidden'); clearTimeout(msg._t); msg._t = setTimeout(() => msg.classList.add('hidden'), 6000); }
            const d = document.getElementById('timer-display');
            if (d) { d.classList.add('animate-pulse', 'text-red-500'); setTimeout(() => d.classList.remove('animate-pulse', 'text-red-500'), 6000); }
            // 2.8.1: 교시 종(알람)이 울리거나 안내 중이면 소리는 내지 않음 — 예전엔 미리 알림이 종소리와 안내 음성을 끊어 버렸음
            const alarmOn = document.getElementById('modal-alarm')?.classList.contains('active');
            if (isAudioPlaying || alarmOn || (window.speechSynthesis && window.speechSynthesis.speaking)) return;
            playAttentionBell();
            setTimeout(() => playTTS(`${min}분 남았습니다.`), 1200);
        }
        function setTimerWarn(min, on) { timerWarn[min] = !!on; storage.setItem('smartBoardTimerWarn', JSON.stringify(timerWarn)); }
        function renderTimerWarnToggles() { [5, 3, 1].forEach(min => { const el = document.getElementById(`timer-warn-${min}`); if (el) el.checked = timerWarn[min] !== false; }); }
        
        function pickRandomNumber() {
            try {
                const res = Math.floor(Math.random() * maxPickerNum) + 1; 
                const name = studentNames[res-1]; 
                const el = document.getElementById('picker-result-text');
                
                el.classList.remove('animate-pop-in');
                void el.offsetWidth;
                el.classList.add('animate-pop-in');
                
                if (name && name.trim() !== '') {
                    el.innerHTML = `<div class="text-4xl text-purple-500 font-bold mb-4">${res}번</div><div class="text-7xl font-bold">${escHtml(name)}</div>`;
                } else {
                    el.innerHTML = `<div class="text-[9rem] font-bold text-purple-600">${res}</div>`;
                }
                
                document.getElementById('modal-picker-result').classList.add('active');
                
                if(globalVolume > 0) { 
                    stopAudio(); initAudio(); 
                    playNote(880, audioCtx.currentTime, 0.1, 'sine'); 
                    playNote(1046.5, audioCtx.currentTime + 0.1, 0.2, 'sine'); 
                }
            } catch(e) { console.error("뽑기 오류", e); }
        }
let currentBoardMode = 'board'; 

/** 지금 편집 중인 것이 판서인지 알림장인지에 따라 저장 키를 고름 (v1 의 '알림장 조작 시 판서가 덮어써지는' 버그 수정) */
function currentEditorKey() {
    return currentBoardMode === 'board' ? 'smartBoardCurrentNotepad' : 'smartBoardCurrentNotice';
}

let boardSwitching = false;
/** 3.0.0: 지금 보이는 판 ('board' 판서 / 'notice' 알림장) — 상단 전환 버튼이 씀 */
function getBoardMode() { return currentBoardMode; }
/** 3.0.0: 전환 중이면 false (전환 효과가 끝난 뒤 다시 눌러야 함) */
function setBoardMode(mode) { if (mode === currentBoardMode) return true; if (boardSwitching) return false; toggleBoardMode(); return true; }
/** 3.0.0: 빠른 설정의 '수업 종' = 교시 알람 팝업·종 (교시 알람 설정의 같은 스위치와 같은 값) */
function isBellEnabled() { return isAlarmPopupEnabled; }
function setBellEnabled(on) {
    isAlarmPopupEnabled = !!on;
    storage.setItem('smartBoardAlarmPopupEnabled', isAlarmPopupEnabled);
    const t = document.getElementById('toggle-alarm-popup'); if (t) t.checked = isAlarmPopupEnabled;
}
function toggleBoardMode() {
    if (boardSwitching) return;
    const titleText = document.getElementById('board-mode-text');
    const titleIcon = document.getElementById('board-mode-icon');
    const btnContainer = document.getElementById('board-toggle-btn');
    const bgSelect = document.getElementById('board-bg-select');
    const editorEl = document.getElementById('notepad-editor');
    const from = currentBoardMode, to = (from === 'board') ? 'notice' : 'board';

    // 지금 화면의 내용·배경·스크롤 위치 저장
    storage.setItem(from === 'board' ? 'smartBoardCurrentNotepad' : 'smartBoardCurrentNotice', boardEditor.getHTML());
    storage.setItem(from === 'board' ? 'smartBoardNotepadBg_board' : 'smartBoardNotepadBg_notice', boardBgColor);
    if (editorEl) storage.setItem('smartBoardScroll_' + from, String(editorEl.scrollTop));

    // 사라지는 효과 → 내용 교체 → 나타나는 효과
    boardSwitching = true;
    const panel = editorEl ? editorEl.parentElement : null;
    if (editorEl) editorEl.classList.add('sb-mode-out');
    setTimeout(() => {
        currentBoardMode = to;
        if (to === 'notice') {
            if (titleText) titleText.innerText = '알림';
            if (titleIcon) titleIcon.setAttribute('data-lucide', 'megaphone');
            if (btnContainer) btnContainer.classList.add('text-brand-600');
            boardEditor.setHTML(storage.getItem('smartBoardCurrentNotice') || '');
            boardBgColor = storage.getItem('smartBoardNotepadBg_notice') || '#ffffff';
        } else {
            if (titleText) titleText.innerText = '판서';
            if (titleIcon) titleIcon.setAttribute('data-lucide', 'edit-3');
            if (btnContainer) btnContainer.classList.remove('text-brand-600');
            boardEditor.setHTML(storage.getItem('smartBoardCurrentNotepad') || '');
            boardBgColor = storage.getItem('smartBoardNotepadBg_board') || '#064e3b';
        }
        applyBoardBg(boardBgColor);
        if (bgSelect) bgSelect.value = boardBgColor;
        if (typeof refreshIcons === 'function') refreshIcons();
        // 직전에 보던 스크롤 위치로 (커서 위치로 튀지 않게 포커스는 스크롤 없이)
        const savedScroll = parseInt(storage.getItem('smartBoardScroll_' + to) || '0', 10) || 0;
        if (editorEl) { editorEl.scrollTop = savedScroll; editorEl.classList.remove('sb-mode-out'); editorEl.classList.add('sb-mode-in'); }
        boardEditor.focusNoScroll();
        if (editorEl) editorEl.scrollTop = savedScroll;
        setTimeout(() => { if (editorEl) editorEl.classList.remove('sb-mode-in'); boardSwitching = false; }, 220);
        void panel;
    }, 140);
} // toggleBoardMode 닫기

// 누락되었던 시계, 알람 함수 복원
function updateTimetableHighlight(now) { 
    const cur = now.getHours() * 60 + now.getMinutes(); 
    document.querySelectorAll('.timetable-slot').forEach((el, i) => { 
        if(!el.dataset.start || !el.dataset.end) return; 
        const [sh, sm] = el.dataset.start.split(':').map(Number); const [eh, em] = el.dataset.end.split(':').map(Number); const isA = cur >= (sh*60+sm) && cur <= (eh*60+em); 
        const sub = el.querySelector('.slot-subject'); const nEl = el.querySelector('.slot-name'); const tEl = el.querySelector('.slot-time'); 
        if(isA) { el.classList.remove('bg-slate-50', 'border-slate-200'); el.classList.add('bg-brand-500', 'border-brand-600', 'shadow-lg', 'scale-105', 'z-10'); nEl?.classList.remove('text-slate-800', 'text-slate-400'); nEl?.classList.add('text-white'); tEl?.classList.remove('text-slate-600', 'text-slate-400'); tEl?.classList.add('text-white'); if(sub) { sub.classList.remove('bg-white', 'text-slate-700'); sub.classList.add('ring-4','ring-white/50','scale-110', 'z-10', 'bg-white', 'text-brand-800'); } } 
        else { el.classList.remove('bg-brand-500', 'border-brand-600', 'shadow-lg', 'scale-105', 'z-10'); el.classList.add('bg-slate-50', 'border-slate-200'); nEl?.classList.remove('text-white'); tEl?.classList.remove('text-white'); if(!mutedPeriods[i]) { nEl?.classList.add('text-slate-800'); tEl?.classList.add('text-slate-600'); } else { nEl?.classList.add('text-slate-400'); tEl?.classList.add('text-slate-400'); } if(sub) { sub.classList.remove('ring-4','ring-white/50','scale-110', 'z-10', 'bg-white', 'text-brand-800'); } } 
    }); 
}

function checkAlarms(now) {
    const timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    if (lastCheckedMinuteStr === timeStr) return; 
    let alarmTriggered = false;
    const dateKey = now.getDate();
    const currentKey = `${dateKey}-${timeStr}`;
    
    // 2.7.0: 주말과 학사일정상 휴업일·공휴일(src/school-calendar.ts)에는 수업 종과 퇴근 알람을 울리지 않음
    const dowNow = now.getDay();
    const holidayNow = window.schoolCalendar ? window.schoolCalendar.holidayOn(now) : null;
    const schoolOff = dowNow === 0 || dowNow === 6 || !!holidayNow;

    if (!schoolOff && isLeaveWorkEnabled && timeStr === leaveWorkTime && lastAlarmKey !== `leave-${currentKey}`) {
        if (leaveWorkPopupEnabled) { showAlarm("퇴근 시간 안내", "선생님, 오늘 하루도 수고 많으셨습니다!", true, "선생님, 퇴근 시간입니다. 수고하셨습니다.", true); } 
        else { playTTS("선생님, 퇴근 시간입니다. 수고하셨습니다."); }
        lastAlarmKey = `leave-${currentKey}`; alarmTriggered = true;
    }

    if (!alarmTriggered && customAlarmEnabled && timeStr === customAlarmTime && lastAlarmKey !== `custom-${currentKey}`) {
        showAlarm("지정 시간 알람", customAlarmMessage, false, customAlarmMessage, false);
        lastAlarmKey = `custom-${currentKey}`; alarmTriggered = true;
        if (customAlarmFreq === 'once') { customAlarmEnabled = false; storage.setItem('smartBoardCustomAlarmEnabled', JSON.stringify(false)); const tel = document.getElementById('toggle-custom-alarm'); if(tel) tel.checked = false; }
    }

    if (!alarmTriggered && isAlarmPopupEnabled) {
        const dow = now.getDay(); 
        const todayStr = now.toLocaleDateString();
        if(dailyOverride.date !== todayStr) { dailyOverride = { date: todayStr, overrides: {} }; storage.removeItem('smartBoardDailyOverride'); }
        const sch = [...(schedule[dow] || [])];
        for (let idx in dailyOverride.overrides) { sch[idx] = dailyOverride.overrides[idx]; }
        let lp = -1; for(let i = sch.length - 1; i >= 0; i--) { if(sch[i] && sch[i].trim() !== '') { lp = i; break; } }
        if (lp === -1) lp = timeSlots.length - 1; 
        let pendingAlarm = null;
        // 수업이 하나도 없는 날(주말 등)에는 점심 칸만으로 종이 울리지 않게 (예전엔 빈 점심 칸을 '점심'으로 채워 토요일에도 울렸음)
        const hasClass = sch.some((v, i) => v && v.trim() !== '' && v.trim() !== '점심' && timeSlots[i] && timeSlots[i].name !== '점심');

        for(let i = 0; i < timeSlots.length; i++) {
            if (schoolOff || !hasClass) break;
            const slot = timeSlots[i]; if (mutedPeriods[i]) continue; 
            let sub = sch[i] ? sch[i].trim() : ''; const isLunch = slot.name === '점심';
            if (isLunch && sub === '') sub = '점심'; if (sub === '') continue; 

            const [sh, sm] = slot.start.split(':').map(Number); const stD = new Date(now); stD.setHours(sh, sm - startAlarmOffset, 0, 0);
            const aSt = `${String(stD.getHours()).padStart(2, '0')}:${String(stD.getMinutes()).padStart(2, '0')}`;
            const [eh, em] = slot.end.split(':').map(Number); const enD = new Date(now); enD.setHours(eh, em - endAlarmOffset, 0, 0);
            const aEn = `${String(enD.getHours()).padStart(2, '0')}:${String(enD.getMinutes()).padStart(2, '0')}`;
            const sK = `start-${i}-${currentKey}`; const eK = `end-${i}-${currentKey}`;

            if (timeStr === aSt && lastAlarmKey !== sK) {
                const skip = (startAlarmOffset === 0);
                // 점심은 "수업이 시작되었습니다" 대신 점심 안내
                pendingAlarm = isLunch
                    ? { key: sK, title: '점심시간!', msg: '맛있게 먹고 오세요.', tts: '점심시간입니다. 맛있게 먹고 오세요.', skip: skip, priority: 2 }
                    : { key: sK, title: `${slot.name} 시작!`, msg: `이번 시간은 [${sub}] 입니다.`, tts: startAlarmMessage, skip: skip, priority: 2 };
            } else if (timeStr === aEn && lastAlarmKey !== eK) {
                const isC = (i === lp); const msg = isC ? closingAlarmMessage : endAlarmMessage; const title = isC ? '오늘 하루 끝!' : `${slot.name} 종료!`; const skip = (endAlarmOffset === 0); 
                if (!pendingAlarm || pendingAlarm.priority < 1) {
                    pendingAlarm = (isLunch && !isC)
                        ? { key: eK, title: '점심시간 끝!', msg: '점심시간이 끝났습니다.', tts: '점심시간이 끝났습니다.', skip: skip, priority: 1 }
                        : { key: eK, title: title, msg: isC ? '하교 시간입니다.' : '쉬는 시간입니다.', tts: msg, skip: skip, priority: 1 };
                }
            }
        }
        if (pendingAlarm) { showAlarm(pendingAlarm.title, pendingAlarm.msg, false, pendingAlarm.tts, pendingAlarm.skip); lastAlarmKey = pendingAlarm.key; }
    }
    lastCheckedMinuteStr = timeStr; 
}

function showAlarm(t, m, isLeave=false, tts=null, skipMelody=false) {
    const modal = document.getElementById('modal-alarm'); if(!modal) return;
    document.getElementById('alarm-title').innerText = t; document.getElementById('alarm-message').innerText = m; modal.classList.add('active');
    if (window.smartboardHost && window.smartboardHost.bringToFront) window.smartboardHost.bringToFront(); // 다른 창 밑에 있어도 보이게
 
    let musicDuration = 0;
    // 2.8.2: 앞 알람의 멜로디·뒤늦은 안내가 남아 새 알람 중에 엉뚱한 안내를 하지 않게 (멜로디 알람은 playAlarmMelody 가 이미 멈춤)
    if (isLeave || skipMelody) stopAudio();
    if(isLeave) { playTTS(tts || "선생님, 퇴근 시간입니다. 수고하셨습니다."); } 
    else if(skipMelody) { playTTS(tts || m); musicDuration = 8; } 
    else { musicDuration = playAlarmMelody(alarmMelody, tts || m); }
    const cel = document.getElementById('alarm-countdown'); if(alarmCountdownIntervalId) clearInterval(alarmCountdownIntervalId);
    if (isLeave && leaveWorkPopupDuration === 'manual') { if(cel) cel.innerText = `직접 창을 닫아주세요.`; } 
    else {
        let left = isLeave ? parseInt(leaveWorkPopupDuration) : (Math.max(alarmDurationSec, musicDuration) + 10);
        if(cel) cel.innerText = `${left}초 후 자동 닫힘`;
        alarmCountdownIntervalId = setInterval(() => { left--; if(cel) cel.innerText = `${left}초 후 자동 닫힘`; if(left<=0) closeAlarm(); }, 1000);
    }
}

function closeAlarm() { const m = document.getElementById('modal-alarm'); if(m) m.classList.remove('active'); if(alarmCountdownIntervalId) clearInterval(alarmCountdownIntervalId); stopAudio(); if(window.speechSynthesis) window.speechSynthesis.cancel(); }
function stopAudio() { isAudioPlaying = false; if(chimeTimeout) clearTimeout(chimeTimeout); currentOscillators.forEach(o => { try{o.stop();}catch(e){} }); currentOscillators = []; if(currentMp3Audio) { currentMp3Audio.pause(); currentMp3Audio.currentTime = 0; } }

// 유튜브 기능 완전 복원
function openYouTube() {
    const w = document.getElementById('floating-youtube');
    if (!w) return;
    if (w.classList.contains('hidden')) { w.classList.remove('hidden'); w.classList.add('flex'); }
    setTimeout(() => document.getElementById('youtube-url-input')?.focus(), 150);
}

function closeYouTube() {
    const w = document.getElementById('floating-youtube');
    if (w) { w.classList.add('hidden'); w.classList.remove('flex'); }
    window.youtubeUI.stop();
    document.getElementById('youtube-status')?.classList.add('hidden');
}

function searchYouTube() {
    const input = document.getElementById('youtube-url-input').value;
    window.youtubeUI.search(input);
}
// 1. 메뉴 열고 닫기 함수
function toggleActivityMenu() {
    const menu = document.getElementById('activity-menu');
    if (menu.classList.contains('hidden')) {
        menu.classList.remove('hidden');
        menu.classList.add('flex');
        // 2.8.1: 위젯을 화면 위쪽에 둔 경우 펼친 메뉴가 화면 밖으로 나가지 않게
        // (펼치는 효과로 처음엔 작게 그려지므로 효과가 끝난 뒤 한 번 더 확인)
        if (window.refitFloating) {
            const refit = () => window.refitFloating('btn-tool-activity');
            requestAnimationFrame(refit);
            menu.addEventListener('animationend', refit, { once: true });
            setTimeout(refit, 400);
        }
    } else {
        menu.classList.add('hidden');
        menu.classList.remove('flex');
    }
}

// 2. 단계 설정하기 함수 (0~3단계)
function setActivityMode(level) {
    const indicator = document.getElementById('activity-indicator');
    const icon = document.getElementById('activity-icon');
    const desc = document.getElementById('activity-desc');
    const bg = document.getElementById('activity-icon-bg');
    const menu = document.getElementById('activity-menu');

    // 메뉴 닫기
    menu.classList.add('hidden');
    menu.classList.remove('flex');

    if (level === 'none') {
        indicator.classList.add('hidden');
        return;
    }

    indicator.classList.remove('hidden');

    switch(level) {
        case 0: // 침묵
            icon.setAttribute('data-lucide', 'volume-x');
            desc.innerText = '0단계: 침묵';
            bg.className = 'p-3 rounded-2xl bg-slate-800 text-white';
            break;
        case 1: // 속삭임
            icon.setAttribute('data-lucide', 'message-square');
            desc.innerText = '1단계: 속삭임';
            bg.className = 'p-3 rounded-2xl bg-blue-500 text-white';
            break;
        case 2: // 대화
            icon.setAttribute('data-lucide', 'users');
            desc.innerText = '2단계: 대화';
            bg.className = 'p-3 rounded-2xl bg-emerald-500 text-white';
            break;
        case 3: // 발표
            icon.setAttribute('data-lucide', 'megaphone');
            desc.innerText = '3단계: 발표';
            bg.className = 'p-3 rounded-2xl bg-orange-500 text-white';
            break;
    }

    // 아이콘 새로고침
    if (typeof lucide !== 'undefined') lucide.createIcons();
}
// 칠판이나 다른 곳을 클릭하면 학습 약속 메뉴를 자동으로 닫는 기능
document.addEventListener('mousedown', (e) => {
    const menu = document.getElementById('activity-menu');
    const indicator = document.getElementById('activity-indicator');
    
    // 메뉴가 열려있고, 클릭한 곳이 메뉴나 표시창이 아니라면 닫기
    if (menu && !menu.classList.contains('hidden') && !menu.contains(e.target) && !indicator.contains(e.target)) {
        menu.classList.add('hidden');
        menu.classList.remove('flex');
    }
});


// --- HTML의 인라인 onclick 등이 전역 함수를 찾을 수 있도록 노출 (모듈 스코프 보정) ---
Object.assign(window, {
    toggleNoiseMeter,
    startNoiseMeter,
    stopNoiseMeter,
    measureNoiseLoop,
    updateNoiseVisuals,
    updateTrafficLight,
    triggerNoiseWarning,
    updateNoiseSens,
    saveNoiseRules,
    resetNoiseWarning,
    handleBoardImageUpload,
    processAndInsertImage,
    applyPopupNoteStyles,
    changePopupNoteFontSize,
    togglePopupNoteBold,
    changePopupNoteColor,
    refreshIcons,
    renderBoardColors,
    changeBoardBg,
    applyBoardBg,
    openTableModal,
    confirmInsertTable,
    closeModal,
    openSettingsModal,
    toggleMp3Input,
    openExternalSite,
    tickTimer,
    pickCustomMp3,
    clearCustomMp3,
    openAlarmSettingsModal,
    saveAlarmSettings,
    toggleAllReset,
    executeReset,
    togglePopupNote,
    toggleTimerPopup,
    savePopupNoteToList,
    showVersionInfo,
    toggleAlwaysOnTop,
    toggleFullscreen,
    applyLunchPosition,
    handleLunchPosChange,
    initClock,
    updateClock,
    setupControls,
    openLunchModal,
    toggleSchoolSelector,
    searchSchool,
    fetchLunchData,
    changeBoardFontFamily,
    changeSelectedTextSize,
    adjustBoardFontSize,
    setBoardFontSize,
    applyBoardFontSize,
    promptClearNotepad,
    executeClearNotepad,
    saveBoard,
    openSaveModal,
    confirmSaveBoard,
    openSavedBoards,
    renderSavedBoards,
    viewSavedBoard,
    deleteSavedBoard,
    loadViewedBoard,
    setNoticeAutoArchive,
    applyToolVisibility,
    updateSubjectFast,
    toggleMutePeriod,
    ringBellsToday,
    getSubjectColorClasses,
    renderTimetable,
    openWeather,
    toggleRegionSelector,
    fetchWeatherData,
    openCalendar,
    renderCalendar,
    changeCalendarMonth,
    resetCalendarToToday,
    playTTS,
    initAudio,
    playNote,
    previewMelody,
    playAlarmMelody,
    playAttentionBell,
    openTimeSettingsModal,
    saveTimeSettings,
    renderSettingsInputs,
    saveMainSettings,
    changeTheme,
    changeBgColor,
    changePanelColor,
    applyTimetablePos,
    applyToolPos,
    setTempTimetablePos,
    setTempToolPos,
    openToolSettings,
    saveToolSettings,
    renderStudentGrid,
    handleStudentPaste,
    clearStudentNames,
    adjustTimerTime,
    addTimerTime,
    getTimerState,
    setTimerWarn,
    toggleTimer,
    resetTimer,
    updateTimerDisplay,
    pickRandomNumber,
    toggleBoardMode,
    getBoardMode,
    setBoardMode,
    isBellEnabled,
    setBellEnabled,
    updateTimetableHighlight,
    checkAlarms,
    showAlarm,
    closeAlarm,
    stopAudio,
    openYouTube,
    closeYouTube,
    searchYouTube,
    toggleActivityMenu,
    setActivityMode,
});
} // startLegacyApp 끝
