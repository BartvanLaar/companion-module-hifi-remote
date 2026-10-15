module.exports = function (self) {
  self.setVariableDefinitions([
    { variableId: "playbackSource", name: "Playback source" },
    { variableId: "playState", name: "Play state (play, pause, stop, …)" },
    { variableId: "volume", name: "Volume (0-100)" },
    { variableId: "muted", name: "Muted" },
    { variableId: "title", name: "Current track title" },
    { variableId: "artist", name: "Current artist" },
    { variableId: "album", name: "Current album" },
    { variableId: "nowPlayingLine1", name: "Now playing, line 1" },
    { variableId: "nowPlayingLine2", name: "Now playing, line 2" },
    { variableId: "nowPlayingLine3", name: "Now playing, line 3" },
    { variableId: "artworkUrl", name: "Current artwork URL" },
  ]);
};
