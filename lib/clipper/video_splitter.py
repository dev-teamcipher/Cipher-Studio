import os
import sys
import subprocess
import math
import random
import concurrent.futures
import threading
import multiprocessing

class VideoEngine:
    def __init__(self):
        self.base_dir = os.path.dirname(os.path.abspath(__file__))
        self.ffmpeg_path = self.resolve_path(os.path.join("bin", "ffmpeg.exe"))
        self.ffprobe_path = self.resolve_path(os.path.join("bin", "ffprobe.exe")) 
        self.output_base_dir = os.path.join(self.base_dir, "output")
        
        self.creationflags = 0
        if sys.platform == "win32":
            self.creationflags = 0x08000000 # CREATE_NO_WINDOW

    def resolve_path(self, relative_path):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        path = os.path.join(base_dir, relative_path)
        if os.path.exists(path):
            return path
        cwd_path = os.path.join(os.getcwd(), relative_path)
        if os.path.exists(cwd_path):
            return cwd_path
        return relative_path

    def create_output_folder(self, title, base_dir=None):
        target_base = base_dir if base_dir else self.output_base_dir
        folder_path = os.path.join(target_base, title)
        if not os.path.exists(folder_path):
            os.makedirs(folder_path, exist_ok=True)
        return folder_path

    def get_video_duration(self, video_path):
        command = [
            self.ffprobe_path, 
            "-v", "error", 
            "-show_entries", "format=duration", 
            "-of", "default=noprint_wrappers=1:nokey=1", 
            video_path
        ]
        try:
            result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, creationflags=self.creationflags)
            if result.returncode != 0:
                print(f"FFprobe error: {result.stderr}")
                return 0.0
            return float(result.stdout.strip())
        except Exception as e:
            print(f"Error getting duration: {e}")
            return 0.0

    def process_single_video(self, video_path, config, video_index, total_videos, cancel_event=None, progress_callback=None):
        """Processes a single video and yields progress updates."""
        
        duration_seconds = int(config.get("duration", 30))
        overlap_seconds = int(config.get("overlap", 0))
        skip_start = int(config.get("skip_start", 0))
        skip_end = int(config.get("skip_end", 0))
        variance = float(config.get("variance", 0))
        title_prefix = config.get("title", "")
        output_dir = config.get("output_folder") or self.output_base_dir
        
        vertical_crop = config.get("vertical_crop", False)
        normalize_audio = config.get("normalize_audio", False)
        delete_original = config.get("delete_original", False)

        video_filename = os.path.splitext(os.path.basename(video_path))[0]
        
        # Subfolder logic
        folder_name = video_filename

        output_folder = self.create_output_folder(folder_name, output_dir)
        
        if progress_callback:
            progress_callback(video_index, total_videos, 0, 1, f"Analyzing: {video_filename}")
            
        total_duration = self.get_video_duration(video_path)
        
        if total_duration == 0:
            if progress_callback:
                progress_callback(video_index, total_videos, 0, 1, f"Error: Could not read {video_filename}")
            return False

        usable_duration = total_duration - skip_start - skip_end
        if usable_duration <= 0:
            if progress_callback:
                progress_callback(video_index, total_videos, 0, 1, f"Error: {video_filename} too short")
            return False

        # Calculate clips
        mode = config.get("mode", "auto")
        clips_data = []
        
        if mode == "watermark":
            clips_data.append({"start": skip_start, "end": max(skip_start + 1, total_duration - skip_end)})
        elif mode == "manual":
            timestamps_str = config.get("manual_timestamps", {}).get(video_path, "")
            if timestamps_str:
                pairs = [p.strip() for p in timestamps_str.split(',')]
                for p in pairs:
                    parts = p.split('-')
                    if len(parts) == 2:
                        try:
                            s_m, s_s = map(int, parts[0].split(':'))
                            e_m, e_s = map(int, parts[1].split(':'))
                            start_sec = s_m * 60 + s_s
                            end_sec = e_m * 60 + e_s
                            if end_sec > start_sec and start_sec < total_duration:
                                clips_data.append({"start": start_sec, "end": min(end_sec, total_duration)})
                        except:
                            pass
            if not clips_data:
                clips_data.append({"start": skip_start, "end": max(skip_start + 1, total_duration - skip_end)})
        elif mode in ["transcriber", "scriptwriter", "promptgenerator", "autocaptions", "autocutpro", "bulkimage"]:
            # AI Tools Process Entire Video as a single clip
            clips_data.append({"start": skip_start, "end": max(skip_start + 1, total_duration - skip_end)})
        else:
            current_time = skip_start
            while current_time < total_duration - skip_end:
                clip_dur = duration_seconds
                if variance > 0:
                    clip_dur += random.uniform(-variance, variance)
                
                end_time = min(current_time + clip_dur, total_duration - skip_end)
                if end_time - current_time > 1:  # Only add if clip > 1 sec
                    clips_data.append({"start": current_time, "end": end_time})
                    
                current_time += max(1, clip_dur - overlap_seconds)

        total_clips = len(clips_data)

        def ordinal(n):
            if 11 <= (n % 100) <= 13:
                suffix = 'th'
            else:
                suffix = ['th', 'st', 'nd', 'rd', 'th'][min(n % 10, 4)]
            return str(n) + suffix

        valid_logos = []
        if mode == "watermark":
            for l in config.get("logos", []):
                if os.path.exists(l.get("path", "")):
                    valid_logos.append(l)

        for i, clip in enumerate(clips_data):
            start_time = clip["start"]
            clip_dur = clip["end"] - clip["start"]
            
            if cancel_event and cancel_event.is_set():
                if progress_callback:
                    progress_callback(video_index, total_videos, i, total_clips, f"Cancelled: {video_filename}")
                return False

            # --- AI TOOLS PROCESSING LOGIC ---
            if mode == "transcriber":
                import subprocess
                whisper_cli = r"C:\Users\FIREFLY LAPTOP'S\Documents\AutoCutStudio_Extracted\bin\whisper\Release\whisper-cli.exe"
                whisper_model = r"C:\Users\FIREFLY LAPTOP'S\Documents\AutoCutStudio_Extracted\assets\whisper\models\ggml-small-q5_1.bin"
                
                temp_wav = os.path.join(output_folder, f"temp_{video_filename}.wav")
                
                if progress_callback:
                    progress_callback(video_index, total_videos, 1, 100, f"Extracting audio to 16kHz WAV...")
                
                # Extract Audio using FFmpeg
                subprocess.run([
                    self.ffmpeg_path, "-y", "-i", video_path, 
                    "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", temp_wav
                ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                
                if progress_callback:
                    progress_callback(video_index, total_videos, 50, 100, f"Running Whisper AI... (This may take a while)")
                    
                # Run Whisper
                output_prefix = os.path.join(output_folder, video_filename)
                subprocess.run([
                    whisper_cli, "-m", whisper_model, "-f", temp_wav, "-l", "auto", "-otxt", "-osrt", "-of", output_prefix
                ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                
                # Cleanup
                if os.path.exists(temp_wav):
                    os.remove(temp_wav)
                    
                if progress_callback:
                    progress_callback(video_index, total_videos, 100, 100, f"Transcription completed!")
                    
                continue # Skip standard ffmpeg logic
                
            elif mode == "scriptwriter":
                output_file_name = f"{video_filename}_viral_script.txt"
                output_file_path = os.path.join(output_folder, output_file_name)
                with open(output_file_path, "w", encoding="utf-8") as f:
                    f.write("VIRAL HOOK: Did you know this secret?\n")
                    f.write("STORY: Once upon a time in a world of AI...\n")
                    f.write("CALL TO ACTION: Subscribe for more!\n")
                continue
                
            elif mode == "promptgenerator":
                output_file_name = f"{video_filename}_midjourney_prompts.txt"
                output_file_path = os.path.join(output_folder, output_file_name)
                with open(output_file_path, "w", encoding="utf-8") as f:
                    f.write("/imagine prompt: cinematic shot of a glowing AI server room, 8k, photorealistic --ar 16:9\n")
                    f.write("/imagine prompt: a futuristic robot reading a script, cyberpunk lighting --ar 16:9\n")
                continue
                
            elif mode == "autocaptions" or mode == "autocutpro":
                # For captions/pro, we will generate a processed video using ffmpeg
                output_file_name = f"{video_filename}_{mode}.mp4"
                output_file_path = os.path.join(output_folder, output_file_name)
                # We will force re-encode to simulate processing
                needs_reencode = True
                has_logo = False
                
            elif mode == "bulkimage":
                output_file_name = f"{video_filename}_scene_image.jpg"
                output_file_path = os.path.join(output_folder, output_file_name)
                # Just extract a single frame to simulate image generation
                command = [
                    self.ffmpeg_path, "-y", "-ss", "00:00:01", "-i", video_path,
                    "-vframes", "1", "-q:v", "2", output_file_path
                ]
                subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=self.creationflags)
                continue
            
            else:
                # Default (Auto/Manual/Watermark)
                output_file_name = f"{ordinal(i + 1)} clip.mp4"
                if mode == "watermark":
                    output_file_name = f"{video_filename}_watermarked.mp4"
                output_file_path = os.path.join(output_folder, output_file_name)

            if progress_callback:
                progress_callback(video_index, total_videos, i, total_clips, f"Processing {video_filename} (Clip {i+1}/{total_clips})")

            command = [
                self.ffmpeg_path,
                "-y",
                "-ss", str(start_time),
                "-i", video_path
            ]
            
            if mode not in ["autocaptions", "autocutpro"]:
                has_logo = len(valid_logos) > 0
                if has_logo:
                    for logo in valid_logos:
                        command.extend(["-loop", "1", "-i", logo.get("path")])

            command.extend([
                "-t", str(clip_dur),
                "-avoid_negative_ts", "1",
                "-threads", "2"
            ])

            if mode in ["autocaptions", "autocutpro"]:
                # Basic re-encode to simulate heavy AI video processing
                command.extend(["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p"])
                command.extend(["-c:a", "copy"])
            else:
                needs_reencode = vertical_crop or normalize_audio or has_logo
                
                if needs_reencode:
                    if has_logo:
                        fc = []
                        curr_v = "[0:v]"
                        if vertical_crop:
                            fc.append(f"{curr_v}crop=ih*9/16:ih:iw/2-(ih*9/16)/2:0[v1]")
                            curr_v = "[v1]"
                        
                        for idx, logo in enumerate(valid_logos):
                            input_idx = idx + 1
                            size = logo.get("size", 150)
                            pos = logo.get("pos", "top_right")
                            try:
                                opacity = float(logo.get("opacity", 80)) / 100.0
                            except:
                                opacity = 0.8
                                
                            logo_scale_name = f"[logo_scaled_{idx}]"
                            fc.append(f"[{input_idx}:v]scale={size}:-2{logo_scale_name}")
                            
                            curr_logo = logo_scale_name
                            if opacity < 1.0:
                                logo_alpha_name = f"[logo_alpha_{idx}]"
                                fc.append(f"{curr_logo}format=rgba,colorchannelmixer=aa={opacity}{logo_alpha_name}")
                                curr_logo = logo_alpha_name
                                
                            overlay_str = "10:10"
                            if pos == "top_left": overlay_str = "10:10"
                            elif pos == "top_right": overlay_str = "main_w-overlay_w-10:10"
                            elif pos == "bottom_left": overlay_str = "10:main_h-overlay_h-10"
                            elif pos == "bottom_right": overlay_str = "main_w-overlay_w-10:main_h-overlay_h-10"
                            elif pos == "center": overlay_str = "(main_w-overlay_w)/2:(main_h-overlay_h)/2"
                            
                            next_v = f"[vout_{idx}]"
                            fc.append(f"{curr_v}{curr_logo}overlay={overlay_str}:shortest=1{next_v}")
                            curr_v = next_v

                        command.extend(["-filter_complex", ";".join(fc)])
                        command.extend(["-map", curr_v])
                        command.extend(["-map", "0:a?"])
                        command.extend(["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p"])
                    elif vertical_crop:
                        vfs = []
                        if vertical_crop:
                            vfs.append("crop=ih*9/16:ih:iw/2-(ih*9/16)/2:0")
                        
                        command.extend(["-vf", ",".join(vfs)])
                        command.extend(["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p"])
                    else:
                        command.extend(["-c:v", "copy"])

                    if normalize_audio:
                        command.extend(["-af", "loudnorm"])
                        command.extend(["-c:a", "aac"])
                    else:
                        command.extend(["-c:a", "copy"])
                else:
                    command.extend(["-c:v", "copy", "-c:a", "copy"])
            
            command.append(output_file_path)
            
            try:
                result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, creationflags=self.creationflags)
                if result.returncode != 0:
                    print(f"FFmpeg error: {result.stderr}")
                    return False
            except Exception as e:
                print(f"Subprocess Exception: {e}")
                return False
        
        if delete_original:
            try:
                os.remove(video_path)
            except Exception as e:
                print(f"Failed to delete original: {e}")

        if progress_callback:
            progress_callback(video_index, total_videos, total_clips, total_clips, f"Completed: {video_filename}")
            
        return True
