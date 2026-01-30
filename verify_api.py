import urllib.request
import json

base_url = "http://localhost:5000/api"

def check_city(city):
    print(f"--- Checking City: {city} ---")
    try:
        url = f"{base_url}/census-zones?city={city}&sample=1"
        with urllib.request.urlopen(url) as response:
            if response.getcode() == 200:
                data = json.loads(response.read().decode())
                print(f"Status: Success")
                print(f"Feature count: {len(data['features'])}")
                if len(data['features']) > 0:
                    props = data['features'][0]['properties']
                    print(f"First feature properties: {props}")
                    if 'join_key' in props:
                        print("OK: join_key present")
                    else:
                        print("ERROR: join_key missing")
            else:
                print(f"Status: Error {response.getcode()}")
    except Exception as e:
        print(f"Exception: {e}")

check_city('barcelona')
print("\n")
check_city('l_hospitalet')
