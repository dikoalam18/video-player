const fs = require("fs");

function msToTimestamp(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const msRem = ms % 1000;

  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(msRem).padStart(3, "0")}`;
}

function parseScc(text) {
  const lines = text.split(/\r?\n/);
  const cues = [];

  const controlWords = new Set([
    "9420",
    "94e0",
    "97a2",
    "97a1",
    "9723",
    "9452",
    "9440",
    "9454",
    "94f2",
    "94f4",
    "942c",
    "942f",
    "8080",
    "91ae"
  ]);

  function tcToMs(tc) {
    if (!/^\d{2}:\d{2}:\d{2}:\d{2}$/.test(tc)) {
      
      return null;
    }

    const [hh, mm, ss, ff] = tc.split(":").map(Number);

    return (
      ((hh * 60 + mm) * 60 + ss) * 1000 +
      ff * 40
    );
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (
      !line ||
      line.startsWith("Scenarist_SCC")
    ) {
      continue;
    }

    const parts = line.split(/\s+/);

    if (parts.length < 2) {
      continue;
    }

    const timecode = parts[0];
    const words = parts.slice(1);

    let caption = "";

    for (const word of words) {
      if (word.length !== 4) continue;

      if (controlWords.has(word.toLowerCase())) {
        continue;
      }

      const b1 =
        parseInt(word.slice(0, 2), 16) &
        0x7f;

      const b2 =
        parseInt(word.slice(2, 4), 16) &
        0x7f;

      if (b1 >= 0x20 && b1 <= 0x7e) {
        caption += String.fromCharCode(b1);
      }

      if (b2 >= 0x20 && b2 <= 0x7e) {
        caption += String.fromCharCode(b2);
      }
    }

    caption = caption.trim();

    if (!caption) continue;

    const start = tcToMs(timecode);

    if (start === null || Number.isNaN(start)) {
      
      continue;
    }

    cues.push({
      start,
      text: caption
    });
  }

  let vtt = "WEBVTT\n\n";

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];

    const end =
      i < cues.length - 1
        ? cues[i + 1].start
        : cue.start + 3000;

    vtt +=
      `${msToTimestamp(cue.start)} --> ${msToTimestamp(end)}\n` +
      `${cue.text}\n\n`;
  }

  return vtt;
}

const scc = fs.readFileSync(
  "MyTraining.scc",
  "utf8"
);

const vtt = parseScc(scc);

fs.writeFileSync("output.vtt", vtt);
console.log("Created output.vtt");

