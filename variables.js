module.exports = function (self) {
  self.setVariableDefinitions([
    { variableId: "playbackSource", name: "Playback source" },
    { variableId: "playState", name: "Play state (play, pause, stop, …)" },
    { variableId: "volume", name: "Volume (0-100)" },
    { variableId: "muted", name: "Muted" },
    { variableId: "title", name: "Current track title" },
    { variableId: "artist", name: "Current artist" },
    { variableId: "album", name: "Current album" },
    { variableId: "artworkUrl", name: "Current artwork URL" },
  ]);
};
