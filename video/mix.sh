#!/bin/sh
# Voice (TAKE in timing.js, eleven_v4, voice kPzsL2i3teMYv0FxEYQ6) placed at VOICE_AT, over the effects,
# which duck while the voice speaks. -> mix.wav
cd "$(dirname "$0")"
AT=$(python3 -c "import json,re;print(json.loads(re.search(r'window\.TIMING = (\{.*\});',open('timing.js').read(),re.S).group(1))['VOICE_AT'])")
LEN=$(python3 -c "import json,re;print(json.loads(re.search(r'window\.TIMING = (\{.*\});',open('timing.js').read(),re.S).group(1))['LENGTH'])")
MS=$(python3 -c "print(int($AT*1000))")
TAKE=$(python3 -c "import json,re;print(json.loads(re.search(r'window\.TIMING = (\{.*\});',open('timing.js').read(),re.S).group(1))['TAKE'])")
ffmpeg -v error -y -i sound.wav -i $TAKE -filter_complex \
 "[1:a]aresample=48000,adelay=$MS|$MS,pan=stereo|c0=c0|c1=c0,loudnorm=I=-16:TP=-2:LRA=7,apad=whole_dur=$LEN,asplit=2[vo][key];\
  [0:a]volume=0.8[fx];[fx][key]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=350[duck];\
  [duck][vo]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.89[out]" \
 -map "[out]" -ar 48000 mix.wav
echo "wrote mix.wav"
