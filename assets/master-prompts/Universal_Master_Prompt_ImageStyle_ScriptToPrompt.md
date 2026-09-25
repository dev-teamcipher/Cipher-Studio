
Tum ek Expert Visual Style Analyst ho. Maine tumhein kuch reference 
images attach ki hain (competitor YouTube content se). Tumhara kaam 
hai in images ka ek COMPLETE aur UNIVERSAL style breakdown banana — 
is tarah ke ki yeh breakdown kisi bhi future script (kisi bhi topic, 
era, ya setting) pe apply ho sake.

Apna analysis do categories mein todo:

### A) CONSTANTS (yeh har image mein fix rahenge, kabhi change nahi honge):
- Character design: head shape, face features, body/limb style, 
  proportions, outline/linework style
- Rendering style: flat vs painterly, digital vs hand-drawn, 
  texture, brush quality
- Color palette: saturation level, tone family, contrast approach
- Composition rules: framing patterns, symmetry usage, focal point rules
- Any recurring visual "signature" elements specific to this style

### B) VARIABLES (yeh script ke content ke hisaab se badlenge):
- Setting/era/location
- Lighting mood (banao ek "Lighting-to-Emotion" mapping table)
- Character count aur arrangement (banao ek "Arrangement-to-Meaning" 
  mapping table)
- Action/pose
- Props aur environmental storytelling details

Analysis do, phir RUK JAO aur mujhse poochho: "Kya yeh style analysis 
sahi hai? Reply karo 'yes', 'ok', ya 'continue' agle step ke liye."

Jab tak main confirm na karoon, aage mat badhna.
```

Reference images attach karke yeh prompt bhejo. AI ka analysis check 
karo, aur agar theek lage, "yes" ya "continue" bol do.

---

## 📋 STEP 2 — Confirmation Ke Baad Yeh Instruction Do (Copy-Paste Karo)

Confirm karne ke baad, isi chat mein yeh doosra prompt paste karo:

```
Perfect. Ab tum mujhe koi image prompt nahi banaoge. Iske bajaye, 
tum mujhe ek COMPLETE, STANDALONE, REUSABLE "STYLE MASTER PROMPT" 
bana kar doge — jisko main copy karke save kar loonga, aur future 
mein kisi bhi AI tool (ChatGPT, Claude, Gemini, Groq, ya kisi bhi 
Whisper-based script tool) ko doonga taake wo mere liye timestamped 
scripts ko image prompts mein convert kare — bina in reference 
images ko dobara dekhe, kyunki poora style ab is master prompt ke 
andar likha hoga.

Yeh Style Master Prompt EXACTLY yeh structure follow karega:

═══════════════════════════════════════
[SECTION 1: ROLE INSTRUCTION]
═══════════════════════════════════════
Ek instruction likho jo kisi bhi AI ko batae ke wo ek "Timestamped 
Script-to-Image-Prompt Converter" hai is specific visual style ke 
liye.

═══════════════════════════════════════
[SECTION 2: FIXED STYLE — CONSTANTS BLOCK]
═══════════════════════════════════════
Apni Phase 1 ki CONSTANTS analysis (character design, rendering 
style, color palette, composition rules) ko ek fixed, word-for-word, 
copy-paste-ready TEXT BLOCK mein likho. Yeh block har image prompt 
mein hooba-hoo (exactly same) use hoga — koi bhi AI isko kabhi 
reword ya change nahi karega.

═══════════════════════════════════════
[SECTION 3: VARIABLE EXTRACTION RULES]
═══════════════════════════════════════
Apni Phase 1 ki VARIABLES analysis (setting, lighting-to-emotion 
mapping, arrangement-to-meaning mapping, action, props) ko clear 
RULES ke roop mein likho — taake koi bhi AI in rules ko follow 
karke script ke har segment se yeh variables khud extract kar sake.

═══════════════════════════════════════
[SECTION 4: STRICT PROCESSING RULES]
═══════════════════════════════════════
Yeh non-negotiable rules explicitly likho:

1. **ZERO TIMESTAMP MISSING RULE (sabse important)**: Script mein 
   jitne bhi timestamps maujood hain, un SABKA ek-ek prompt banega 
   — koi bhi timestamp skip, merge, ya ignore NAHI hoga, chahe wo 
   segment kitna bhi chhota ya repetitive kyun na lage. Agar script 
   mein 50 timestamps hain, toh output mein bhi exactly 50 prompts 
   honge — ginti match honi chahiye.
2. Timestamps ko unki EXISTING original form mein hi use karo — 
   naye timestamps mat banao, na hi combine karo.
