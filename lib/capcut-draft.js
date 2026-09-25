/*
  Builds a CapCut desktop project ("draft") from an AutoCut Studio timeline.

  CapCut keeps every project as a folder of JSON files under its drafts root.
  The layout written here mirrors a project created by CapCut 9.4 itself:
  draft_content.json (the timeline) in the folder root and again inside
  Timelines/<timeline id>/, plus the small sidecar files CapCut expects.
  Media files are copied into the project folder so the draft keeps working
  after AutoCut's temporary files are cleaned up.
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const US = 1e6;                       // CapCut stores time in microseconds.
const PHOTO_MATERIAL_DURATION = 10800000000;
const CAPCUT_ROOT = path.join(process.env.LOCALAPPDATA || '', 'CapCut');
const DEFAULT_DRAFTS_ROOT = path.join(CAPCUT_ROOT, 'User Data', 'Projects', 'com.lveditor.draft');

const uid = () => crypto.randomUUID().toUpperCase();
const hex = () => crypto.randomBytes(16).toString('hex');
const us = (seconds) => Math.max(0, Math.round(Number(seconds || 0) * US));
const slash = (p) => String(p).replace(/\\/g, '/');

function capcutExecutable() {
  const exe = path.join(CAPCUT_ROOT, 'Apps', 'CapCut.exe');
  return fs.existsSync(exe) ? exe : '';
}

// CapCut lets users move the drafts folder; the active location is stored in
// its globalSetting file as currentCustomDraftPath=C:\\...\\com.lveditor.draft
function draftsRoot() {
  try {
    const settings = fs.readFileSync(path.join(CAPCUT_ROOT, 'User Data', 'Config', 'globalSetting'), 'utf8');
    const match = settings.match(/^currentCustomDraftPath=(.+)$/m);
    if (match) {
      const custom = match[1].trim().replace(/\\\\/g, '\\');
      if (custom && fs.existsSync(custom)) return custom;
    }
  } catch {}
  return DEFAULT_DRAFTS_ROOT;
}

function capcutStatus() {
  const root = draftsRoot();
  return { installed: !!capcutExecutable() || fs.existsSync(root), draftsRoot: root };
}

function isCapcutRunning() {
  return new Promise((resolve) => {
    const child = spawn('tasklist', ['/FI', 'IMAGENAME eq CapCut.exe', '/NH'], { windowsHide: true });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('error', () => resolve(false));
    child.on('close', () => resolve(/CapCut\.exe/i.test(out)));
  });
}

function launchCapcut() {
  const exe = capcutExecutable();
  if (!exe) return false;
  const child = spawn(exe, [], { detached: true, stdio: 'ignore', windowsHide: false });
  child.on('error', () => {});
  child.unref();
  return true;
}

function uniqueFolder(root, baseName) {
  const clean = String(baseName || 'AutoCut Project').replace(/[<>:"/\\|?*\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'AutoCut Project';
  let name = clean;
  for (let n = 2; fs.existsSync(path.join(root, name)); n++) name = `${clean} (${n})`;
  return name;
}

// ── Material / segment builders (field sets copied from CapCut 9.4 drafts) ──

function speedMaterial() { return { id: uid(), type: 'speed', mode: 0, speed: 1, curve_speed: null }; }
function placeholderInfo() { return { id: uid(), type: 'placeholder_info', meta_type: 'none', res_path: '', res_text: '', error_path: '', error_text: '' }; }
function canvasMaterial() { return { id: uid(), type: 'canvas_color', color: '', blur: 0, image: '', album_image: '', image_id: '', image_name: '', source_platform: 0, team_id: '' }; }
function animationMaterial() { return { id: uid(), type: 'sticker_animation', animations: [], multi_language_current: 'none' }; }
function soundChannelMapping() { return { id: uid(), type: 'none', audio_channel_mapping: 0, is_config_open: false }; }
function materialColor() { return { id: uid(), is_color_clip: false, is_gradient: false, solid_color: '', gradient_colors: [], gradient_percents: [], gradient_angle: 90, width: 0, height: 0 }; }
function vocalSeparation() { return { id: uid(), type: 'vocal_separation', choice: 0, removed_sounds: [], time_range: null, production_path: '', final_algorithm: '', enter_from: '' }; }
function beatMaterial() {
  return { id: uid(), type: 'beats', mode: 404, gear: 404, gear_count: 0, enable_ai_beats: false, user_beats: [], user_delete_ai_beats: null,
    ai_beats: { melody_url: '', melody_path: '', beats_url: '', beats_path: '', melody_percents: [0.0], beat_speed_infos: [] } };
}

function videoMaterial(media) {
  const photo = media.kind === 'photo';
  return {
    id: uid(), unique_id: hex(), type: photo ? 'photo' : 'video',
    duration: photo ? PHOTO_MATERIAL_DURATION : us(media.duration),
    path: slash(media.path), media_path: '', local_id: '', has_audio: !photo && media.hasAudio !== false,
    reverse_path: '', intensifies_path: '', reverse_intensifies_path: '', intensifies_audio_path: '', cartoon_path: '',
    width: media.width || 0, height: media.height || 0, category_id: '', category_name: 'local', material_id: '',
    material_name: path.basename(media.path), material_url: '',
    crop: { upper_left_x: 0, upper_left_y: 0, upper_right_x: 1, upper_right_y: 0, lower_left_x: 0, lower_left_y: 1, lower_right_x: 1, lower_right_y: 1 },
    crop_ratio: 'free', audio_fade: null, crop_scale: 1, extra_type_option: 0,
    stable: { stable_level: 0, matrix_path: '', time_range: { start: 0, duration: 0 } },
    matting: { flag: 0, path: '', interactiveTime: [], has_use_quick_brush: false, strokes: [], has_use_quick_eraser: false, expansion: 0, feather: 0, reverse: false, custom_matting_id: '', enable_matting_stroke: false, is_clould: false, mask_video_path: '', cloud_product_fps: 0 },
    source: 0, source_platform: 0, formula_id: '', check_flag: 62978047,
    video_algorithm: { algorithms: [], time_range: null, path: '', gameplay_configs: [], ai_in_painting_config: [], complement_frame_config: null, motion_blur_config: null, deflicker: null, noise_reduction: null, quality_enhance: null, super_resolution: null, ai_background_configs: [], smart_complement_frame: null, aigc_generate: null, aigc_generate_list: [], mouth_shape_driver: null, ai_expression_driven: null, ai_motion_driven: null, image_interpretation: null, story_video_modify_video_config: { task_id: '', is_overwrite_last_video: false, tracker_task_id: '', generate_id: '', generate_card_id: '' }, skip_algorithm_index: [] },
    is_unified_beauty_mode: false, is_set_beauty_mode: false, object_locked: null, smart_motion: null, multi_camera_info: null, freeze: null,
    picture_from: 'none', picture_set_category_id: '', picture_set_category_name: '', team_id: '', local_material_id: '', origin_material_id: '',
    request_id: '', has_sound_separated: false, is_text_edit_overdub: false, is_ai_generate_content: false, aigc_type: 'none', is_copyright: false,
    aigc_history_id: '', aigc_item_id: '', local_material_from: '', smart_match_info: null, beauty_face_preset_infos: [], beauty_body_preset_id: '',
    beauty_face_auto_preset: { preset_id: '', name: '', rate_map: '', scene: '' }, beauty_face_auto_preset_infos: [], beauty_body_auto_preset: null,
    live_photo_timestamp: -1, live_photo_cover_path: '', content_feature_info: null, corner_pin: null, surface_trackings: [],
    video_mask_stroke: { resource_id: '', path: '', type: '', color: '', size: 0, alpha: 0, distance: 0, texture: 0, horizontal_shift: 0, vertical_shift: 0 },
    video_mask_shadow: { resource_id: '', path: '', color: '', alpha: 0, blur: 0, distance: 0, angle: 0 },
    pre_applied_vip_materials: [], workflow_node_id: ''
  };
}

function audioMaterial(media) {
  return {
    id: uid(), unique_id: hex(), type: 'extract_music', name: path.basename(media.path), duration: us(media.duration),
    path: slash(media.path), category_name: 'local', wave_points: [], music_id: crypto.randomUUID(), app_id: 0, text_id: '', tone_type: '',
    source_platform: 0, video_id: '', effect_id: '', resource_id: '', third_resource_id: '', category_id: '', intensifies_path: '',
    formula_id: '', check_flag: 1, team_id: '', local_material_id: '', tone_speaker: '', mock_tone_speaker: '', tone_effect_id: '',
    tone_effect_name: '', tone_platform: '', cloned_model_type: '', tone_category_id: '', tone_category_name: '', tone_second_category_id: '',
    tone_second_category_name: '', tone_emotion_name_key: '', tone_emotion_style: '', tone_emotion_role: '', tone_emotion_selection: '',
    tone_emotion_scale: 0, moyin_emotion: '', request_id: '', query: '', search_id: '', sound_separate_type: '', is_text_edit_overdub: false,
    is_ugc: false, is_ai_clone_tone: false, is_ai_clone_tone_post: false, source_from: '', copyright_limit_type: 'none', aigc_history_id: '',
    aigc_item_id: '', music_source: '', pgc_id: '', pgc_name: '', similiar_music_info: { original_song_id: '', original_song_name: '' },
    ai_music_type: 0, ai_music_enter_from: '', lyric_type: 0, tts_task_id: '', tts_generate_scene: '', ai_music_generate_scene: 0,
    tts_benefit_info: { benefit_type: 'none', benefit_log_id: '', benefit_log_extra: '', benefit_amount: -1 }
  };
}

function hexToRgb(color, fallback) {
  const m = String(color || '').trim().match(/^#?([0-9a-f]{6})$/i);
  const value = m ? m[1] : fallback;
  return [0, 2, 4].map((i) => Math.round(parseInt(value.slice(i, i + 2), 16) / 255 * 1000) / 1000);
}

function textMaterial(text, style) {
  const fill = hexToRgb(style.color, 'ffffff');
  const stroke = hexToRgb(style.strokeColor, '000000');
  const size = style.size;
  const content = {
    text,
    styles: [{
      fill: { alpha: 1, content: { render_type: 'solid', solid: { alpha: 1, color: fill } } },
      font: { id: '', path: '' },
      size,
      bold: true,
      strokes: style.strokeWidth > 0 ? [{ alpha: 1, content: { render_type: 'solid', solid: { alpha: 1, color: stroke } }, width: style.strokeWidth }] : [],
      range: [0, text.length],
      useLetterColor: true
    }]
  };
  return {
    recognize_task_id: '', id: uid(), name: '', recognize_text: '', recognize_model: '', punc_model: '', type: 'subtitle',
    content: JSON.stringify(content), base_content: '',
    words: { start_time: [], end_time: [], text: [] }, current_words: { start_time: [], end_time: [], text: [] },
    global_alpha: 1, combo_info: { text_templates: [] },
    caption_template_info: { resource_id: '', third_resource_id: '', resource_name: '', category_id: '', category_name: '', effect_id: '', request_id: '', path: '', is_new: false, source_platform: 0 },
    layer_weight: 1, letter_spacing: 0, text_curve: null, text_loop_on_path: false, offset_on_path: 0, enable_path_typesetting: false,
    text_exceeds_path_process_type: 0, text_typesetting_paths: null, text_typesetting_paths_file: '', text_typesetting_path_index: 0,
    line_spacing: 0.02, has_shadow: false, shadow_color: '', shadow_alpha: 0.9, shadow_smoothing: 0.45, shadow_distance: 5,
    shadow_point: { x: 0.6363961030678928, y: -0.6363961030678928 }, shadow_angle: -45, shadow_thickness_projection_enable: false,
    shadow_thickness_projection_angle: 0, shadow_thickness_projection_distance: 0,
    border_alpha: 1, border_color: style.strokeWidth > 0 ? '#' + stroke.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('') : '',
    border_width: style.strokeWidth, border_mode: 0, style_name: '',
    text_color: '#' + fill.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join(''), text_alpha: 1,
    font_name: '', font_title: 'none', font_size: size, font_path: '', font_id: '', font_resource_id: '', initial_scale: 1, font_url: '',
    typesetting: 0, alignment: style.alignment, line_feed: 1, use_effect_default_color: false, is_rich_text: false, shape_clip_x: false,
    shape_clip_y: false, ktv_color: '', text_to_audio_ids: [], bold_width: 0.008, italic_degree: 0, underline: false, underline_width: 0.05,
    underline_offset: 0.22, sub_type: 0, check_flag: 7, text_size: 30, font_category_name: '', font_source_platform: 0,
    font_third_resource_id: '', font_category_id: '', add_type: 0, operation_type: 0, recognize_type: 0, fonts: [],
    background_color: '', background_alpha: 1, background_style: 0, background_round_radius: 0, background_width: 0.14,
    background_height: 0.14, background_vertical_offset: 0, background_horizontal_offset: 0, background_fill: '',
    single_char_bg_enable: false, single_char_bg_color: '', single_char_bg_alpha: 1, single_char_bg_round_radius: 0.3,
    single_char_bg_width: 0, single_char_bg_height: 0, single_char_bg_vertical_offset: 0, single_char_bg_horizontal_offset: 0,
    font_team_id: '', tts_auto_update: false, text_preset_resource_id: '', group_id: '', preset_id: '', preset_name: '',
    preset_category: '', preset_category_id: '', preset_index: 0, preset_has_set_alignment: false, force_apply_line_max_width: false,
    language: '', relevance_segment: [], original_size: [], fixed_width: -1, fixed_height: -1, autoAdaptCanvasEnabled: false,
    line_max_width: 0.82, oneline_cutoff: false, cutoff_postfix: '', subtitle_template_original_fontsize: 0, subtitle_keywords: null,
    inner_padding: -1, multi_language_current: 'none', source_from: '', is_lyric_effect: false, lyric_group_id: '',
    lyrics_template: { resource_id: '', resource_name: '', panel: '', effect_id: '', path: '', category_id: '', category_name: '', request_id: '' },
    is_batch_replace: false, is_words_linear: false, ssml_content: '', subtitle_keywords_config: null, sub_template_id: -1, translate_original_text: ''
  };
}

function segment(fields) {
  const visual = fields.kind !== 'audio';
  return {
    id: uid(),
    source_timerange: fields.source || null,
    target_timerange: fields.target,
    render_timerange: { start: 0, duration: 0 },
    desc: '', state: 0, speed: 1, is_loop: false, is_tone_modify: false, reverse: false, intensifies_audio: false, cartoon: false,
    volume: fields.volume ?? 1, last_nonzero_volume: 1,
    clip: visual ? {
      scale: { x: fields.scale ?? 1, y: fields.scale ?? 1 }, rotation: fields.rotation || 0,
      transform: { x: fields.x || 0, y: fields.y || 0 }, flip: { vertical: false, horizontal: false }, alpha: fields.alpha ?? 1
    } : null,
    uniform_scale: visual ? { on: true, value: 1 } : null,
    material_id: fields.materialId, extra_material_refs: fields.refs,
    render_index: fields.renderIndex || 0, keyframe_refs: [],
    enable_lut: fields.kind === 'video', enable_adjust: fields.kind === 'video', enable_hsl: false, visible: true, group_id: '',
    enable_color_curves: true, enable_hsl_curves: true, track_render_index: fields.trackIndex || 0,
    hdr_settings: fields.kind === 'video' ? { mode: 1, intensity: 1, nits: 1000 } : null,
    enable_color_wheels: true, track_attribute: fields.mainTrack ? 1 : 0, is_placeholder: false, template_id: '',
    enable_smart_color_adjust: false, template_scene: 'default', common_keyframes: commonKeyframes(fields.keyframes, fields.target.duration), caption_info: null,
    responsive_layout: { enable: false, target_follow: '', size_layout: 0, horizontal_pos_layout: 0, vertical_pos_layout: 0 },
    enable_color_match_adjust: false, enable_color_correct_adjust: false, enable_adjust_mask: false, raw_segment_id: '',
    lyric_keyframes: null, enable_video_mask: true, digital_human_template_group_id: '', color_correct_alg_result: '',
    source: 'segmentsourcenormal', enable_mask_stroke: false, enable_mask_shadow: false, enable_color_adjust_pro: false, segment_color_tag: ''
  };
}

// AutoCut sends sampled motion as { scale|x|y|rotation|alpha: [[seconds, value], ...] }.
// CapCut interpolates linearly between keyframes, so dense enough samples
// reproduce AutoCut's eased zoom/pan curves.
const KEYFRAME_TYPES = { scale: 'KFTypeScaleX', x: 'KFTypePositionX', y: 'KFTypePositionY', rotation: 'KFTypeRotation', alpha: 'KFTypeAlpha' };
function commonKeyframes(keyframes, durationUs) {
  const out = [];
  for (const [prop, type] of Object.entries(KEYFRAME_TYPES)) {
    const points = keyframes?.[prop];
    if (!Array.isArray(points) || points.length < 2) continue;
    out.push({
      id: uid(), material_id: '', property_type: type,
      keyframe_list: points.map(([time, v]) => ({
        id: uid(), curveType: 'Line', time_offset: Math.min(Math.max(0, durationUs - 1), us(time)),
        left_control: { x: 0, y: 0 }, right_control: { x: 0, y: 0 }, values: [Number(v) || 0], string_value: '', graphID: ''
      }))
    });
  }
  return out;
}

function track(type, name) {
  return { id: uid(), type, segments: [], flag: 0, attribute: 0, name: name || '', is_default_name: !name };
}

function emptyMaterials() {
  const keys = ['flowers', 'videos', 'tail_leaders', 'audios', 'images', 'texts', 'effects', 'stickers', 'canvases', 'transitions',
    'audio_effects', 'audio_fades', 'beats', 'material_animations', 'placeholders', 'placeholder_infos', 'speeds', 'common_mask',
    'chromas', 'text_templates', 'realtime_denoises', 'audio_pannings', 'audio_pitch_shifts', 'video_trackings', 'hsl', 'drafts',
    'color_curves', 'hsl_curves', 'primary_color_wheels', 'log_color_wheels', 'video_effects', 'ai_text_effects', 'audio_balances',
    'handwrites', 'manual_deformations', 'manual_beautys', 'plugin_effects', 'sound_channel_mappings', 'green_screens', 'shapes',
    'material_colors', 'digital_humans', 'digital_human_model_dressing', 'smart_crops', 'ai_translates', 'audio_track_indexes',
    'loudnesses', 'vocal_beautifys', 'vocal_separations', 'smart_relights', 'time_marks', 'multi_language_refs', 'video_shadows',
    'video_strokes', 'video_radius'];
  return Object.fromEntries(keys.map((k) => [k, []]));
}

function platformInfo() {
  return { os: 'windows', os_version: '10.0.19045', app_id: 359289, app_version: '9.4.0', app_source: 'cc', device_id: '', hard_disk_id: '', mac_address: '' };
}

/*
  plan = {
    width, height, fps,
    visualTracks: [{ name, main, items: [{ media, start, duration, sourceOffset, scale, x, y, rotation, alpha }] }],
    audioTracks:  [{ name, items: [{ media, start, duration, sourceOffset, volume }] }],
    captions:     { items: [{ start, end, text }], style: { size, color, strokeColor, strokeWidth, alignment, y } } | null
  }
  media = { path, kind: 'photo'|'video'|'audio', width, height, duration, hasAudio }
*/
function buildDraftContent(plan, timelineId) {
  const materials = emptyMaterials();
  const tracks = [];
  const materialFor = new Map();
  let total = 0;

  const addRefs = (list) => list.map((m) => {
    const key = { speed: 'speeds', placeholder_info: 'placeholder_infos', canvas_color: 'canvases', sticker_animation: 'material_animations',
      none: 'sound_channel_mappings', vocal_separation: 'vocal_separations', beats: 'beats' }[m.type] || 'material_colors';
    materials[key].push(m);
    return m.id;
  });

  plan.visualTracks.forEach((visual, trackIndex) => {
    const t = track('video', visual.main ? '' : visual.name);
    for (const item of visual.items) {
      const media = item.media;
      let material = materialFor.get(media.path);
      if (!material) { material = videoMaterial(media); materials.videos.push(material); materialFor.set(media.path, material); }
      const duration = us(item.duration);
      const start = us(item.start);
      total = Math.max(total, start + duration);
      const refs = addRefs([speedMaterial(), placeholderInfo(), canvasMaterial(), animationMaterial(), soundChannelMapping(), materialColor(), vocalSeparation()]);
      t.segments.push(segment({
        kind: 'video', materialId: material.id, refs, mainTrack: visual.main, trackIndex,
        renderIndex: visual.main ? 0 : 10000 + trackIndex,
        source: { start: media.kind === 'photo' ? 0 : us(item.sourceOffset), duration },
        target: { start, duration },
        volume: media.kind === 'video' ? (item.volume ?? 1) : 0,
        scale: item.scale, x: item.x, y: item.y, rotation: item.rotation, alpha: item.alpha, keyframes: item.keyframes
      }));
    }
    if (t.segments.length) tracks.push(t);
  });

  plan.audioTracks.forEach((audio, index) => {
    const t = track('audio', audio.name);
    for (const item of audio.items) {
      const media = item.media;
      let material = materialFor.get(media.path);
      if (!material) { material = audioMaterial(media); materials.audios.push(material); materialFor.set(media.path, material); }
      const duration = us(item.duration);
      const start = us(item.start);
      total = Math.max(total, start + duration);
      const refs = addRefs([speedMaterial(), placeholderInfo(), beatMaterial(), soundChannelMapping(), vocalSeparation()]);
      t.segments.push(segment({
        kind: 'audio', materialId: material.id, refs, trackIndex: plan.visualTracks.length + index,
        source: { start: us(item.sourceOffset), duration }, target: { start, duration }, volume: item.volume ?? 1
      }));
    }
    if (t.segments.length) tracks.push(t);
  });

  if (plan.captions?.items?.length) {
    const t = track('text', 'AutoCut Captions');
    const style = { size: 7, color: '#FFFFFF', strokeColor: '#000000', strokeWidth: 0.08, alignment: 1, y: -0.66, ...plan.captions.style };
    for (const cue of plan.captions.items) {
      const start = us(cue.start);
      const duration = us(cue.end) - start;
      if (duration <= 0 || !cue.text) continue;
      const material = textMaterial(cue.text, style);
      materials.texts.push(material);
      const refs = addRefs([animationMaterial()]);
      total = Math.max(total, start + duration);
      t.segments.push(segment({
        kind: 'text', materialId: material.id, refs, trackIndex: tracks.length, renderIndex: 14000,
        target: { start, duration }, scale: 1, x: 0, y: style.y
      }));
    }
    if (t.segments.length) tracks.push(t);
  }

  return {
    id: timelineId, version: 360000, new_version: '185.0.0', name: '', duration: total, create_time: 0, update_time: 0,
    fps: Number(plan.fps) || 30, is_drop_frame_timecode: false, color_space: 0,
    config: { video_mute: false, record_audio_last_index: 1, extract_audio_last_index: 1, original_sound_last_index: 1, subtitle_recognition_id: '', subtitle_taskinfo: [], lyrics_recognition_id: '', lyrics_taskinfo: [], subtitle_sync: true, lyrics_sync: true, voice_change_sync: false, sticker_max_index: 1, adjust_max_index: 1, material_save_mode: 0, export_range: null, maintrack_adsorb: true, combination_max_index: 1, attachment_info: [], zoom_info_params: null, system_font_list: [], multi_language_mode: 'none', multi_language_main: 'none', multi_language_current: 'none', multi_language_list: [], subtitle_keywords_config: null, use_float_render: false, hdr_vivid: false },
    canvas_config: { ratio: 'original', width: plan.width, height: plan.height, background: null },
    tracks, group_container: null, materials,
    keyframes: { videos: [], audios: [], texts: [], stickers: [], filters: [], adjusts: [], handwrites: [], effects: [] },
    keyframe_graph_list: [], platform: platformInfo(), last_modified_platform: platformInfo(),
    mutable_config: null, cover: null, retouch_cover: null, extra_info: null, relationships: [], mixed_track_mode_on: false,
    render_index_track_mode_on: true, free_render_index_mode_on: false, static_cover_image_path: '', source: 'default', time_marks: null,
    path: '', lyrics_effects: [], uneven_animation_template_info: { composition: '', content: '', order: '', sub_template_info_list: [] },
    draft_type: 'video', smart_ads_info: { page_from: '', routine: '', draft_url: '' },
    function_assistant_info: { smart_rec_applied: false, fixed_rec_applied: false, auto_adjust: false, auto_adjust_segid_list: [], color_correction: false, color_correction_segid_list: [], enhance_quality: false, smooth_slow_motion: false, deflicker_segid_list: [], video_noise_segid_list: [], enhance_quality_segid_list: [], smart_segid_list: [], retouch: false, retouch_segid_list: [], enhande_voice: false, enhance_voice_segid_list: [], audio_noise_segid_list: [], auto_caption: false, auto_caption_segid_list: [], auto_caption_template_id: '', caption_opt: false, caption_opt_segid_list: [], eye_correction: false, eye_correction_segid_list: [], normalize_loudness: false, normalize_loudness_segid_list: [], normalize_loudness_audio_denoise_segid_list: [], auto_adjust_fixed: false, auto_adjust_fixed_value: 50.0, color_correction_fixed: false, color_correction_fixed_value: 50.0, normalize_loudness_fixed: false, enhande_voice_fixed: false, retouch_fixed: false, enhance_quality_fixed: false, smooth_slow_motion_fixed: false, fps: { num: 0, den: 1 } }
  };
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value), 'utf8');
}

