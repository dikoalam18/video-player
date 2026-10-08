const $ = (id) => document.getElementById(id);
const video = $("video");
const statusEl = $("status");
const ccBtn = $("ccBtn");
// Preserve volume when muting/unmuting via keyboard shortcut
let previousVolume = video.volume;

let videoUrl = null;
let vttUrl = null;
let captionsOn = true;
let hasVideo = false;
let hasVtt = false;

function toast(msg, isError = false) {
  const el = document.createElement("div");
  el.className = "toast" + (isError ? " error" : "");
  el.textContent = msg;
  $("toasts").appendChild(el);
  setTimeout(() => {
    el.classList.add("out");
    el.addEventListener("animationend", () => el.remove());
  }, 2800);
}

function updateStatus() {
  const ready = hasVideo && hasVtt;
  statusEl.classList.toggle("ready", ready);
  statusEl.textContent = ready
    ? "Ready to Play"
    : hasVideo ? "Add a VTT file" : hasVtt ? "Add a video file" : "Waiting for files";
}

function markLoaded(zone, nameEl, file) {
  zone.classList.add("loaded", "dropped");
  zone.addEventListener("animationend", () => zone.classList.remove("dropped"), { once: true });
  nameEl.textContent = file.name;
}

function applyCaptionMode() {
  const tracks = video.textTracks;
  if (!tracks.length) {
    ccBtn.disabled = true;
    ccBtn.textContent = "Captions: N/A";
    ccBtn.classList.add("off");
    return;
  }
  ccBtn.disabled = false;
  for (let i = 0; i < tracks.length; i++) {
    tracks[i].mode = captionsOn ? "showing" : "hidden";
  }
  ccBtn.textContent = "Captions: " + (captionsOn ? "On" : "Off");
  ccBtn.classList.toggle("off", !captionsOn);
}

  function loadVideo(file) {
    const okType =
      /\.(mp4|webm|mov)$/i.test(file.name) ||
      file.type.startsWith("video/");
    if (!okType) return toast("Please choose an .mp4, .webm or .mov file", true);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = URL.createObjectURL(file);
    video.src = videoUrl;
    video.playbackRate = parseFloat($("speed").value);
    $("videoWrap").classList.add("has-video");
    hasVideo = true;
    markLoaded($("videoZone"), $("videoName"), file);
    toast("Video loaded: " + file.name);
    updateStatus();
  }

    // Helper to attach a subtitle track to the video element and update UI state.
    function attachSubtitleTrack(url, file) {
      // Remove any existing tracks
      video.querySelectorAll("track").forEach((t) => t.remove());
      const el = document.createElement("track");
      el.kind = "subtitles";
      el.label = "Subtitles";
      el.srclang = "en";
      el.src = url;
      video.appendChild(el);
      // Ensure captions show immediately
      el.mode = "showing";
      el.addEventListener("load", applyCaptionMode);
      captionsOn = true;
      applyCaptionMode();
      hasVtt = true;
      markLoaded($("vttZone"), $("vttName"), file);
      toast("Subtitles loaded: " + file.name);
      updateStatus();
    }

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

      if (!line || line.startsWith("Scenarist_SCC")) {
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
        caption += " ";
        continue;
      }

        const b1 =
          parseInt(word.slice(0, 2), 16) & 0x7f;

        const b2 =
          parseInt(word.slice(2, 4), 16) & 0x7f;

        if (b1 === 0x00) {
          caption += " ";
        } else if (b1 >= 0x20 && b1 <= 0x7e) {
          caption += String.fromCharCode(b1);
        }

        if (b2 === 0x00) {
          caption += " ";
        } else if (b2 >= 0x20 && b2 <= 0x7e) {
          caption += String.fromCharCode(b2);
        }
      }

      caption = caption
        .replace(/\s+/g, " ")
        .trim();

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


  function loadVtt(file) {
    const isVtt = /\.vtt$/i.test(file.name);
    const isSrt = /\.srt$/i.test(file.name);
    const isScc = /\.scc$/i.test(file.name);

    if (!isVtt && !isSrt && !isScc) {
      return toast(
        "Please choose a .vtt, .srt or .scc file",
        true
      );
    }

    if (vttUrl) {
      URL.revokeObjectURL(vttUrl);
    }

    if (isVtt) {
      vttUrl = URL.createObjectURL(file);
      attachSubtitleTrack(vttUrl, file);
      return;
    }

    const reader = new FileReader();

    reader.onload = function (e) {
      let vttText;

      if (isSrt) {
        vttText =
          "WEBVTT\n\n" +
          e.target.result.replace(/,/g, ".");

        toast("SRT converted successfully");
      } else if (isScc) {
        vttText = parseScc(e.target.result);

        if (!vttText || !vttText.trim()) {
          toast("Failed to parse SCC file", true);
          return;
        }

        toast("SCC converted successfully");
      }

      const blob = new Blob(
        [vttText],
        { type: "text/vtt" }
      );

      vttUrl = URL.createObjectURL(blob);
      attachSubtitleTrack(vttUrl, file);
    };

    reader.readAsText(file);
  }

