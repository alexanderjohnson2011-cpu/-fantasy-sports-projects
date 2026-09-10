import urllib.request
import json

draft_id = "1401673234486714368"
league_id = "1401673232670539776"

req1 = urllib.request.Request(f"https://api.sleeper.app/v1/draft/{draft_id}", headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req1) as resp:
    draft_meta = json.loads(resp.read().decode("utf-8"))
    print("Draft Status:", draft_meta.get("status"))
    print("Draft Settings:", draft_meta.get("settings"))

req2 = urllib.request.Request(f"https://api.sleeper.app/v1/draft/{draft_id}/picks", headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req2) as resp:
    picks = json.loads(resp.read().decode("utf-8"))
    print("Total Picks Made:", len(picks))
    if picks:
        print("First 3 picks:", [(p.get("pick_no"), p.get("metadata", {}).get("first_name"), p.get("metadata", {}).get("last_name"), p.get("metadata", {}).get("position")) for p in picks[:3]])
        print("Last pick:", picks[-1].get("pick_no"), picks[-1].get("metadata", {}).get("first_name"), picks[-1].get("metadata", {}).get("last_name"))

req3 = urllib.request.Request(f"https://api.sleeper.app/v1/league/{league_id}/users", headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req3) as resp:
    users = json.loads(resp.read().decode("utf-8"))
    print("Total Users in League:", len(users))
    for u in users:
        print(f"User: {u.get('display_name')} -> Team: {(u.get('metadata') or {}).get('team_name')}")

req4 = urllib.request.Request(f"https://api.sleeper.app/v1/league/{league_id}/rosters", headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req4) as resp:
    rosters = json.loads(resp.read().decode("utf-8"))
    print("Total Rosters:", len(rosters))
