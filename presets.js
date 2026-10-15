const { combineRgb } = require("@companion-module/base");

const white = combineRgb(255, 255, 255);
const black = combineRgb(0, 0, 0);
const activeStyle = {
  bgcolor: combineRgb(0, 153, 51),
  color: white,
};

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

module.exports = function (self) {
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
  });
};