function setupZone(zoneId, inputId, handler) {
  const zone = $(zoneId);
  const input = $(inputId);
  input.addEventListener("change", () => {
    if (input.files[0]) handler(input.files[0]);
    input.value = "";
  });
  ["dragenter", "dragover"].forEach((ev) =>
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    zone.addEventListener(ev, () => zone.classList.remove("dragover"))
  );
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    if (e.dataTransfer.files[0]) handler(e.dataTransfer.files[0]);
  });
  zone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      input.click();
    }
  });
}

// Prevent the browser from navigating to a file dropped outside a zone.
["dragover", "drop"].forEach((ev) => window.addEventListener(ev, (e) => e.preventDefault()));

setupZone("videoZone", "videoInput", loadVideo);
setupZone("vttZone", "vttInput", loadVtt);

video.addEventListener("loadedmetadata", applyCaptionMode);
video.textTracks.addEventListener("addtrack", applyCaptionMode);

ccBtn.addEventListener("click", () => {
  if (!video.textTracks.length) return;
  captionsOn = !captionsOn;
  applyCaptionMode();
});

// --- Playback speed persistence ---
// Restore speed from localStorage on page load
const storedRate = localStorage.getItem("playbackRate");
const defaultRate = storedRate !== null ? parseFloat(storedRate) : 1.0;
$("speed").value = defaultRate;
video.playbackRate = defaultRate;

$("speed").addEventListener("change", (e) => {
  const val = parseFloat(e.target.value);
  video.playbackRate = val;
  localStorage.setItem("playbackRate", val);
});

$("fsBtn").addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else $("videoWrap").requestFullscreen?.();
});

// --- Keyboard shortcuts ---
// Space: play/pause
// ArrowLeft: rewind 5 seconds
// ArrowRight: forward 5 seconds
// F: toggle fullscreen
// C: toggle captions
window.addEventListener("keydown", (e) => {
  if (e.repeat) return;

  const tag = e.target.tagName.toLowerCase();

  // ignore key events from form controls
  if (["input", "textarea", "select"].includes(tag)) return;
  if (e.defaultPrevented) return;

  switch (e.key.toLowerCase()) {
    case " ":
      e.preventDefault();

      if (video.paused) {
        video.play();
      } else {
        video.pause();
      }
      break;

    case "arrowleft":
      e.preventDefault();
      video.currentTime = Math.max(0, video.currentTime - 5);
      break;

    case "arrowright":
      e.preventDefault();
      const maxTime = isNaN(video.duration) ? 0 : video.duration;
      video.currentTime = Math.min(maxTime, video.currentTime + 5);
      break;

    case "f":
      e.preventDefault();
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        $("videoWrap").requestFullscreen?.();
      }
      break;

    case "c":
      e.preventDefault();
      if (!video.textTracks.length) return;
      captionsOn = !captionsOn;
      applyCaptionMode();
      break;

    case "m":
      e.preventDefault();

      if (!video.muted) {
        previousVolume = video.volume;
        video.muted = true;
      } else {
        video.muted = false;
        video.volume = previousVolume;
      }
      break;

    case "0":
      e.preventDefault();
      const wasPlaying = !video.paused;
      video.currentTime = 0;

      if (wasPlaying) {
        video.play();
      }
      break;
  }
});
