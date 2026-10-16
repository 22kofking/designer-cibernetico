import json, os, sys, urllib.request
K = os.environ['RUNPOD_API_KEY']
def gql(q, v=None):
    req = urllib.request.Request('https://api.runpod.io/graphql', data=json.dumps({'query': q, 'variables': v or {}}).encode(),
        headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {K}', 'User-Agent': 'curl/8'})
    return json.load(urllib.request.urlopen(req, timeout=60))
if __name__ == '__main__':
    print(json.dumps(gql(sys.argv[1]), indent=1)[:4000])
