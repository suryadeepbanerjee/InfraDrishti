import urllib.request
import json
url = "https://download.geofabrik.de/index-v1.json"
req = urllib.request.Request(url, headers={'User-Agent': 'AntigravityIDE/1.0'})
with urllib.request.urlopen(req) as response:
    data = json.loads(response.read().decode())
    
india_extracts = []
for f in data['features']:
    if 'india' in f['properties']['id']:
        india_extracts.append((f['properties']['id'], f['properties']['urls']['pbf']))
        
print("Geofabrik India Extracts:")
for extract in india_extracts:
    print(extract)
