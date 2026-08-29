import urllib.request
import re
url = "https://download.geofabrik.de/asia/india.html"
req = urllib.request.Request(url, headers={'User-Agent': 'AntigravityIDE/1.0'})
try:
    with urllib.request.urlopen(req) as response:
        html = response.read().decode()
        links = re.findall(r'href="([^"]+-latest\.osm\.pbf)"', html)
        print("Sub-region links found on india.html:")
        for link in links:
            print(link)
except Exception as e:
    print(f"Failed to fetch {url}: {e}")
