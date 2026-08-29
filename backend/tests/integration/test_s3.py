import urllib.request
url = "https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N23_00_E077_00_DEM/Copernicus_DSM_COG_10_N23_00_E077_00_DEM.tif"
try:
    req = urllib.request.Request(url, method='HEAD')
    with urllib.request.urlopen(req) as response:
        print(f"Status: {response.status}")
except Exception as e:
    print(f"Error: {e}")
