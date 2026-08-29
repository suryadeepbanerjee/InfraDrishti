from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

# Fix corridor
f1 = BASE_DIR / "src/corridor/planner.py"
c1 = f1.read_text(encoding='utf-8')
c1 = c1.replace("'geometry': line.__geo_interface__,", "'geometry': line,")
c1 = c1.replace('return {"status": "success", "routes": len(candidates), "data": candidates}', 'return {"status": "success", "routes": len(candidates), "data": feature_collection}')
f1.write_text(c1, encoding='utf-8')

# Fix site
f2 = BASE_DIR / "src/site/finder.py"
c2 = f2.read_text(encoding='utf-8')
c2 = c2.replace("'geometry': poly.__geo_interface__,", "'geometry': poly,")
c2 = c2.replace('return {"status": "success", "sites": len(candidates), "data": candidates}', 'return {"status": "success", "sites": len(candidates), "data": feature_collection}')
f2.write_text(c2, encoding='utf-8')
