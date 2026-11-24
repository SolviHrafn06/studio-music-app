# Studio

A free music maker for Windows that combines the friendliness of GarageBand with the power of FL Studio, with the extras built in (Auto-Tune, amp sims, sampler, song generator) so you don't have to hunt for plugins.

Built with [Neutralinojs](https://neutralino.js.org) + plain HTML/CSS/JavaScript and the Web Audio API.

## Features

- **Song generator** – pick a genre (Dubstep, Riddim/Brostep, Trap, House, Drum & Bass, Lo-fi, Pop, Synthwave), mood, key, tempo and length, and Studio writes a complete arranged song (intro, builds, drops/choruses, drums, bass, chords, melody, FX, mastered mix). Everything is ordinary tracks and clips you can edit. `Ctrl+G`.
- **Timeline** with clips, markers, time signatures, automation lanes, fades, split/trim, copy/paste, box select.
- **Channel Rack** step sequencer: 6 drum kits, 12 drum sounds, per-sound pitch, swing, hi-hat rolls, 12–64 step patterns, PAT/SONG mode.
- **Piano roll** with velocity lane, chord stamps, scale lock, ghost notes, quantize, strum/humanize/legato tools.
- **Instruments**: 12 real sampled instruments (Salamander Grand Piano, guitars, bass, strings, winds…), a 2-oscillator synth with unison, FM, mono/glide (808 slides), filter/amp envelopes, LFO and 38 presets, arpeggiator, and a **Sampler/Slicer**.
- **Mixer** with buses, sends, 20 effects (EQ, compressor, true sidechain compressor, saturation, filter with tempo wobble, chorus, phaser, delay, reverb, bitcrusher, width, doubler, de-esser, limiter, noise gate, tremolo, amp sim + cabinets) and mastering presets.
- **Vocal studio** with built-in **Auto-Tune** (PSOLA, formant shift, harmonizer, vocoder, robot), voice presets (Cher, T-Pain, Daft Punk, Kanye…), pitch editor and loop takes.
- **Inputs & guitar**: choose any mic/interface input per track, live monitoring, 6 amp models, cabinets, tuner.
- Export WAV, MP3 or stems; autosave and crash recovery; MIDI keyboard support; `.studio` project files that open with a double-click.

## Project layout

```
resources/            the app (served by Neutralino)
  index.html
  css/style.css
  js/
    engine.js         audio engine: track chains, buses, sidechain, scheduler, offline render
    worklets.js       AudioWorklets: Auto-Tune, recorder, crusher, gate, sidechain
    analysis-worker.js pitch tracking + WSOLA time-stretch
    sounds.js         drum kits, drum cache, sampler playback
    synth.js          synth engine + presets
    sampler.js        Sampler / Slicer instrument
    fx.js             effects, master presets, chain presets
    loops.js          drum grooves, chord loops, bass lines, melodies for the Browser
    ui-*.js           UI: core/app state, timeline, editors, mixer, vocal, browser, input, library
    ui-generate.js    song generator
    main.js           startup, shortcuts, file association
  samples/            instrument samples (CC-BY 3.0, see credits)
build/
  studio.nsi          NSIS installer script
  patch-exe.mjs       sets the exe icon + version info
examples/
  Neon Riot.studio    demo dubstep song made in Studio
```

## Running from source

1. Install the Neutralino CLI: `npm i -g @neutralinojs/neu`
2. In the project folder, download the Neutralino binaries and client library: `neu update`
3. Run it: `neu run`

## Building the Windows release

```bash
neu build --release                       # -> dist/Studio/Studio-win_x64.exe + resources.neu
cp dist/Studio/Studio-win_x64.exe build/Studio.exe
cp dist/Studio/resources.neu README.txt icon.ico build/
npm i resedit pe-library                  # once
node build/patch-exe.mjs build/Studio.exe build/icon.ico 3.1.0
makensis build/studio.nsi                 # -> build/Studio-Setup.exe
```

The installer is per-user (no admin rights), adds Start-menu/desktop shortcuts and registers `.studio` files.

## Credits

- Grand piano: Salamander Grand Piano (Alexander Holm), CC-BY 3.0.
- Other instruments: tonejs-instruments (Nicholaus Brosowsky), CC-BY 3.0.
- MP3 encoding: lamejs (LGPL). App shell: Neutralinojs (MIT).

See `README.txt` for the full user guide and version history.
