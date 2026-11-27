"""Copy the current brief.json into archive/ and update archive/index.json. Recaps are archived by tools/recap.py.
Run after check.py passes: python3 tools/archive.py
Published archive files are never edited or deleted. check.py enforces this."""
import json, os, shutil, sys
from datetime import datetime
from zoneinfo import ZoneInfo

B = json.load(open("brief.json"))
et = datetime.fromisoformat(B["updated"]).astimezone(ZoneInfo("America/New_York"))
day, hm = et.strftime("%Y-%m-%d"), et.strftime("%H%M")
os.makedirs(os.path.join("archive", day), exist_ok=True)
idxp = os.path.join("archive", "index.json")
idx = json.load(open(idxp)) if os.path.exists(idxp) else []

def add(src, name, kind):
    rel = day + "/" + name
    dst = os.path.join("archive", rel)
    if os.path.exists(dst):
        print("already archived, left unchanged: " + rel); return
    shutil.copyfile(src, dst)
    idx.append({"date": day, "time": hm, "kind": kind, "label": B.get("updatedLabel", ""),
                "headline": B.get("headline", "") if kind == "brief" else B.get("recapLabel", ""), "file": rel})
    print("archived " + rel)

add("brief.json", hm + ".json", "brief")
if "--recap" in sys.argv:
    print("recaps are archived by tools/recap.py install; --recap does nothing here")
idx.sort(key=lambda e: (e["date"], e["time"], e["kind"]))
json.dump(idx, open(idxp, "w"), indent=1, ensure_ascii=False)
