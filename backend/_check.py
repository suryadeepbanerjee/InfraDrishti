import base64, json, time, uuid, os
import jwt as pyjwt
from unittest.mock import patch
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.backends import default_backend

pk = rsa.generate_private_key(public_exponent=65537, key_size=2048, backend=default_backend())
pub = pk.public_key()
nums = pub.public_numbers()

def b64url(n):
    l = (n.bit_length() + 7) // 8
    return base64.urlsafe_b64encode(n.to_bytes(l, 'big')).rstrip(b'=').decode()

jwks = {'keys': [{'kty':'RSA','kid':'t','alg':'RS256','use':'sig','n':b64url(nums.n),'e':b64url(nums.e)}]}
payload = {'sub': str(uuid.uuid4()), 'iss': 'https://test.supabase.co/auth/v1', 'aud': 'authenticated', 'iat': int(time.time()), 'exp': int(time.time()) + 3600}
token = pyjwt.encode(payload, pk, algorithm='RS256', headers={'kid': 't'})

os.environ['SUPABASE_URL'] = 'https://test.supabase.co'
os.environ['SUPABASE_SECRET_KEY'] = 'test-key-real'

with patch('src.core.auth._get_jwks', return_value=jwks):
    from src.core.auth import _get_jwks
    _get_jwks.cache_clear()
    from src.main import app
    from fastapi.testclient import TestClient
    with patch('src.core.supabase_client.create_analysis_run', return_value='mock-id'), \
         patch('src.core.supabase_client.complete_analysis_run', return_value=True), \
         patch('src.core.supabase_client.save_site_result', return_value=True):
        with TestClient(app) as client:
            resp = client.post('/api/v1/site/find', json={
                'facility_type': 'Logistics Hub',
                'location': {'lat': 18.4088, 'lon': 76.5726},
                'required_area_acres': 50,
            }, headers={'Authorization': f'Bearer {token}'})
            data = resp.json()
            for feat in data.get('geojson', {}).get('features', []):
                props = feat.get('properties', {})
                metrics = props.get('metrics', {})
                print("Site %s: area=%.0f ha, highway=%s m, water=%s m, slope=%.2f deg" % (
                    props.get("id"),
                    metrics.get("site_area_ha", 0),
                    metrics.get("dist_to_highway_m", "N/A"),
                    metrics.get("dist_to_water_m", "N/A"),
                    metrics.get("mean_slope_deg", 0),
                ))
