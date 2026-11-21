"""
Calm background music for the demo videos, made in the browser (no audio files or encoders needed).

    python music.py out_dir name=seconds [name=seconds ...]

Each track is a slow ambient piece (soft pad, gentle bell arpeggio, low bass, long reverb) with a fade
in and out, rendered offline and recorded to Opus/WebM by Chromium. Tracks record in parallel, in
real time, so the longest one sets how long this takes. mux() then adds a track to a video by stream
copy, so the picture is never re-encoded.
"""

import base64
import pathlib
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

FFMPEG = pathlib.Path.home() / "AppData/Local/ms-playwright/ffmpeg-1011/ffmpeg-win64.exe"

SCRIPT = r"""
async ([seconds, seed]) => {
  const rate = 48000;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // Long, soft reverb from a decaying noise impulse.
  const ir = ctx.createBuffer(2, rate * 3, rate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3.2);
  }
  const verb = ctx.createConvolver(); verb.buffer = ir;
  const wet = ctx.createGain(); wet.gain.value = 0.55;
  const master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 3;
  const bus = ctx.createGain(); bus.gain.value = 1;
  bus.connect(master); bus.connect(verb); verb.connect(wet); wet.connect(master);
  master.connect(comp); comp.connect(ctx.destination);
  // Fade in over 3 s, out over the last 4 s.
  master.gain.setValueAtTime(0, 0);
  master.gain.linearRampToValueAtTime(0.62, 3);
  master.gain.setValueAtTime(0.62, Math.max(3, seconds - 4.5));
  master.gain.linearRampToValueAtTime(0, seconds);

  // Fmaj9 - Am7 - Dm9 - Bbmaj7, two bars each at 64 bpm.
  const chords = [
    [53, 57, 60, 64, 67], [57, 60, 64, 67, 71], [50, 57, 60, 64, 65], [46, 53, 57, 62, 65],
  ];
  const beat = 60 / 64, bar = beat * 4, len = bar * 2;
  const shift = Math.floor(rnd() * 4);

  const pad = (notes, t, dur) => {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 820; lp.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 2.2);
    g.gain.setValueAtTime(0.05, t + dur - 0.4);
    g.gain.linearRampToValueAtTime(0, t + dur + 2.2);
    lp.connect(g); g.connect(bus);
    for (const n of notes.slice(1)) for (const det of [-7, 7]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = hz(n); o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + dur + 2.4);
    }
  };
  const bass = (n, t, dur) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz(n - 12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.11, t + 1.2);
    g.gain.setValueAtTime(0.11, t + dur - 0.6); g.gain.linearRampToValueAtTime(0, t + dur + 0.6);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.7);
  };
  const bell = (n, t, v) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 3.2);
    const pan = ctx.createStereoPanner(); pan.pan.value = rnd() * 0.8 - 0.4;
    g.connect(pan); pan.connect(bus);
    for (const [mult, amp, type] of [[1, 1, 'sine'], [2, 0.18, 'sine'], [3, 0.06, 'triangle']]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = hz(n) * mult;
      const a = ctx.createGain(); a.gain.value = amp;
      o.connect(a); a.connect(g); o.start(t); o.stop(t + 3.3);
    }
  };

  for (let t = 0, i = shift; t < seconds; t += len, i++) {
    const c = chords[i % chords.length];
    pad(c, t, len);
    bass(c[0], t, len);
    // A sparse arpeggio an octave up: not every eighth sounds, so it breathes.
    const arp = [c[1], c[2], c[3], c[4], c[3], c[2]].map((n) => n + 12);
    for (let k = 0; k < 16; k++) {
      const at = t + k * beat / 2;
      if (at > seconds - 3) break;
      if (k % 2 === 1 && rnd() < 0.55) continue;
      bell(arp[k % arp.length], at, k % 4 === 0 ? 0.07 : 0.045);
    }
  }

  const buffer = await ctx.startRendering();
  const live = new AudioContext({ sampleRate: rate });
  const dest = live.createMediaStreamDestination();
  const src = live.createBufferSource(); src.buffer = buffer; src.connect(dest);
  const rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 160000 });
  const parts = [];
  rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
  window.__done = new Promise((resolve) => {
    rec.onstop = async () => {
      const b = new Blob(parts, { type: 'audio/webm' });
      const bytes = new Uint8Array(await b.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      resolve(btoa(bin));
    };
  });
  await live.resume();
  rec.start(1000);
  src.start();
  src.onended = () => setTimeout(() => rec.stop(), 300);
  return true;
}
"""


def make(out_dir: pathlib.Path, tracks: dict[str, float]):
    out_dir.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        pages = {}
        for i, (name, secs) in enumerate(tracks.items()):
            pg = b.new_page()
            pg.goto("about:blank")
            pg.evaluate(SCRIPT, [secs + 0.6, i + 3])
            pages[name] = pg
        started = time.time()
        for name, pg in pages.items():
            data = pg.evaluate("() => window.__done", )
            (out_dir / f"{name}.music.webm").write_bytes(base64.b64decode(data))
            print("music", name, f"{tracks[name]:.0f}s", f"{time.time() - started:.0f}s")
        b.close()


def duration(video: pathlib.Path) -> float:
    r = subprocess.run([str(FFMPEG), "-hide_banner", "-i", str(video), "-map", "0:v", "-c", "copy", "-f", "webm", "-y", "NUL"],
                       capture_output=True, text=True)
    times = [l.split("time=")[1].split()[0] for l in r.stderr.replace("\r", "\n").splitlines() if "time=" in l]
    h, m, s = times[-1].split(":")
    return int(h) * 3600 + int(m) * 60 + float(s)


def mux(video: pathlib.Path, music: pathlib.Path, out: pathlib.Path):
    subprocess.run([str(FFMPEG), "-hide_banner", "-loglevel", "error", "-y", "-i", str(video), "-i", str(music),
                    "-map", "0:v", "-map", "1:a", "-c", "copy", "-shortest", str(out)], check=True)


if __name__ == "__main__":
    out = pathlib.Path(sys.argv[1])
    make(out, {k: float(v) for k, v in (a.split("=") for a in sys.argv[2:])})