/*
  Writes the project folder. `plan` media paths must already point at files
  inside `folder` (see createCapcutProject). Returns the draft summary.
*/
function writeDraft(folder, draftName, plan, root) {
  const timelineId = uid();
  const draftId = uid();
  const nowUs = Date.now() * 1000;
  const nowS = Math.floor(Date.now() / 1000);
  const content = buildDraftContent(plan, timelineId);
  const timelineDir = path.join(folder, 'Timelines', timelineId);

  for (const dir of [folder, timelineDir]) {
    writeJson(path.join(dir, 'draft_content.json'), content);
    writeJson(path.join(dir, 'draft_content.json.bak'), content);
    writeJson(path.join(dir, 'common_attachment', 'attachment_id_mapping.json'), { id_mapping: { mapping: [], next_index: 1001, version: '1.0.0' } });
    writeJson(path.join(dir, 'common_attachment', 'attachment_pc_timeline.json'), { reference_lines_config: { horizontal_lines: [], is_lock: false, is_visible: false, vertical_lines: [] }, safe_area_type: 0 });
    writeJson(path.join(dir, 'attachment_pc_common.json'), { ai_packaging_infos: [], ai_packaging_report_info: { caption_id_list: [], commercial_material: '', material_source: '', method: '', page_from: '', style: '', task_id: '', text_style: '', tos_id: '', video_category: '' }, broll: { ai_packaging_infos: [], ai_packaging_report_info: { caption_id_list: [], commercial_material: '', material_source: '', method: '', page_from: '', style: '', task_id: '', text_style: '', tos_id: '', video_category: '' } }, commercial_music_category_ids: [], pc_feature_flag: 0, recognize_tasks: [], reference_lines_config: { horizontal_lines: [], is_lock: false, is_visible: false, vertical_lines: [] }, safe_area_type: 0, template_item_infos: [], unlock_template_ids: [] });
  }
  writeJson(path.join(timelineDir, 'common_attachment', 'attachment_action_scene.json'), { action_scene: { removed_segments: [], segment_infos: [] } });
  writeJson(path.join(timelineDir, 'common_attachment', 'attachment_plugin_draft.json'), { plugin_draft: { plugin_segments: [], version: '1.0.0' } });

  const project = { config: { color_space: -1, hdr_vivid: false, mixed_track_mode_on: false, render_index_track_mode_on: false, use_float_render: false }, create_time: nowUs, id: uid(), main_timeline_id: timelineId, timelines: [{ create_time: nowUs, id: timelineId, is_marked_delete: false, name: 'Timeline 01', update_time: nowUs }], update_time: nowUs, version: 0 };
  writeJson(path.join(folder, 'Timelines', 'project.json'), project);
  writeJson(path.join(folder, 'Timelines', 'project.json.bak'), project);
  writeJson(path.join(folder, 'timeline_layout.json'), { dockItems: [{ dockIndex: 0, ratio: 1, timelineIds: [timelineId], timelineNames: ['Timeline 01'] }], layoutOrientation: 1 });
  fs.writeFileSync(path.join(folder, 'draft_biz_config.json'), JSON.stringify({ timeline_settings: { [timelineId]: { linkage_enabled: false } } }, null, 4), 'utf8');
  writeJson(path.join(folder, 'draft_agency_config.json'), { is_auto_agency_enabled: false, is_auto_agency_popup: false, is_single_agency_mode: false, marterials: null, use_converter: false, video_resolution: 720 });
  writeJson(path.join(folder, 'performance_opt_info.json'), { manual_cancle_precombine_segs: null, need_auto_precombine_segs: null });
  writeJson(path.join(folder, 'draft_virtual_store.json'), { draft_materials: [], draft_virtual_store: [{ type: 0, value: [{ creation_time: 0, display_name: '', filter_type: 0, id: '', import_time: 0, import_time_us: 0, material_color_tag: '', sort_sub_type: 0, sort_type: 0, subdraft_filter_type: 0 }] }, { type: 1, value: [] }, { type: 2, value: [] }] });
  fs.writeFileSync(path.join(folder, 'draft_settings'), `[General]\ndraft_create_time=${nowS}\ndraft_last_edit_time=${nowS}\nreal_edit_seconds=0\nreal_edit_keys=0\n`, 'utf8');

  const meta = {
    cloud_draft_cover: false, cloud_draft_sync: false, cloud_package_completed_time: '', draft_cloud_capcut_purchase_info: '',
    draft_cloud_last_action_download: false, draft_cloud_package_type: '', draft_cloud_purchase_info: '', draft_cloud_template_id: '',
    draft_cloud_tutorial_info: '', draft_cloud_videocut_purchase_info: '', draft_cover: 'draft_cover.jpg', draft_deeplink_url: '',
    draft_enterprise_info: { draft_enterprise_extra: '', draft_enterprise_id: '', draft_enterprise_name: '', enterprise_material: [] },
    draft_fold_path: slash(folder), draft_has_unfinished_aigc_video_effect: false, draft_id: draftId, draft_is_ae_produce: false,
    draft_is_ai_packaging_used: false, draft_is_ai_shorts: false, draft_is_ai_translate: false, draft_is_article_video_draft: false,
    draft_is_cloud_temp_draft: false, draft_is_from_deeplink: 'false', draft_is_infinite_canvas_draft: false, draft_is_invisible: false,
    draft_is_pippit_draft: false, draft_is_web_article_video: false,
    draft_materials: [{ type: 0, value: [] }, { type: 1, value: [] }, { type: 2, value: [] }, { type: 3, value: [] }, { type: 6, value: [] }, { type: 7, value: [] }, { type: 8, value: [] }],
    draft_materials_copied_info: [], draft_name: draftName, draft_need_rename_folder: false, draft_new_version: '',
    draft_removable_storage_device: '', draft_root_path: root.replace(/\//g, '\\'), draft_segment_extra_info: [],
    draft_timeline_materials_size_: 0, draft_type: '', draft_web_article_video_enter_from: '', pippit_avatar_url: '', pippit_extra_info: '',
    pippit_id: '', pippit_user_name: '', tm_draft_cloud_completed: '', tm_draft_cloud_entry_id: -1, tm_draft_cloud_modified: 0,
    tm_draft_cloud_parent_entry_id: -1, tm_draft_cloud_space_id: -1, tm_draft_cloud_user_id: -1,
    tm_draft_create: nowUs, tm_draft_modified: nowUs, tm_draft_removed: 0, tm_duration: content.duration
  };
  writeJson(path.join(folder, 'draft_meta_info.json'), meta);
  return { draftId, timelineId, duration: content.duration / US, tracks: content.tracks.length, segments: content.tracks.reduce((n, t) => n + t.segments.length, 0) };
}

module.exports = { capcutStatus, draftsRoot, uniqueFolder, writeDraft, buildDraftContent, isCapcutRunning, launchCapcut, capcutExecutable };
