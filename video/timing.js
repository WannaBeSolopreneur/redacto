// Film beats in seconds, shared by film.html and sound.py. Timed to vo/take_8 (voice starts at VOICE_AT).
// Times are in the take's own clock; SPEED plays everything faster (voice pitch kept), see timing helpers.
window.TIMING = {
  "SPEED": 1.15,
  "VOICE_AT": 0.3,
  "TAKE": "vo/take_8.mp3",
  "LENGTH": 42.5,
  "chat": 0.1, "attach": 0.45, "type": [0.95, 2.9],
  "expand": [3.4, 4.25],
  "flags": [5.95, 6.7, 7.55, 8.75, 9.12],
  "pill": 9.55,
  "swaps": [10.35, 10.6, 10.85, 11.1, 11.35],
  "kept": 13.05,
  "collapse": [13.7, 14.5], "send": 14.65, "reply": [14.85, 16.4],
  "out": [17.5, 17.85],
  "how": { "in": 17.9, "card": 18.25, "details": 21.4, "shrink": [23.65, 24.9], "browser": [25.9, 26.7] },
  "offline": { "in": 27.3, "download": [27.95, 28.85], "wifi": 30.0, "working": 31.15 },
  "trust": { "in": 31.95, "card": 33.35, "oss": 34.95 },
  "end": [36.2, 36.75], "headline": 37.35, "sub": 39.9,
  "captions": [
    [0.3, 3.35, "About to ask ChatGPT about your <em>lab results</em>?"],
    [3.4, 5.25, "You’re not just sending the numbers."],
    [5.35, 9.5, "You’re sending your <em>name, birthday, patient ID</em> and <em>address</em>."],
    [9.6, 12.95, "Redacto takes all of that out, <em>right on your device</em>."],
    [13.0, 14.7, "And keeps what the AI needs."],
    [14.75, 17.45, "Same helpful answer. <em>Nothing that says who you are.</em>"],
    [17.9, 23.5, "How it works: <em>open-source AI models</em>, trained to spot personal details."],
    [23.55, 27.2, "Shrunk to a quarter of their size, to run <em>in your browser</em>."],
    [27.35, 31.8, "Download once. Then turn off your Wi-Fi. <em>It keeps working.</em>"],
    [31.95, 36.0, "Don’t trust us. <em>Trust the code.</em>"]
  ]
};

// Scale every time by 1/SPEED, so the film, the effects and the sped-up voice stay in sync.
window.TIMING = (function scale(v, k) {
  if (typeof v === 'number') return v / k;
  if (Array.isArray(v)) return v.map((x) => scale(x, k));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([n, x]) => [n, n === 'SPEED' || n === 'TAKE' ? x : scale(x, k)]));
  return v;
})(window.TIMING, window.TIMING.SPEED);
