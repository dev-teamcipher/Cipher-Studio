let videoQueue = [];
let isProcessing = false;

window.addEventListener('DOMContentLoaded', async function() {
    // Nav Elements
    const openMainFolderBtn = document.getElementById("open-main-folder-btn");
    const loginScreen = document.getElementById("login-screen");

    // Queue Elements
    const addVideoBtn = document.getElementById("add-video-btn");
    const queueList = document.getElementById("video-queue-list");
    
    // Status
    const startBtn = document.getElementById("start-btn");
    const cancelBtn = document.getElementById("cancel-btn");
    const statusText = document.getElementById("status-text");
    const etaText = document.getElementById("eta-text");
    const progressBar = document.getElementById("progress-bar");

    // Bypass License on Boot
    setupMainApp();
    setTimeout(() => { const p = new URLSearchParams(window.location.search).get('tool'); if(p) { const c = document.querySelector('.tool-card[data-tool="' + p + '"]'); if(c) c.click(); } }, 100);

    function setupMainApp() {
        document.getElementById("dashboard-screen").classList.remove("hidden");
        openMainFolderBtn.classList.remove("hidden");
    }

    openMainFolderBtn.addEventListener("click", () => {
        fetch("/api/clipper/open-folder", {method: "POST"});
    });

    // --- DASHBOARD NAVIGATION LOGIC ---
    let currentMode = "auto";
    const dashboardScreen = document.getElementById("dashboard-screen");
    const workspaceScreen = document.getElementById("workspace-screen");
    const backBtn = document.getElementById("back-to-dashboard-btn");
    const currentToolTitle = document.getElementById("current-tool-title");

    const toolCards = document.querySelectorAll(".tool-card");
    const configAuto = document.getElementById("config-auto");
    const configManual = document.getElementById("config-manual");

    toolCards.forEach(card => {
        card.addEventListener("click", () => {
            const tool = card.getAttribute("data-tool");
            const toolName = card.querySelector(".tool-name").textContent;
            
            // Set header title
            currentToolTitle.textContent = toolName;

            // Update backend mode
            currentMode = tool;

            // List of all tool configuration panel IDs
            const allConfigIds = [
                "config-auto", "config-manual", "config-watermark", 
                "config-transcriber", "config-scriptwriter", "config-promptgenerator", 
                "config-autocaptions", "config-autocutpro", "config-bulkimage"
            ];

            // Hide all configs
            allConfigIds.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.add("hidden");
            });

            // Show selected config
            const selectedConfigEl = document.getElementById("config-" + tool);
            if (selectedConfigEl) selectedConfigEl.classList.remove("hidden");

            // Transition screens
            dashboardScreen.classList.add("hidden");
            
            // Standalone screens
            const viewTranscriber = document.getElementById("view-transcriber");
            if (viewTranscriber) viewTranscriber.classList.remove("active");
            
            if (tool === "transcriber") {
                workspaceScreen.classList.add("hidden");
                if (viewTranscriber) viewTranscriber.classList.add("active");
            } else {
                workspaceScreen.classList.remove("hidden");
            }
        });
    });

    backBtn.addEventListener("click", () => {
        if(window.parent && window.parent.ToolsHub) { window.parent.ToolsHub.switchTool('hub'); return; }
        workspaceScreen.classList.add("hidden");
        dashboardScreen.classList.remove("hidden");
    });
    
    // Add back button listener for standalone transcriber screen
    setTimeout(() => {
        const transcriberBackBtn = document.querySelector(".btn-transcriber-back");
        if (transcriberBackBtn) {
            transcriberBackBtn.addEventListener("click", () => {
                const viewTranscriber = document.getElementById("view-transcriber");
                if (viewTranscriber) viewTranscriber.classList.remove("active");
                dashboardScreen.classList.remove("hidden");
            });
        }
    }, 1000);

    let currentOutputFolder = null;
    let currentLogoPath = "";

    document.getElementById("select-output-btn").addEventListener("click", async () => {
        const folder = (await (await fetch("/api/clipper/dialog/folder")).json()).result;
        if (folder) {
            currentOutputFolder = folder;
            document.getElementById("select-output-btn").textContent = "📂 " + folder.split('\\\\').pop();
        }
    });

    // --- WATERMARK LOGIC ---
    let watermarkLogos = {
        1: "",
        2: "",
        3: ""
    };

    document.querySelectorAll(".btn-select-logo").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const index = e.target.getAttribute("data-logo-index");
            const logo = (await (await fetch("/api/clipper/dialog/logo")).json()).result;
            if (logo) {
                watermarkLogos[index] = logo;
                document.getElementById(`logo-path-display-${index}`).textContent = logo.split('\\\\').pop().split('/').pop();
                document.querySelector(`.btn-clear-logo[data-logo-index="${index}"]`).style.display = "block";
            }
        });
    });

    document.querySelectorAll(".btn-clear-logo").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const index = e.target.getAttribute("data-logo-index");
            watermarkLogos[index] = "";
            document.getElementById(`logo-path-display-${index}`).textContent = "None";
            e.target.style.display = "none";
        });
    });

    // --- QUEUE LOGIC ---
    function addVideosToQueue(paths) {
        if (!paths || paths.length === 0) return;
        
        paths.forEach(p => {
            if (!videoQueue.includes(p)) videoQueue.push(p);
        });
        
        renderQueue();
    }

    addVideoBtn.addEventListener("click", async () => {
        if (isProcessing) return;
        const result = (await (await fetch("/api/clipper/dialog/videos")).json()).result;
        if (result && result.length > 0) {
            addVideosToQueue(result);
        }
    });

    function renderQueue() {
        queueList.innerHTML = "";
        const manualList = document.getElementById("manual-timestamps-list");
        if(manualList) manualList.innerHTML = "";
        
        const textOverlayList = document.getElementById("text-overlay-list");
        if(textOverlayList) textOverlayList.innerHTML = "";

        if (videoQueue.length === 0) {
            queueList.innerHTML = `<div class="empty-state">No videos added yet.</div>`;
            if(manualList) manualList.innerHTML = `<div class="text-muted text-center" style="padding: 2rem;">Add videos to queue to set timestamps.</div>`;
            if(textOverlayList) textOverlayList.innerHTML = `<div class="text-muted text-center" style="padding: 2rem;">Add videos to queue to edit text.</div>`;
            return;
        }

        videoQueue.forEach((path, idx) => {
            const filename = path.split('\\\\').pop().split('/').pop();
            const item = document.createElement("div");
            item.className = "queue-item";
            item.innerHTML = `
                <span class="queue-item-name" title="${path}">${idx + 1}. ${filename}</span>
                <button class="btn-remove-item" data-idx="${idx}">✕</button>
            `;
            queueList.appendChild(item);

            if (manualList) {
                const mItem = document.createElement("div");
                mItem.className = "input-group";
                mItem.style.marginBottom = "0.5rem";
                mItem.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                        <label style="color: var(--accent-2); margin: 0;">${idx + 1}. ${filename}</label>
                        <button class="btn-preview" data-path="${path}" data-name="${filename}" title="Open Video Player" style="background: none; border: none; cursor: pointer; color: var(--accent-1); display: flex; align-items: center; gap: 4px; padding: 2px 5px; border-radius: 4px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>
                            <span style="font-size: 0.8rem; font-weight: bold;">Preview</span>
                        </button>
                    </div>
                    <input type="text" class="manual-ts-input" data-path="${path}" id="ts-input-${idx}" placeholder="e.g. 01:10-02:00, 00:05-00:30">
                `;
                manualList.appendChild(mItem);
            }

            if (textOverlayList) {
                const basename = filename.substring(0, filename.lastIndexOf('.')) || filename;
                const tItem = document.createElement("div");
                tItem.className = "input-group";
                tItem.style.marginBottom = "0.5rem";
                tItem.innerHTML = `
                    <label style="color: var(--accent-2); margin-bottom: 5px; display: block;">${idx + 1}. ${filename}</label>
                    <input type="text" class="text-overlay-input input-modern" data-path="${path}" value="${basename}" style="width: 100%;">
                `;
                textOverlayList.appendChild(tItem);
            }
        });

        document.querySelectorAll(".btn-remove-item").forEach(btn => {
            btn.addEventListener("click", (e) => {
                if (isProcessing) return;
                const i = parseInt(e.target.getAttribute("data-idx"));
                videoQueue.splice(i, 1);
                renderQueue();
            });
        });

        // Add event listeners to preview buttons
        document.querySelectorAll(".btn-preview").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const targetBtn = e.currentTarget;
                const path = targetBtn.getAttribute("data-path");
                const name = targetBtn.getAttribute("data-name");
                const inputId = targetBtn.parentElement.parentElement.querySelector("input").id;
                openVideoModal(path, name, inputId);
            });
        });
    }

    // --- VIDEO MODAL LOGIC ---
    const videoModal = document.getElementById("video-modal");
    const previewVideo = document.getElementById("preview-video");
    const videoModalTitle = document.getElementById("video-modal-title");
    const liveTimestampPreview = document.getElementById("live-timestamp-preview");
    
    let currentPreviewPath = "";
    let currentInputId = "";
    let tempStartTime = null;
    let tempEndTime = null;

    function openVideoModal(path, name, inputId) {
        currentPreviewPath = path;
        currentInputId = inputId;
        videoModalTitle.textContent = name;
        tempStartTime = null;
        tempEndTime = null;
        liveTimestampPreview.value = "";
        
        // Convert Windows absolute path to file:/// URI
        const fileUri = "file:///" + path.replace(/\\\\/g, "/");
        previewVideo.src = fileUri;
        
        videoModal.classList.remove("hidden");
        previewVideo.play().catch(e => console.log("Auto-play blocked:", e));
    }

    document.getElementById("close-video-modal").addEventListener("click", () => {
        videoModal.classList.add("hidden");
        previewVideo.pause();
        previewVideo.src = "";
    });

    function formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    // Update live timestamp text while video plays if start time is set
    previewVideo.addEventListener("timeupdate", () => {
        if (!videoModal.classList.contains("hidden")) {
            const currentFormatted = formatTime(previewVideo.currentTime);
            if (tempStartTime !== null && tempEndTime === null) {
                const startFormatted = formatTime(tempStartTime);
                liveTimestampPreview.value = `${startFormatted}-${currentFormatted}`;
            }
        }
    });

    document.getElementById("btn-set-start").addEventListener("click", () => {
        tempStartTime = previewVideo.currentTime;
        tempEndTime = null;
        const startFormatted = formatTime(tempStartTime);
        liveTimestampPreview.value = `${startFormatted}-...`;
    });

    document.getElementById("btn-set-end").addEventListener("click", () => {
        if (tempStartTime === null) {
            alert("Please set a Start Time first.");
            return;
        }
        const endTime = previewVideo.currentTime;
        if (endTime <= tempStartTime) {
            alert("End Time must be after Start Time.");
            return;
        }
        
        tempEndTime = endTime;
        const startFormatted = formatTime(tempStartTime);
        const endFormatted = formatTime(tempEndTime);
        liveTimestampPreview.value = `${startFormatted}-${endFormatted}`;
    });

    document.getElementById("btn-add-clip").addEventListener("click", () => {
        const val = liveTimestampPreview.value.trim();
        if (!val || val.includes("...")) {
            alert("Please set both Start and End times before adding a clip.");
            return;
        }

        const inputField = document.getElementById(currentInputId);
        if (inputField) {
            let currentVal = inputField.value.trim();
            if (currentVal && !currentVal.endsWith(",")) {
                currentVal += ", ";
            }
            inputField.value = currentVal + val;
            
            // Visual feedback
            inputField.style.boxShadow = "0 0 10px var(--accent-2)";
            setTimeout(() => inputField.style.boxShadow = "none", 1000);
            
            // Reset state so user can immediately click Set Start for the next clip
            tempStartTime = null;
            tempEndTime = null;
            liveTimestampPreview.value = "";
        }
    });

    // --- PROCESSING LOGIC ---
    startBtn.addEventListener("click", async () => {
        if (videoQueue.length === 0) {
            return alert("Please add videos to the queue first!");
        }

        let manualTimestamps = {};
        document.querySelectorAll(".manual-ts-input").forEach(input => {
            if (input.value.trim() !== "") {
                manualTimestamps[input.getAttribute("data-path")] = input.value;
            }
        });

        let logosConfig = [];
        for (let i = 1; i <= 3; i++) {
            if (watermarkLogos[i]) {
                logosConfig.push({
                    path: watermarkLogos[i],
                    pos: document.getElementById(`cfg-logo-pos-${i}`).value,
                    size: document.getElementById(`cfg-logo-size-${i}`).value,
                    opacity: document.getElementById(`cfg-logo-opacity-${i}`).value
                });
            }
        }

        const configTextPos = document.getElementById("cfg-text-pos") ? document.getElementById("cfg-text-pos").value : "top_left";
        const configTextSize = document.getElementById("cfg-text-size") ? document.getElementById("cfg-text-size").value : "48";
        const configTextColor = document.getElementById("cfg-text-color") ? document.getElementById("cfg-text-color").value : "#ffffff";

        let customTexts = {};
        const bulkTextVal = document.getElementById("bulk-text-input") ? document.getElementById("bulk-text-input").value.trim() : "";
        let bulkLines = bulkTextVal ? bulkTextVal.split('\n') : [];

        document.querySelectorAll(".text-overlay-input").forEach((input, index) => {
            let path = input.getAttribute("data-path");
            if (bulkLines.length > index && bulkLines[index].trim() !== "") {
                customTexts[path] = bulkLines[index].trim();
            } else {
                customTexts[path] = input.value;
            }
        });

        const config = {
            mode: currentMode,
            manual_timestamps: manualTimestamps,
            output_folder: currentOutputFolder,
            duration: document.getElementById("cfg-duration").value,
            overlap: document.getElementById("cfg-overlap").value,
            variance: document.getElementById("cfg-variance").value,
            title: "clip",
            skip_start: document.getElementById("cfg-skip-start").value,
            skip_end: document.getElementById("cfg-skip-end").value,
            vertical_crop: document.getElementById("cfg-vertical").checked,
            normalize_audio: document.getElementById("cfg-normalize").checked,
            logos: logosConfig
        };

        isProcessing = true;
        startBtn.classList.add("hidden");
        cancelBtn.classList.remove("hidden");
        addVideoBtn.disabled = true;
        progressBar.style.width = "0%";
        statusText.textContent = "Starting process...";

        const res = await new Promise((resolve) => {     fetch('/api/clipper/process', {         method: 'POST',         headers: { 'Content-Type': 'application/json' },         body: JSON.stringify({ videos: videoQueue, config: config })     }).then(async res => {         const reader = res.body.getReader();         const decoder = new TextDecoder();         while (true) {             const {done, value} = await reader.read();             if (done) break;             const lines = decoder.decode(value).split('\n');             for (let line of lines) {                 if (line.startsWith('data: ')) {                     try {                         const data = JSON.parse(line.substring(6));                         if (data.type === 'progress') {                             window.update_progress(data.video_index, data.total_videos, data.clip_index, data.total_clips, data.message);                         } else if (data.type === 'done') {                             resolve({status: data.success ? 'success' : 'error'});                             return;                         }                     } catch(e) {}                 }             }         }         resolve({status: 'success'});     }); });
        if (res.status === "error") {
            alert(res.message);
            resetUI();
        }
    });

    cancelBtn.addEventListener("click", () => {
        fetch("/api/clipper/cancel", {method: "POST"});
        cancelBtn.disabled = true;
        cancelBtn.textContent = "CANCELLING...";
    });

    function resetUI() {
        isProcessing = false;
        startBtn.classList.remove("hidden");
        cancelBtn.classList.add("hidden");
        cancelBtn.disabled = false;
        cancelBtn.textContent = "CANCEL";
        addVideoBtn.disabled = false;
        progressBar.style.width = "0%";
    }

    // Callbacks from Python
    window.updateProgress = function(vIdx, vTotal, cIdx, cTotal, text) {
        statusText.textContent = text;
        const totalClipsRatio = (cIdx / Math.max(1, cTotal));
        const overallVideoBase = (vIdx / vTotal) * 100;
        const clipContribution = (totalClipsRatio / vTotal) * 100;
        const finalPct = overallVideoBase + clipContribution;
        progressBar.style.width = finalPct + "%";
        
        // Transcriber UI updates
        if(currentMode === "transcriber") {
            const progPct = document.getElementById("transcriber-progress-pct");
            const progCircle = document.getElementById("transcriber-progress-circle");
            const progStatus = document.getElementById("transcriber-progress-status");
            const progLinear = document.getElementById("transcriber-progress-linear-fill");
            
            let displayPct = Math.round(finalPct);
            if(progPct) progPct.textContent = displayPct + "%";
            if(progCircle) {
                // stroke-dasharray = 326.72
                const offset = 326.72 - (326.72 * displayPct / 100);
                progCircle.style.strokeDashoffset = offset;
            }
            if(progLinear) progLinear.style.width = displayPct + "%";
            if(progStatus) progStatus.textContent = text;
        }
    };

    window.updateETA = function(elapsedSec, successCount, totalCount) {
        if (successCount === 0) {
            etaText.textContent = "ETA: Calculating...";
            return;
        }
        const avgTimePerVideo = elapsedSec / successCount;
        const remainingVideos = totalCount - successCount;
        const remainingSec = remainingVideos * avgTimePerVideo;
        
        const m = Math.floor(remainingSec / 60);
        const s = Math.floor(remainingSec % 60);
        etaText.textContent = `ETA: ${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const completionModal = document.getElementById("completion-modal");
    const completionTitle = document.getElementById("completion-title");
    const completionMessage = document.getElementById("completion-message");
    const completionIcon = document.getElementById("completion-icon");
    const completionCloseBtn = document.getElementById("completion-close-btn");
    const completionFolderBtn = document.getElementById("completion-folder-btn");

    window.processingComplete = function(msg, successCount, totalCount) {
        statusText.textContent = "Idle";
        etaText.textContent = "ETA: --:--";
        resetUI();
        
        if (currentMode === "transcriber") {
            const btnStartTranscribe = document.getElementById("btn-start-transcribe");
            if(btnStartTranscribe) {
                btnStartTranscribe.disabled = false;
                btnStartTranscribe.innerHTML = `<span class="btn-bolt">⚡</span> <span class="btn-label-text">Start Transcription</span>`;
            }
            
            const progPct = document.getElementById("transcriber-progress-pct");
            const progCircle = document.getElementById("transcriber-progress-circle");
            const progStatus = document.getElementById("transcriber-progress-status");
            const progLinear = document.getElementById("transcriber-progress-linear-fill");
            
            if(progPct) progPct.textContent = "100%";
            if(progCircle) progCircle.style.strokeDashoffset = "0";
            if(progLinear) progLinear.style.width = "100%";
            if(progStatus) progStatus.textContent = "Completed";
        }
        
        if (msg.includes("Cancelled")) {
            completionTitle.textContent = "Cancelled";
            completionTitle.style.background = "none";
            completionTitle.style.webkitTextFillColor = "#ef4444";
            completionIcon.textContent = "⚠️";
            completionIcon.style.filter = "drop-shadow(0 0 15px rgba(239, 68, 68, 0.5))";
        } else {
            completionTitle.textContent = "Success!";
            completionTitle.style.background = "";
            completionTitle.style.webkitTextFillColor = "";
            completionIcon.textContent = "✅";
            completionIcon.style.filter = "drop-shadow(0 0 15px rgba(16, 185, 129, 0.5))";
        }
        
        completionMessage.innerHTML = `${msg}<br><br><strong style="color: var(--text-light); font-size: 1.2rem;">Processed: ${successCount} / ${totalCount}</strong>`;
        completionModal.classList.remove("hidden");
    };

    completionCloseBtn.addEventListener("click", () => {
        completionModal.classList.add("hidden");
    });

    completionFolderBtn.addEventListener("click", () => {
        if (true) {
            fetch("/api/clipper/open-folder", {method: "POST"});
        }
        completionModal.classList.add("hidden");
    });
    // --- THEME SELECTOR LOGIC ---
    const themeBtns = document.querySelectorAll(".theme-btn");
    const themes = {
        "default":   { a1: "#8b5cf6", a2: "#3b82f6" },
        "cyberpunk": { a1: "#ec4899", a2: "#06b6d4" },
        "matrix":    { a1: "#10b981", a2: "#3b82f6" },
        "ruby":      { a1: "#ef4444", a2: "#f59e0b" }
    };

    themeBtns.forEach(btn => {
        btn.addEventListener("click", (e) => {
            const themeName = e.target.getAttribute("data-theme");
            const theme = themes[themeName];
            if (theme) {
                document.documentElement.style.setProperty('--accent-1', theme.a1);
                document.documentElement.style.setProperty('--accent-2', theme.a2);
            }
        });
    });


    
    // --- TRANSCRIBER UI LOGIC ---
    let transcriberSelectedFile = null;

    // 1. Navigation Tabs
    const tTabs = ["transcribe", "files", "history", "templates"];
    tTabs.forEach(tab => {
        const btn = document.getElementById(`tab-nav-${tab}`);
        if(btn) {
            btn.addEventListener("click", () => {
                // Remove active from all tabs
                tTabs.forEach(t => {
                    const b = document.getElementById(`tab-nav-${t}`);
                    if(b) b.classList.remove("active");
                    const p = document.getElementById(`transcriber-view-${t === "transcribe" ? "main" : t}`);
                    if(p) {
                        p.classList.remove("active");
                        p.classList.add("hidden");
                    }
                });
                
                // Add active to current
                btn.classList.add("active");
                const currentPane = document.getElementById(`transcriber-view-${tab === "transcribe" ? "main" : tab}`);
                if(currentPane) {
                    currentPane.classList.remove("hidden");
                    currentPane.classList.add("active");
                }
            });
        }
    });

    // 2. Browse Files
    const btnTranscriberBrowse = document.getElementById("btn-transcriber-browse");
    const transcriberDropArea = document.getElementById("transcriber-drop-area");
    const transcriberLoadedCard = document.getElementById("transcriber-loaded-card");
    const btnStartTranscribe = document.getElementById("btn-start-transcribe");
    const transcriberFilename = document.getElementById("transcriber-filename");

    if (btnTranscriberBrowse) {
        btnTranscriberBrowse.addEventListener("click", async () => {
            const paths = (await (await fetch("/api/clipper/dialog/videos")).json()).result;
            if (paths && paths.length > 0) {
                transcriberSelectedFile = paths[0];
                transcriberDropArea.classList.add("hidden");
                transcriberLoadedCard.classList.remove("hidden");
                
                const filename = transcriberSelectedFile.split('\\').pop().split('/').pop();
                if(transcriberFilename) transcriberFilename.textContent = filename;
                
                if(btnStartTranscribe) {
                    btnStartTranscribe.disabled = false;
                    btnStartTranscribe.style.opacity = "1";
                    btnStartTranscribe.style.cursor = "pointer";
                }
            }
        });
    }

    // 3. Start Transcription
    if (btnStartTranscribe) {
        btnStartTranscribe.addEventListener("click", async () => {
            if(!transcriberSelectedFile) return;
            
            btnStartTranscribe.disabled = true;
            btnStartTranscribe.innerHTML = `<span class="btn-bolt">&#9889;</span> <span class="btn-label-text">Processing...</span>`;
            
            const config = {
                mode: "transcriber",
                output_folder: currentOutputFolder,
                lang: document.getElementById("sel-transcribe-lang") ? document.getElementById("sel-transcribe-lang").value : "auto",
                format: document.getElementById("sel-transcribe-format") ? document.getElementById("sel-transcribe-format").value : "srt"
            };

            const progPct = document.getElementById("transcriber-progress-pct");
            const progStatus = document.getElementById("transcriber-progress-status");
            const progDetail = document.getElementById("transcriber-progress-detail");
            
            if(progPct) progPct.textContent = "0%";
            if(progStatus) progStatus.textContent = "Transcribing...";
            if(progDetail) progDetail.textContent = "Please wait, running Whisper AI...";

            isProcessing = true;
            const res = await new Promise((resolve) => {     fetch('/api/clipper/process', {         method: 'POST',         headers: { 'Content-Type': 'application/json' },         body: JSON.stringify({ videos: [transcriberSelectedFile], config: config })     }).then(async res => {         const reader = res.body.getReader();         const decoder = new TextDecoder();         while (true) {             const {done, value} = await reader.read();             if (done) break;             const lines = decoder.decode(value).split('\n');             for (let line of lines) {                 if (line.startsWith('data: ')) {                     try {                         const data = JSON.parse(line.substring(6));                         if (data.type === 'progress') {                             window.update_progress(data.video_index, data.total_videos, data.clip_index, data.total_clips, data.message);                         } else if (data.type === 'done') {                             resolve({status: data.success ? 'success' : 'error'});                             return;                         }                     } catch(e) {}                 }             }         }         resolve({status: 'success'});     }); });
            
            btnStartTranscribe.disabled = false;
            btnStartTranscribe.innerHTML = `<span class="btn-bolt">&#9889;</span> <span class="btn-label-text">Start Transcription</span>`;
            
            if (res && res.status === "error") {
                alert(res.message);
                if(progStatus) progStatus.textContent = "Error";
            }
        });
    }

});



