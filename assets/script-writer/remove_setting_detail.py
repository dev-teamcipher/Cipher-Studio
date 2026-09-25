import os

js_path = r"C:\Users\FIREFLY LAPTOP'S\Documents\AutoCutStudio_Extracted\assets\script-writer\app.js"
with open(js_path, "r", encoding="utf-8") as f:
    content = f.read()

bad_text = '<h2>Settings</h2><p class="msub">One-time setup — everything saves permanently on this computer (data/settings.json) and stays changeable here anytime. Never share your keys.</p>'
good_text = '<h2>Settings</h2>'

content = content.replace(bad_text, good_text)

with open(js_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Removed settings detail paragraph.")
