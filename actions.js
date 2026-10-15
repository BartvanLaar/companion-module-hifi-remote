module.exports = function (self) {
  const actions = {
    pause: {
      name: "Pause",
      options: [],
      callback: async (event) => {
        await self.pauseAsync();
      },
    },
    stopPlayback: {
      name: "Stop playback",
      options: [],
      callback: async (event) => {
        await self.stopAsync();
      },
    },
    togglePlayback: {
      name: "Toggle Play/Pause",
      options: [],
      callback: async (event) => {
        if (self.isPlaying) {
          await self.pauseAsync();
        } else {
          await self.resumeAsync();
        }
      },
    },
    volumeUp: {
      name: "Volume Up",
      options: [],
      callback: async (event) => {
        await self.increaseVolumeAsync();
      },
    },
    volumeDown: {
      name: "Volume Down",
      options: [],
      callback: async (event) => {
        await self.decreaseVolumeAsync();
      },
    },
    resume: {
      name: "Resume",
      options: [],
      callback: async (event) => {
        await self.resumeAsync();
      },
    },
    next: {
      name: "Next Track",
      options: [],
      callback: async (event) => {
        await self.nextAsync();
      },
    },
    previous: {
      name: "Previous Track",
      options: [],
      callback: async (event) => {
        await self.previousAsync();
      },
    },
    toggleShuffle: {
      name: "Toggle Shuffle",
      options: [],
      callback: async (event) => {
        await self.toggleShuffleAsync();
      },
    },
    toggleRepeat: {
      name: "Toggle Repeat",
      options: [],
      callback: async (event) => {
        await self.toggleRepeatAsync();
      },
    },
    repeatQueue: {
      name: "Set Repeat Queue",
      options: [],
      callback: async (event) => {
        await self.turnOnRepeatCurrentQueueAsync();
      },
    },
    repeatTrack: {
      name: "Set Repeat Track",
      options: [],
      callback: async (event) => {
        await self.turnOnRepeatCurrentTrackAsync();
      },
    },
    disableRepeat: {
      name: "Disable Repeat",
      options: [],
      callback: async (event) => {
        await self.disableRepeatAsync();
      },
    },
    setStream: {
      name: "Set Stream",
      options: [
        {
          type: "textinput",
          id: "selectedStreamUrl",
          label: "Stream URL",
          regex: "/^https?:\\/\\/.+/",
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
