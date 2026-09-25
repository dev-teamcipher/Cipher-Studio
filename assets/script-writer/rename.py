import os
import re

html_path = r"C:\Users\FIREFLY LAPTOP'S\Documents\AutoCutStudio_Extracted\assets\script-writer\index.html"
with open(html_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("AUTOCUT<span> AI</span> WRITER", "CIPHER<span> AI</span> WRITER")
content = content.replace("AUTOCUT AI WRITER", "CIPHER WRITER")

with open(html_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Renamed to CIPHER WRITER")
