const { Regex } = require("@companion-module/base");

const DEFAULTS = Object.freeze({
  host: "",
  port: 11000,
  pollIntervalSeconds: 5,
  volumeStepDb: 2,
  streamPresets: "",
});

module.exports = {
  DEFAULTS,
  GetConfigurationFields,
  SetConfigurationFieldDefaultValues,
};

function SetConfigurationFieldDefaultValues(self, config) {
  config.host = (config.host || DEFAULTS.host).trim();
  config.port ||= DEFAULTS.port;
  config.pollIntervalSeconds ||= DEFAULTS.pollIntervalSeconds;
  config.volumeStepDb ||= DEFAULTS.volumeStepDb;
  config.streamPresets = (
    config.streamPresets || DEFAULTS.streamPresets
  ).trim();
  return config;
}

function GetConfigurationFields(self) {
  return [
    {
      id: "host",
      type: "textinput",
      label: "Player Hostname or IP Address",
      default: DEFAULTS.host,
      regex: Regex.HOSTNAME,
      required: true,
    },
    {
      id: "port",
      type: "number",
      label: "Player API Port",
      default: DEFAULTS.port,
      min: 1,
      max: 65535,
    },
    {
      id: "pollIntervalSeconds",
      type: "number",
      label: "Reconnect / Fallback Poll Interval (seconds)",
      tooltip:
        "Status updates are pushed by the player instantly. This interval is only used to retry while the player is unreachable, or to poll players that don't support instant updates.",
      default: DEFAULTS.pollIntervalSeconds,
      min: 1,
      max: 3600,
    },
    {
      id: "volumeStepDb",
      type: "number",
      label: "Volume increase/decrease step (dB).",
      default: DEFAULTS.volumeStepDb,
      min: 1,
      max: 10,
    },
    {
      id: "streamPresets",
      type: "textinput",
      label: "Stream presets",
      tooltip:
        "Your own stations, as Name=URL separated by semicolons, e.g. My Radio=https://radio.example/live; Jazz=https://jazz.example/stream. Each one becomes a button in the Presets tab under Streams.",
      default: DEFAULTS.streamPresets,
    },
  ];
}
