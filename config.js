const { Regex } = require("@companion-module/base");

module.exports = { GetConfigurationFields, SetConfigurationFieldDefaultValues };

function SetConfigurationFieldDefaultValues(self, config) {
  config.host = (config.host || "").trim();
  config.port ||= 11000;
  config.pollIntervalSeconds ||= 5;
  config.volumeStepDb ||= 2;
  return config;
}

function GetConfigurationFields(self) {
  return [
    {
      id: "host",
      type: "textinput",
      label: "Player Hostname or IP Address",
      default: "",
      regex: Regex.HOSTNAME,
      required: true,
    },
    {
      id: "port",
      type: "number",
      label: "Player API Port",
      default: 11000,
      min: 1,
      max: 65535,
    },
    {
      id: "pollIntervalSeconds",
      type: "number",
      label: "Status Poll Interval (seconds)",
      default: 5,
      min: 1,
      max: 3600,
    },
    {
      id: "volumeStepDb",
      type: "number",
      label: "Volume increase/decrease step (dB).",
      default: 2,
      min: 1,
      max: 10,
    },
  ];
}
