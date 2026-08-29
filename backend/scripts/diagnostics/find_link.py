import urllib.request
import re
req = urllib.request.Request('https://www.hydrosheds.org/products/hydrobasins', headers={'User-Agent': 'Mozilla/5.0'})
html = urllib.request.urlopen(req).read().decode('utf-8')
print([link for link in re.findall(r'href=[\x27\x22]([^\x27\x22]+)[\x27\x22]', html) if 'hydrobasins' in link.lower()])
