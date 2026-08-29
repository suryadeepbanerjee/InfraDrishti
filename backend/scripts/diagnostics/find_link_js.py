import urllib.request
import re
req = urllib.request.Request('https://www.hydrosheds.org/products/hydrobasins', headers={'User-Agent': 'Mozilla/5.0'})
html = urllib.request.urlopen(req).read().decode('utf-8')
js_links = re.findall(r'src=[\x27\x22](/[^\x27\x22]+\.js)[\x27\x22]', html)
for js in js_links:
    js_url = 'https://www.hydrosheds.org' + js
    try:
        js_content = urllib.request.urlopen(urllib.request.Request(js_url, headers={'User-Agent': 'Mozilla/5.0'})).read().decode('utf-8')
        zips = re.findall(r'https://[^\"\'\\]+\.zip', js_content)
        if zips:
            print(f'Found in {js_url}:')
            for z in set(zips):
                if 'as' in z.lower() and 'lev12' in z.lower():
                    print('MATCH:', z)
    except:
        pass
