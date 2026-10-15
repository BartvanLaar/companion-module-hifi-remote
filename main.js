const {
  InstanceBase,
  runEntrypoint,
  InstanceStatus,
} = require("@companion-module/base");
const { XMLParser } = require("fast-xml-parser");
const UpgradeScripts = require("./upgrades");
const UpdateActions = require("./actions");
const UpdateFeedbacks = require("./feedbacks");
const UpdatePresets = require("./presets");
const UpdateVariableDefinitions = require("./variables");
const {
  GetConfigurationFields,
  SetConfigurationFieldDefaultValues,
} = require("./config");

const REQUEST_TIMEOUT_MS = 5000;

class ModuleInstance extends InstanceBase {
  constructor(internal) {
    super(internal);
    this._xmlParser = new XMLParser();
    this.playbackSource = null;
    this.isPlaying = false;
    this._statusPollTimer = null;
    this._statusPollInFlight = false;
    this._isConnected = null;
    this.pollIntervalSeconds = 5; // default, can be overridden by config
    this.currentStream = null;
    this.isShuffleEnabled = null;
    this.isRepeatEnabled = null;
    this.isRepeatCurrentTrack = null;
    this.isRepeatCurrentQueue = null;
  }

  async init(config) {
    this.updateActions();
    this.updateFeedbacks();
    this.updatePresets();
    this.updateVariableDefinitions();
    this.updateVariableValues();

    await this.applyConfigAsync(config);
  }

  // When module gets deleted
  async destroy() {
    this.stopStatusPolling();
  }

  async configUpdated(config) {
    await this.applyConfigAsync(config);
  }

  async applyConfigAsync(config) {
    this.config = SetConfigurationFieldDefaultValues(this, config);
    this.pollIntervalSeconds = Number(this.config.pollIntervalSeconds) || 5;
    this._isConnected = null;

    if (!this.isConfigured()) {
      this.stopStatusPolling();
      this.updateStatus(
        InstanceStatus.BadConfig,
        "Set the hostname or IP address of your player",
      );
      return;
    }

    this.updateStatus(InstanceStatus.Connecting);
    await this.startStatusPollingAsync();
  }

  isConfigured() {
    return !!this.config?.host;
  }

  setConnectionState(isConnected) {
    if (this._isConnected === isConnected) {
      return;
    }
    this._isConnected = isConnected;

    if (isConnected) {
      this.updateStatus(InstanceStatus.Ok);
    } else {
      this.updateStatus(
        InstanceStatus.ConnectionFailure,
        `Cannot reach ${this.config.host}:${this.config.port}`,
      );
    }
  }

