import os
import re

terms = re.compile(r'\b(pass\b|fake|simulat|placeholder|dummy|TODO|FIXME|touch)', re.IGNORECASE)
found = False

for root, dirs, files in os.walk("D:/Learn/B_Tech/Hackathons/1_BuildWithBharat/Prototype/Model/src"):
    if "__pycache__" in root: continue
    for f in files:
        if not f.endswith(".py"): continue
        path = os.path.join(root, f)
        with open(path, "r", encoding="utf-8") as file:
            for i, line in enumerate(file):
                if terms.search(line):
                    print(f"{path}:{i+1}: {line.strip()}")
                    found = True

if not found:
    print("No forbidden words found.")
