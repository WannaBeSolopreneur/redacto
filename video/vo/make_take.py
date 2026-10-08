"""Record the voice-over as one continuous take, with word timings.

  .venv/bin/python vo/make_take.py [seed]      # -> vo/take_<seed>.mp3 + vo/take_<seed>.json, prints word times

The key is read from ELEVENLABS_API_KEY, or from ~/Downloads/redacto_elevenlabs_key.txt. It is never printed.
"""
import base64, json, os, pathlib, sys, urllib.request

VOICE = "kPzsL2i3teMYv0FxEYQ6"
MODEL = "eleven_v4"
# SCRIPT=<file> records a different text (e.g. one line to splice in); default vo/script.txt.
TEXT = pathlib.Path(os.environ.get("SCRIPT") or pathlib.Path(__file__).with_name("script.txt")).read_text().strip()
HERE = pathlib.Path(__file__).parent


def key():
    if os.environ.get("ELEVENLABS_API_KEY"):
        return os.environ["ELEVENLABS_API_KEY"].strip()
    f = pathlib.Path.home() / "Downloads" / "redacto_elevenlabs_key.txt"
    for line in f.read_text().splitlines():
        if line.startswith("ELEVENLABS_API_KEY="):
            v = line.split("=", 1)[1].strip()
            if v:
                return v
    sys.exit(f"No key yet: paste it after ELEVENLABS_API_KEY= in {f}")


seed = int(sys.argv[1]) if len(sys.argv) > 1 else 7
body = {"text": TEXT, "model_id": MODEL, "seed": seed}
req = urllib.request.Request(
    f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE}/with-timestamps?output_format=mp3_44100_192",
    data=json.dumps(body).encode(), headers={"xi-api-key": key(), "Content-Type": "application/json"})
d = json.load(urllib.request.urlopen(req))
(HERE / f"{os.environ.get('OUT', 'take')}_{seed}.mp3").write_bytes(base64.b64decode(d["audio_base64"]))
json.dump(d["alignment"], open(HERE / f"{os.environ.get('OUT', 'take')}_{seed}.json", "w"))

a = d["alignment"]
w, ws, pe = "", None, 0.0
for c, s, e in zip(a["characters"], a["character_start_times_seconds"], a["character_end_times_seconds"]):
    if c == " ":
        if w: print(f"{ws:6.2f}-{pe:6.2f} {w}"); w = ""
        continue
    if not w: ws = s
    w += c; pe = e
if w: print(f"{ws:6.2f}-{pe:6.2f} {w}")
