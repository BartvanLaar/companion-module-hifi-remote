const { combineRgb } = require("@companion-module/base");
const { activeStyle } = require("./feedbacks");

const white = combineRgb(255, 255, 255);
const black = combineRgb(0, 0, 0);

const HTTP_URL = /^https?:\/\/.+/;

/**
 * Parses the "Stream presets" config field: entries of `Name=URL`, or
 * `Name=URL|LogoURL`, separated by semicolons. Returns the valid streams and
 * the entries that were skipped.
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
    const [url, image, ...rest] = trimmedEntry
      .slice(separatorIndex + 1)
      .split("|")
      .map((part) => part.trim());
    if (
      separatorIndex < 1 ||
      !label ||
      !HTTP_URL.test(url) ||
      (image !== undefined && !HTTP_URL.test(image)) ||
      rest.length > 0
    ) {
      invalidEntries.push(trimmedEntry);
      continue;
    }
    streams.push(image ? { label, url, image } : { label, url });
  }

  return { streams, invalidEntries };
}

function streamPreset({ label, url, image }) {
  return {
    ...buttonPreset("Streams", label, label, "setStream"),
    steps: [
      {
        down: [
          {
            actionId: "setStream",
            options: {
              selectedStreamUrl: url,
              stationName: label,
              imageUrl: image ?? "",
            },
          },
        ],
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
      `Ignoring stream preset "${entry}", use Name=https://stream-url or Name=https://stream-url|https://logo-url`,
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