  /**
   * Sends a GET request to the player. Never throws: on failure it logs the
   * error, updates the connection status and returns null.
   */
  async requestAsync(path, errorDescription) {
    const url = `http://${this.config.host}:${this.config.port}${path}`;

    let response;
    try {
      response = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (e) {
      // Only log loudly on the first failure, not on every poll while offline
      const level = this._isConnected === false ? "debug" : "error";
      this.log(level, `${errorDescription}: ${e.cause?.message ?? e.message}`);
      this.setConnectionState(false);
      return null;
    }

    this.setConnectionState(true);
    if (!response.ok) {
      this.log(
        "error",
        `${errorDescription}: ${response.status} ${response.statusText}`,
      );
      return null;
    }

    return response;
  }

  async setStreamSourceAsync(streamUrl) {
    if (!streamUrl) {
      this.log("error", "No stream URL provided");
      return;
    }

    this.currentStream = streamUrl;
    this.checkFeedbacks();
    await this.playAsync(`?url=${encodeURIComponent(streamUrl)}`);
  }

  async stopAsync() {
    this.isPlaying = false;
    this.checkFeedbacks();
    await this.requestAsync("/Stop", "Error stopping music");
    await this.updateDeviceStatusAsync();
  }

  async resumeAsync() {
    await this.playAsync();
  }

  async toggleShuffleAsync() {
    const newShuffleState = this.isShuffleEnabled ? 0 : 1;
    this.isShuffleEnabled = !this.isShuffleEnabled;
    this.checkFeedbacks();
    await this.requestAsync(
      `/Shuffle?state=${newShuffleState}`,
      "Error toggling shuffle",
    );
    await this.updateDeviceStatusAsync();
  }

  async disableRepeatAsync() {
    this.isRepeatEnabled = false;
    this.isRepeatCurrentTrack = false;
    this.isRepeatCurrentQueue = false;
    this.checkFeedbacks();
    await this.requestAsync("/Repeat?state=2", "Error turning off repeat");
    await this.updateDeviceStatusAsync();
  }

  async turnOnRepeatCurrentQueueAsync() {
    this.isRepeatEnabled = true;
    this.isRepeatCurrentTrack = false;
    this.isRepeatCurrentQueue = true;
    this.checkFeedbacks();
    await this.requestAsync(
      "/Repeat?state=0",
      "Error turning on repeat current queue",
    );
    await this.updateDeviceStatusAsync();
  }

  async turnOnRepeatCurrentTrackAsync() {
    this.isRepeatEnabled = true;
    this.isRepeatCurrentTrack = true;
    this.isRepeatCurrentQueue = false;
    this.checkFeedbacks();
    await this.requestAsync(
      "/Repeat?state=1",
      "Error turning on repeat current track",
    );
    await this.updateDeviceStatusAsync();
  }

  async toggleRepeatAsync() {
    // Cycles repeat queue (0) -> repeat track (1) -> off (2) -> repeat queue
    const newRepeatState = this.isRepeatCurrentQueue
      ? 1
      : this.isRepeatCurrentTrack
        ? 2
        : 0;
    await this.requestAsync(
      `/Repeat?state=${newRepeatState}`,
      "Error toggling repeat",
    );
    await this.updateDeviceStatusAsync();
  }

  async playAsync(queryParameters) {
    queryParameters ||= "";
    this.isPlaying = true;
    this.checkFeedbacks();
    await this.requestAsync(
      `/Play${queryParameters}`,
      "Error playing/resuming music",
    );
    await this.updateDeviceStatusAsync();
  }

  async increaseVolumeAsync() {
    const volumeIncreaseDb = this.config.volumeStepDb;
    await this.requestAsync(
      `/Volume?db=${volumeIncreaseDb}`,
      "Error increasing volume",
    );
    await this.updateDeviceStatusAsync();
  }

  async decreaseVolumeAsync() {
    const volumeDecreaseDb = -this.config.volumeStepDb;
    await this.requestAsync(
      `/Volume?db=${volumeDecreaseDb}`,
      "Error decreasing volume",
    );
    await this.updateDeviceStatusAsync();
  }

  async updateDeviceStatusAsync() {
    const statusResponse = await this.requestAsync(
      "/Status",
      "Failed to get player status",
    );
    if (!statusResponse) {
      return;
    }

    let realStatus;
    try {
      realStatus = this._xmlParser.parse(await statusResponse.text()).status;
    } catch (e) {
      this.log("error", `Failed to read player status: ${e.message}`);
      return;
    }
    if (!realStatus) {
      this.log("error", "Player status response contained no status");
      return;
    }

    this.isShuffleEnabled = realStatus.shuffle === 1;
    this.isRepeatEnabled = realStatus.repeat !== 2;
    this.isRepeatCurrentTrack = realStatus.repeat === 1;
    this.isRepeatCurrentQueue = realStatus.repeat === 0;
    this.isPlaying =
      realStatus.state === "stream" || realStatus.state === "play";

    this.playbackSource = getPlaybackSource(realStatus.service);
    // Another source took over, so our stream is no longer the active one
    if (this.playbackSource && this.playbackSource !== "stream") {
      this.currentStream = null;
    }

    this.updateVariableValues();
    this.checkFeedbacks();
  }

  async startStatusPollingAsync() {
    this.stopStatusPolling();
    const interval = Number(this.pollIntervalSeconds);
    this.log("info", `Starting status polling every ${interval}s`);

    // Start the timer before the first poll, so polling keeps running even
    // when the player is unreachable at startup
    this._statusPollTimer = setInterval(
      () => this.pollStatusAsync(),
      interval * 1000,
    );
    await this.pollStatusAsync();
  }

  async pollStatusAsync() {
    if (this._statusPollInFlight) {
      return;
    }
    this._statusPollInFlight = true;
    try {
      await this.updateDeviceStatusAsync();
    } catch (e) {
      this.log("error", `Status poll error: ${e}`);
    } finally {
      this._statusPollInFlight = false;
    }
  }

  stopStatusPolling() {
    if (this._statusPollTimer) {
      clearInterval(this._statusPollTimer);
      this._statusPollTimer = null;
      this.log("info", "Stopped status polling");
    }
  }

  async pauseAsync() {
    this.isPlaying = false;
    this.checkFeedbacks();
    await this.requestAsync("/Pause", "Error pausing music");
    await this.updateDeviceStatusAsync();
  }

  async nextAsync() {
    await this.requestAsync("/Skip", "Error skipping to next track");
    await this.updateDeviceStatusAsync();
  }

  async previousAsync() {
    await this.requestAsync("/Back", "Error going to previous track");
    await this.updateDeviceStatusAsync();
  }

  updateActions() {
    UpdateActions(this);
  }

  updateFeedbacks() {
    UpdateFeedbacks(this);
  }

  updatePresets() {
    UpdatePresets(this);
  }

  updateVariableDefinitions() {
    UpdateVariableDefinitions(this);
  }

  updateVariableValues() {
    this.setVariableValues({
      playbackSource: this.playbackSource ?? "",
    });
  }

  getConfigFields() {
    return GetConfigurationFields(this);
  }
}

/**
 * Maps the BluOS `service` field to a playback source. Known sources get a
 * fixed name, other services (e.g. TuneIn, Tidal) are passed through as-is.
 */
function getPlaybackSource(service) {
  const normalizedService = String(service ?? "")
    .trim()
    .toLowerCase();

  if (!normalizedService) {
    return null;
  }
  if (normalizedService.includes("bluetooth")) {
    return "bluetooth";
  }
  if (normalizedService.includes("spotify")) {
    return "spotify";
  }
  if (normalizedService.includes("http")) {
    return "stream";
  }
  return normalizedService;
}

runEntrypoint(ModuleInstance, UpgradeScripts);
module.exports = ModuleInstance;
