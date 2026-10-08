# Redacto demo film

About 37 s (SPEED 1.15 in timing.js), 1920x1080, 30 fps, with voice-over: the lab-report story, how it works (open-source models, quantised, offline), "trust the code", and the tagline. Rendered from code: no video editor, no stock footage, no sample files.

    python3 -m venv .venv && .venv/bin/pip install numpy pillow playwright   # once
    .venv/bin/python vo/make_take.py 7                       # only to re-record: vo/script.txt -> vo/take_N.mp3 + word times (set TAKE in timing.js)
    .venv/bin/python sound.py                                # -> sound.wav (effects, all synthesised)
    ./mix.sh                                                 # voice over ducked effects -> mix.wav
    .venv/bin/python render.py --audio mix.wav              # -> redacto-demo.mp4 (~30 s)
    .venv/bin/python stills.py 2,4.6,7,11.5,14.5 sheet.png  # contact sheet of chosen moments
    open "film.html?play"                                    # live preview in a browser
    cp redacto-demo.mp4 ../public/video/                     # publish to the landing page

- timing.js: every beat and caption, in seconds, timed to the voice take's word times. Shared by film.html and sound.py.
- film.html: the whole film; every frame is computed from the time alone.
- render.py: frame-by-frame capture with Playwright, motion blur by averaging captures across a 180-degree shutter.
- sound.py: every effect generated with numpy, no samples, at the times in timing.js.
- Voice: ElevenLabs eleven_v4, voice kPzsL2i3teMYv0FxEYQ6. The key is read from
  ELEVENLABS_API_KEY or ~/Downloads/redacto_elevenlabs_key.txt and never printed. If you change vo/script.txt,
  re-record, read the printed word times and move the beats in timing.js to match.

Assets: fonts/Inter.ttf (SIL Open Font License, licence in fonts/), img/icon.png (the app icon). The lab report is fictional.
