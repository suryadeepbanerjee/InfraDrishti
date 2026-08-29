from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
test_file = BASE_DIR / "tests/test_api.py"
content = test_file.read_text(encoding='utf-8')
content = content.replace('assert "mcda_score" in data["data"][0]', 'assert "mcda_score" in data["data"]["features"][0]["properties"]')
test_file.write_text(content, encoding='utf-8')
