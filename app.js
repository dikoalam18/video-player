const $ = (id) => document.getElementById(id);
const video = $("video");
const statusEl = $("status");
const ccBtn = $("ccBtn");

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
  const okType = /\.(mp4|webm|mov)$/i.test(file.name) || file.type.startsWith("video/");
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

function loadVtt(file) {
  if (!/\.vtt$/i.test(file.name)) return toast("Please choose a .vtt file", true);
  if (vttUrl) URL.revokeObjectURL(vttUrl);
  vttUrl = URL.createObjectURL(file);
  video.querySelectorAll("track").forEach((t) => t.remove());
  const el = document.createElement("track");
  el.kind = "subtitles";
  el.label = "Subtitles";
  el.srclang = "en";
  el.addEventListener("load", applyCaptionMode);
  el.src = vttUrl;
  video.appendChild(el);
  captionsOn = true;
  applyCaptionMode();
  hasVtt = true;
  markLoaded($("vttZone"), $("vttName"), file);
  toast("Subtitles loaded: " + file.name);
  updateStatus();
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

$("speed").addEventListener("change", (e) => {
  video.playbackRate = parseFloat(e.target.value);
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
  const tag = e.target.tagName.toLowerCase();
  // ignore key events from form controls to avoid accidental shortcuts
  if (['input', 'textarea', 'select'].includes(tag)) return;
  if (e.defaultPrevented) return;
  switch (e.key.toLowerCase()) {
    case ' ': // space
      e.preventDefault();
      if (!video) return;
      if (video.paused) video.play();
      else video.pause();
      break;
    case 'arrowleft':
      e.preventDefault();
      if (!video) return;
      video.currentTime = Math.max(0, video.currentTime - 5);
      break;
    case 'arrowright':
      e.preventDefault();
      if (!video) return;
      // guard against NaN duration before metadata loads
      const maxTime = isNaN(video.duration) ? 0 : video.duration;
      video.currentTime = Math.min(maxTime, video.currentTime + 5);
      break;
    case 'f':
      e.preventDefault();
      if (document.fullscreenElement) document.exitFullscreen();
      else $("videoWrap").requestFullscreen?.();
      break;
    case 'c':
      e.preventDefault();
      if (!video.textTracks.length) return;
      captionsOn = !captionsOn;
      applyCaptionMode();
      break;
  }
});
