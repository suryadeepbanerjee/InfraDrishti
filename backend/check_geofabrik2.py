import urllib.request
import json
url = "https://download.geofabrik.de/index-v1.json"
req = urllib.request.Request(url, headers={'User-Agent': 'AntigravityIDE/1.0'})
with urllib.request.urlopen(req) as response:
    data = json.loads(response.read().decode())
    
extracts = []
for f in data['features']:
    if 'india' in f['properties']['id']:
        extracts.append(f['properties']['id'])
print(extracts)
