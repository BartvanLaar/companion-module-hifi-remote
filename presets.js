const { combineRgb } = require("@companion-module/base");

const white = combineRgb(255, 255, 255);
const black = combineRgb(0, 0, 0);
const activeStyle = {
  bgcolor: combineRgb(0, 153, 51),
  color: white,
};

/**
 * Parses the "Stream presets" config field: entries of `Name=URL`, separated
 * by semicolons. Returns the valid streams and the entries that were skipped.
 */
function parseStreamPresets(text) {
  const streams = [];
  const invalidEntries = [];

  for (const entry of String(text ?? "").split(";")) {
    const trimmedEntry = entry.trim();
    if (!trimmedEntry) {
      continue;
    }

    // Split on the first "=", URLs can contain "=" in their query string
    const separatorIndex = trimmedEntry.indexOf("=");
    const label = trimmedEntry.slice(0, separatorIndex).trim();
    const url = trimmedEntry.slice(separatorIndex + 1).trim();
    if (separatorIndex < 1 || !label || !/^https?:\/\/.+/.test(url)) {
      invalidEntries.push(trimmedEntry);
      continue;
    }
    streams.push({ label, url });
  }

  return { streams, invalidEntries };
}

function streamPreset({ label, url }) {
  return {
    ...buttonPreset("Streams", label, label, "setStream"),
    steps: [
      {
        down: [{ actionId: "setStream", options: { selectedStreamUrl: url } }],
        up: [],
      },
    ],
    feedbacks: [
      {
        feedbackId: "activeStream",
        options: { stream: url },
        style: activeStyle,
      },
    ],
  };
}

function buttonPreset(category, name, text, actionId, feedbackIds = []) {
  return {
    type: "button",
    category,
    name,
    style: {
      text,
      size: "auto",
      color: white,
      bgcolor: black,
    },
    steps: [
      {
        down: [{ actionId, options: {} }],
        up: [],
      },
    ],
    feedbacks: feedbackIds.map((feedbackId) => ({
      feedbackId,
      options: {},
      style: activeStyle,
    })),
  };
}

function UpdatePresets(self) {
  const { streams, invalidEntries } = parseStreamPresets(
    self.config?.streamPresets,
  );
  for (const entry of invalidEntries) {
    self.log(
      "warn",
      `Ignoring stream preset "${entry}", use Name=https://stream-url`,
    );
  }

  self.setPresetDefinitions({
    togglePlayback: buttonPreset(
      "Transport",
      "Play/Pause",
      "PLAY\\nPAUSE",
      "togglePlayback",
      ["playbackState"],
    ),
    resume: buttonPreset("Transport", "Play", "PLAY", "resume", [
      "playbackState",
    ]),
    pause: buttonPreset("Transport", "Pause", "PAUSE", "pause"),
    stopPlayback: buttonPreset("Transport", "Stop", "STOP", "stopPlayback"),
    previous: buttonPreset("Transport", "Previous Track", "PREV", "previous"),
    next: buttonPreset("Transport", "Next Track", "NEXT", "next"),

    volumeUp: buttonPreset("Volume", "Volume Up", "VOL +", "volumeUp"),
    volumeDown: buttonPreset("Volume", "Volume Down", "VOL -", "volumeDown"),
    toggleMute: buttonPreset("Volume", "Toggle Mute", "MUTE", "toggleMute", [
      "isMuted",
    ]),
    showVolume: buttonPreset(
      "Volume",
      "Volume Level (press to mute)",
      `VOL\\n$(${self.label}:volume)`,
      "toggleMute",
      ["isMuted"],
    ),

    toggleShuffle: buttonPreset(
      "Shuffle & Repeat",
      "Toggle Shuffle",
      "SHUFFLE",
      "toggleShuffle",
      ["isShuffleEnabled"],
    ),
    toggleRepeat: buttonPreset(
      "Shuffle & Repeat",
      "Toggle Repeat",
      "REPEAT",
      "toggleRepeat",
      ["isRepeatEnabled"],
    ),
    repeatQueue: buttonPreset(
      "Shuffle & Repeat",
      "Repeat Queue",
      "REPEAT\\nQUEUE",
      "repeatQueue",
      ["isRepeatCurrentQueue"],
    ),
    repeatTrack: buttonPreset(
      "Shuffle & Repeat",
      "Repeat Track",
      "REPEAT\\nTRACK",
      "repeatTrack",
      ["isRepeatCurrentTrack"],
    ),
    disableRepeat: buttonPreset(
      "Shuffle & Repeat",
      "Repeat Off",
      "REPEAT\\nOFF",
      "disableRepeat",
    ),
    ...Object.fromEntries(
      streams.map((stream, index) => [`stream${index}`, streamPreset(stream)]),
    ),
  });
}

module.exports = UpdatePresets;
module.exports.parseStreamPresets = parseStreamPresets;
