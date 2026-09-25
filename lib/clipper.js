const express = require('express');
const { spawn, exec } = require('child_process');
const path = require('path');

const router = express.Router();
const CLIPPER_DIR = __dirname;
const PYTHON_EXEC = 'python'; // Assuming python is in PATH

// Helper to run small python scripts and parse JSON output
function runPythonHelper(scriptContent) {
    return new Promise((resolve, reject) => {
        const process = spawn(PYTHON_EXEC, ['-c', scriptContent]);
        let stdout = '';
        let stderr = '';
        process.stdout.on('data', data => stdout += data.toString());
        process.stderr.on('data', data => stderr += data.toString());
        process.on('close', code => {
            if (code !== 0) return reject(new Error(stderr));
            try {
                resolve(JSON.parse(stdout.trim()));
            } catch(e) {
                resolve(stdout.trim());
            }
        });
    });
}

const NATIVE_DIALOG_SCRIPT = `
import tkinter as tk
import tkinter.filedialog as fd
import json, sys
root = tk.Tk()
root.withdraw()
root.attributes("-topmost", True)
mode = sys.argv[1]
res = None
if mode == "videos":
    res = fd.askopenfilenames(title="Select Videos", filetypes=[("Video Files", "*.mp4;*.avi;*.mov;*.mkv")])
elif mode == "logo":
    res = fd.askopenfilename(title="Select Logo", filetypes=[("Image Files", "*.png;*.jpg;*.jpeg")])
elif mode == "folder":
    res = fd.askdirectory(title="Select Output Folder")

print(json.dumps(res if res else None))
`;

router.get('/dialog/:mode', async (req, res) => {
    try {
        const script = NATIVE_DIALOG_SCRIPT.replace('sys.argv[1]', `"${req.params.mode}"`);
        const result = await runPythonHelper(script);
        res.json({ result });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/open-folder', express.json(), (req, res) => {
    let folder = req.body.folder || path.join(CLIPPER_DIR, 'output');
    exec(`explorer.exe "${folder}"`);
    res.json({ success: true });
});

let currentProcess = null;

router.post('/process', express.json(), (req, res) => {
    const { videos, config } = req.body;
    
    // We will use SSE (Server-Sent Events) to stream progress
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const runnerScript = `
import sys, json, os
sys.path.append(r"${CLIPPER_DIR.replace(/\\/g, '\\\\')}")
from video_splitter import VideoEngine

def progress_cb(idx, tot_vid, c_idx, tot_clip, msg):
    print(json.dumps({"type": "progress", "video_index": idx, "total_videos": tot_vid, "clip_index": c_idx, "total_clips": tot_clip, "message": msg}), flush=True)

engine = VideoEngine()
payload = json.loads(sys.stdin.read())
videos = payload["videos"]
config = payload["config"]

success = True
for idx, vid in enumerate(videos):
    res = engine.process_single_video(vid, config, idx + 1, len(videos), None, progress_cb)
    if not res: success = False

print(json.dumps({"type": "done", "success": success}), flush=True)
`;
    
    currentProcess = spawn(PYTHON_EXEC, ['-c', runnerScript]);
    currentProcess.stdin.write(JSON.stringify({ videos, config }));
    currentProcess.stdin.end();
    
    currentProcess.stdout.on('data', data => {
        const lines = data.toString().split('\\n');
        for (let line of lines) {
            if (line.trim()) {
                res.write(`data: ${line.trim()}\\n\\n`);
            }
        }
    });
    
    currentProcess.stderr.on('data', data => {
        console.error("Clipper Python Error:", data.toString());
    });
    
    currentProcess.on('close', () => {
        res.write(`data: {"type": "done", "success": true}\\n\\n`);
        res.end();
        currentProcess = null;
    });
});

router.post('/cancel', (req, res) => {
    if (currentProcess) {
        currentProcess.kill();
        currentProcess = null;
    }
    res.json({ success: true });
});

module.exports = router;
