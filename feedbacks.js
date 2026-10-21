const { combineRgb } = require("@companion-module/base");

const activeStyle = {
  bgcolor: combineRgb(0, 153, 51),
  color: combineRgb(255, 255, 255),
};

module.exports = function (self) {
  self.setFeedbackDefinitions({
    playbackState: {
      name: "Playback State (Playing)",
      type: "boolean",
      description: "True when the device is playing",
      defaultStyle: activeStyle,
      options: [],
      callback: () => {
        return self.isPlaying === true;
      },
    },
    playState: {
      name: "Play State",
      type: "boolean",
      description:
        "True when the player is playing, paused or stopped, as chosen. Unlike Playback State, this tells paused apart from stopped",
      defaultStyle: activeStyle,
      options: [
        {
          id: "state",
          type: "dropdown",
          label: "State",
          choices: [
            { id: "playing", label: "Playing" },
            { id: "paused", label: "Paused" },
            { id: "stopped", label: "Stopped" },
          ],
          default: "playing",
        },
      ],
      callback: (feedback) => {
        switch (feedback.options.state) {
          case "playing":
            return self.isPlaying === true;
          case "paused":
            return self.isPlaying !== true && self.playState === "pause";
          case "stopped":
            return self.isPlaying !== true && self.playState === "stop";
          default:
            return false;
        }
      },
    },
    isShuffleEnabled: {
      name: "Shuffle Enabled",
      type: "boolean",
      description: "True when shuffle is enabled",
      defaultStyle: activeStyle,
      options: [],
      callback: () => {
        return self.isShuffleEnabled === true;
      },
    },
    isRepeatEnabled: {
      name: "Repeat Enabled",
      type: "boolean",
      description: "True when any repeat mode is enabled",
      defaultStyle: activeStyle,
      options: [],
      callback: () => {
        return self.isRepeatEnabled === true;
      },
    },
    isRepeatCurrentTrack: {
      name: "Repeat Current Track Enabled",
      type: "boolean",
      description: "True when repeat current track is enabled",
      defaultStyle: activeStyle,
      options: [],
      callback: () => {
        return self.isRepeatCurrentTrack === true;
      },
    },
    isRepeatCurrentQueue: {
      name: "Repeat Current Queue Enabled",
      type: "boolean",
      description: "True when repeat current queue is enabled",
      defaultStyle: activeStyle,
      options: [],
      callback: () => {
        return self.isRepeatCurrentQueue === true;
      },
    },
    activeStream: {
      name: "Active Stream",
      type: "boolean",
      description: "True when the given stream URL is the one currently set",
      defaultStyle: activeStyle,
      options: [
        {
          id: "stream",
          type: "textinput",
          label: "Stream URL",
          // No regex: it would reject variables
          useVariables: true,
        },
      ],
      callback: async (feedback, context) => {
        if (!self.currentStream || self.isConnected === false) {
          return false;
        }
        const stream = await context.parseVariablesInString(
          feedback.options.stream ?? "",
        );
        return self.currentStream === stream.trim();
      },
    },
    isStreamEnabled: {
      name: "Stream Enabled",
      type: "boolean",
      description: "True when the playback source is an internet stream",
      defaultStyle: activeStyle,
      options: [],
      callback: () => {
        return self.playbackSource === "stream";
      },
    },
    isSpotifyEnabled: {
      name: "Spotify Enabled",
      type: "boolean",
      description: "True when the playback source is Spotify",
      defaultStyle: activeStyle,
      options: [],
      callback: () => {
        return self.playbackSource === "spotify";
      },
    },
    isBluetoothEnabled: {
      name: "Bluetooth Enabled",
      type: "boolean",
      description: "True when the playback source is Bluetooth",
      defaultStyle: activeStyle,
      options: [],
      callback: () => {
        return self.playbackSource === "bluetooth";
      },
    },
    isMuted: {
      name: "Muted",
      type: "boolean",
      description: "True when the player is muted",
      defaultStyle: activeStyle,
      options: [],
      callback: () => {
        return self.isMuted === true;
      },
    },
  });
};
module.exports.activeStyle = activeStyle;
