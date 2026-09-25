import os
import re

js_path = r"C:\Users\FIREFLY LAPTOP'S\Documents\AutoCutStudio_Extracted\assets\script-writer\app.js"
with open(js_path, "r", encoding="utf-8") as f:
    content = f.read()

bad_text = "Powers real transcripts, viral-outlier data and weekly similar-channel discovery. Just sign in with your Nexlev account — no API key needed. Without it the tool still works on free public data."
good_text = "Powers real transcripts, viral-outlier data and weekly similar-channel discovery. Just sign in with your account — no API key needed. Without it the tool still works on free public data."

content = content.replace(bad_text, good_text)
# Also fix the title if it says Nexlev
content = content.replace("<h4>🔍 Nexlev", "<h4>🔍 Data Engine")

with open(js_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Updated text.")
