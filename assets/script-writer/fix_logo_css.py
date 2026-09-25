import os
import re

css_path = r"C:\Users\FIREFLY LAPTOP'S\Documents\AutoCutStudio_Extracted\assets\script-writer\style.css"
with open(css_path, "r", encoding="utf-8") as f:
    content = f.read()

# Change the logo background to transparent or a dark color so the neon pops out
# Currently: background: var(--grad);
content = re.sub(r'\.brand \.logo\s*\{([^}]+)background:\s*var\(--grad\);([^}]+)\}', r'.brand .logo {\1background: transparent;\2}', content)

# Also ensure no border radius or shadow interferes if it's transparent
content = re.sub(r'box-shadow:\s*0\s*4px\s*24px[^;]+;', 'box-shadow: none;', content)

with open(css_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Fixed logo visibility.")
