module.exports = function (self) {
  const actions = {
    pause: {
      name: "Pause",
      options: [],
      callback: () => self.pauseAsync(),
    },
    stopPlayback: {
      name: "Stop playback",
      options: [],
      callback: () => self.stopAsync(),
    },
    togglePlayback: {
      name: "Toggle Play/Pause",
      options: [],
      callback: () => (self.isPlaying ? self.pauseAsync() : self.resumeAsync()),
    },
    volumeUp: {
      name: "Volume Up",
      options: [],
      callback: () => self.increaseVolumeAsync(),
    },
    volumeDown: {
      name: "Volume Down",
      options: [],
      callback: () => self.decreaseVolumeAsync(),
    },
    setVolume: {
      name: "Set Volume",
      options: [
        {
          type: "number",
          id: "level",
          label: "Volume (0-100)",
          default: 30,
          min: 0,
          max: 100,
          range: true,
        },
      ],
      callback: (event) => self.setVolumeAsync(event.options.level),
    },
    toggleMute: {
      name: "Toggle Mute",
      options: [],
      callback: () => self.toggleMuteAsync(),
    },
    mute: {
      name: "Mute",
      options: [],
      callback: () => self.setMuteAsync(true),
    },
    unmute: {
      name: "Unmute",
      options: [],
      callback: () => self.setMuteAsync(false),
    },
    resume: {
      name: "Resume",
      options: [],
      callback: () => self.resumeAsync(),
    },
    next: {
      name: "Next Track",
      options: [],
      callback: () => self.nextAsync(),
    },
    previous: {
      name: "Previous Track",
      options: [],
      callback: () => self.previousAsync(),
    },
    toggleShuffle: {
      name: "Toggle Shuffle",
      options: [],
      callback: () => self.toggleShuffleAsync(),
    },
    toggleRepeat: {
      name: "Toggle Repeat",
      options: [],
      callback: () => self.toggleRepeatAsync(),
    },
    repeatQueue: {
      name: "Set Repeat Queue",
      options: [],
      callback: () => self.turnOnRepeatCurrentQueueAsync(),
    },
    repeatTrack: {
      name: "Set Repeat Track",
      options: [],
      callback: () => self.turnOnRepeatCurrentTrackAsync(),
    },
    disableRepeat: {
      name: "Disable Repeat",
      options: [],
      callback: () => self.disableRepeatAsync(),
    },
    setStream: {
      name: "Set Stream",
      options: [
        {
          type: "textinput",
          id: "selectedStreamUrl",
          label: "Stream URL",
          tooltip:
            "Must start with http:// or https://. Variables are supported.",
          // No regex: it would reject variables. The URL is checked once the
          // variables have been parsed.
          useVariables: true,
        },
      ],
      callback: async (event, context) => {
        const streamUrl = await context.parseVariablesInString(
          event.options.selectedStreamUrl ?? "",
        );
        await self.setStreamSourceAsync(streamUrl.trim());
      },
    },
  };

  // Don't send requests to the device until it has been configured
  for (const action of Object.values(actions)) {
    const callback = action.callback;
    action.callback = async (event, context) => {
      if (!self.isConfigured()) {
        self.log("warn", "Player is not configured yet");
        return;
      }
      await callback(event, context);
    };
  }

  self.setActionDefinitions(actions);
};
