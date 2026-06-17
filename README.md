# Pinchorchestra

A two-handed air instrument that runs in the browser. Track both hands with your webcam, pinch to play notes across two full octaves plus quarter-tones, layer a beat, sit it on a drone.

No build step, no server-side code, no install. Open the page, allow the camera, start playing.

## Run it

The model file is loaded from a relative path, so you need to serve the folder over HTTP — opening `index.html` directly with `file://` will not work (the camera and the hand-tracking model both require a real origin).

```
python -m http.server 8000
# then open http://localhost:8000
```

Any static file server works. Netlify, GitHub Pages, `npx serve`, nginx — all fine.

## How to play

1. Click **Start Camera** — give browser permission when prompted
2. Click **Start Audio** — the audio context needs an explicit user gesture to unlock on all browsers
3. Move your index fingertip to position the cursor over a note circle
4. **Pinch thumb to index** to play/hold the note
5. Release the pinch to release

Each hand has its own cursor and its own octave range, so you can play two-handed.

## What's in the box

- **2 hands tracked** simultaneously (MediaPipe HandLandmarker)
- **2 complete octaves** of standard pitches per hand (C..C..C, 15 notes)
- **Quarter-tones** — per-note buttons that lower each note by a quarter-semitone (−50 cents). Affects both hands, both octaves, and the drone. A "Reset microtuning" button restores everything.
- **Beats layer** — straight (4/4), house, techno, break, shuffle
- **7 instruments** — warm pad (default), soft keys, organ, flute, pluck, bass, synth
- **Drone** with root or root+5th voicing
- Glide, reverb, smoothing, pinch threshold, mirror, hand view — all adjustable from the panel

## Files

```
index.html               # all UI + CSS
static/app.js            # hand tracking, audio engine, note grid
static/models/
  hand_landmarker.task   # MediaPipe model (~7.5 MB)
```

The MediaPipe model is loaded from the local `static/models/` folder. The MediaPipe JS runtime is loaded from `cdn.jsdelivr.net` (`@mediapipe/tasks-vision@0.10.22-rc.20250304`).

## Credits

- Hand tracking: [MediaPipe Tasks Vision](https://developers.google.com/mediapipe) (Apache 2.0)
- Audio: built-in Web Audio API oscillators + filters, no samples
- Hand landmark model: Google MediaPipe `hand_landmarker.task`

## License

MIT. See [LICENSE](LICENSE).

## Project

- **Source / issues:** [github.com/zaheralkaei/pinchorchestra](https://github.com/zaheralkaei/pinchorchestra)
- **Author:** [Zaher Alkaei](https://github.com/zaheralkaei)
