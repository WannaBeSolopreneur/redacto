#!/bin/sh
# Voice (TAKE in timing.js, eleven_v4, voice kPzsL2i3teMYv0FxEYQ6) placed at VOICE_AT, over the effects,
# which duck while the voice speaks. The voice plays at SPEED (pitch kept). -> mix.wav
cd "$(dirname "$0")"
val() { python3 -c "import json,re;d=json.loads(re.search(r'window\.TIMING = (\{.*?\n\});',open('timing.js').read(),re.S).group(1));print(d['$1'])"; }
SPEED=$(val SPEED)
AT=$(python3 -c "print($(val VOICE_AT)/$SPEED)")
LEN=$(python3 -c "print($(val LENGTH)/$SPEED)")
MS=$(python3 -c "print(int($AT*1000))")
TAKE=$(val TAKE)
ffmpeg -v error -y -i sound.wav -i $TAKE -filter_complex \
 "[1:a]aresample=48000,atempo=$SPEED,adelay=$MS|$MS,pan=stereo|c0=c0|c1=c0,loudnorm=I=-16:TP=-2:LRA=7,apad=whole_dur=$LEN,asplit=2[vo][key];\
  [0:a]volume=0.8[fx];[fx][key]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=350[duck];\
  [duck][vo]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.89[out]" \
 -map "[out]" -ar 48000 mix.wav
echo "wrote mix.wav"
