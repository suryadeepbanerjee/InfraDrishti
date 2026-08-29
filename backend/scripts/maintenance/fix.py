from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

# Fix corridor planner
corridor_file = BASE_DIR / "src/corridor/planner.py"
corridor_content = corridor_file.read_text(encoding='utf-8')
corridor_content = corridor_content.replace("'geometry': line,", "'geometry': line.__geo_interface__,")
corridor_file.write_text(corridor_content, encoding='utf-8')

# Fix site finder
site_file = BASE_DIR / "src/site/finder.py"
site_content = site_file.read_text(encoding='utf-8')
site_content = site_content.replace("'geometry': poly,", "'geometry': poly.__geo_interface__,")
site_file.write_text(site_content, encoding='utf-8')