3. Har prompt is exact format mein hoga:
   [TIMESTAMP]
   Prompt: [complete constant block — na kam na zyada] + [is scene 
   ke liye extracted variable block]
   ---
4. Prompts ke beech koi extra commentary, explanation, ya heading 
   nahi — sirf clean timestamp-tagged prompts, taake seedha copy 
   karke image tool mein paste ho sakein.
5. Agar kisi timestamp ka context unclear ho, AI apna best judgment 
   surrounding scenes se lega — ruk kar clarification NAHI maangega, 
   processing kabhi rukni nahi chahiye.
6. Processing ke END mein, AI ek chhota SELF-CHECK line dega: 
   "Total timestamps found in script: X | Total prompts generated: 
   X" — taake user turant verify kar sake ke koi timestamp miss 
   toh nahi hua.

═══════════════════════════════════════
[SECTION 5: INPUT SECTION]
═══════════════════════════════════════
Master prompt ke sabse AKHIR mein ek clearly marked INPUT SECTION 
likho, is exact format mein:

--- PASTE YOUR TIMESTAMPED SCRIPT BELOW THIS LINE ---
[yahan khali chodo]
--- END OF SCRIPT ---

Poora Style Master Prompt ek hi continuous copy-paste-able block 
mein do, taake main isko as-is kahin save kar sakoon.
```

---

## ✅ Result — Tumhare Paas Ab Kya Hoga

Is poore process ke baad, tumhare paas ek **single, self-contained 
Style Master Prompt** hoga jo dikhega kuch aisa (structure ka example, 
actual content tumhari specific style ke hisaab se AI banayega):

```
Tum ek "Timestamped Script-to-Image-Prompt Converter" ho, [style 
name] visual style ke liye.

[FIXED STYLE BLOCK — hamesha same, character design + rendering + 
color + composition ki poori detail]

[VARIABLE EXTRACTION RULES — setting/lighting/arrangement/action/
props kaise script se nikalne hain]

STRICT RULES:
- Koi bhi timestamp miss nahi hoga
- Original timestamps hi use karenge
- Format: [TIMESTAMP] \n Prompt: ... \n ---
- Koi extra commentary nahi
- Unclear context = best judgment, ruknа nahi
- End mein: "Total timestamps found: X | Total prompts generated: X"

--- PASTE YOUR TIMESTAMPED SCRIPT BELOW THIS LINE ---

--- END OF SCRIPT ---
```

**Yehi final block tum kahin bhi save kar loge** (Notion, Google Doc, 
Notepad, WhatsApp saved messages — jahan bhi convenient ho).

---

## 🔁 Future Mein Har Baar Jab Video Banani Ho (Daily Use Workflow)

| Step | Action |
|---|---|
| 1 | Apna saved **Style Master Prompt** kholo |
| 2 | Uske INPUT SECTION mein apni nayi timestamped script paste karo |
| 3 | Poora block (Master Prompt + tumhari script) copy karo |
| 4 | Kisi bhi AI tool mein paste karo — ChatGPT, Claude, Gemini, Groq, ya koi bhi Whisper-based transcription-to-prompt tool |
| 5 | AI tumhein har timestamp ka ek ready prompt dega + end mein "Total timestamps found: X | Total prompts generated: X" wala verification line |
| 6 | Verification line check karo — agar numbers match karte hain, koi timestamp miss nahi hua |
| 7 | Har prompt ko directly Midjourney/Ideogram/Nano Banana mein copy-paste karo |

---

## ⚠️ Important Notes

- **Reference images sirf ek baar chahiye** — Style Analysis (Step 1-2) karte waqt. Uske baad, jab bhi tum Style Master Prompt use karoge future scripts ke liye, images ki zaroorat NAHI — style ab text mein permanently encode ho chuka hai.
- **Har naye competitor style ke liye ek naya Style Master Prompt banao** — agar tumhare multiple faceless channels alag-alag visual styles use karte hain, har channel ka apna separate Style Master Prompt file rakho (naming: `StyleMasterPrompt_Channel1.txt`, etc.)
- **Verification line ("Total timestamps found: X | Total prompts generated: X") kabhi skip mat hone do** — agar tumhara AI tool yeh line nahi de raha, use reminder do ke yeh strictly Section 4 ka rule hai.
- Agar kisi AI tool (jaise kuch free/lightweight tools) timestamps miss karta hai bawajood rule ke, use bolo: "Recount karo — script mein total kitne timestamps hain, aur unhi ki ginti match honi chahiye prompts se."

-