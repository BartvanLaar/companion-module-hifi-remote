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
  DEFAULTS,
  GetConfigurationFields,
  SetConfigurationFieldDefaultValues,
} = require("./config");

const REQUEST_TIMEOUT_MS = 5000;
// How long the player may hold a status request open before answering
const LONG_POLL_TIMEOUT_SECONDS = 100;
// Extra time on top of the long poll before we consider the request hung
const LONG_POLL_GRACE_MS = 10000;

// BluOS repeat states
const REPEAT_QUEUE = 0;
const REPEAT_TRACK = 1;
const REPEAT_OFF = 2;

// Which feedbacks have to be re-evaluated when a piece of state changes
const FEEDBACKS_BY_STATE = {
  isPlaying: ["playbackState"],
  isShuffleEnabled: ["isShuffleEnabled"],
  isRepeatEnabled: ["isRepeatEnabled"],
  isRepeatCurrentTrack: ["isRepeatCurrentTrack"],
  isRepeatCurrentQueue: ["isRepeatCurrentQueue"],
  isMuted: ["isMuted"],
  playbackSource: ["isStreamEnabled", "isSpotifyEnabled", "isBluetoothEnabled"],
  currentStream: ["activeStream"],
};

class ModuleInstance extends InstanceBase {
  constructor(internal) {
    super(internal);
    this._xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
    });
    this._isConnected = null;
    this._statusEtag = null;
    this._pollGeneration = 0;
    this._pollAbortController = null;
    this._commandCount = 0;
    this._variableValues = {};
    this.pollIntervalSeconds = DEFAULTS.pollIntervalSeconds;
    this.currentStream = null;
    this.playbackSource = null;
    this.playState = null;
    this.isPlaying = false;
    this.isShuffleEnabled = null;
    this.isRepeatEnabled = null;
    this.isRepeatCurrentTrack = null;
    this.isRepeatCurrentQueue = null;
    this.isMuted = null;
    this.volume = null;
    this.title = null;
    this.artist = null;
    this.album = null;
    this.artworkUrl = null;
  }

  async init(config) {
    this.updateActions();
    this.updateFeedbacks();
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
    this.pollIntervalSeconds =
      Number(this.config.pollIntervalSeconds) || DEFAULTS.pollIntervalSeconds;
    this._isConnected = null;
    this.updatePresets();

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

  get isPolling() {
    return this._pollAbortController !== null;
  }

  get baseUrl() {
    return `http://${this.config.host}:${this.config.port}`;
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
   * error, updates the connection status and returns null. Requests cancelled
   * through `signal` (e.g. when polling stops) return null silently.
   */
  async requestAsync(
    path,
    errorDescription,
    { timeoutMs = REQUEST_TIMEOUT_MS, signal } = {},
  ) {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    let response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: "GET",
        signal: signal
          ? AbortSignal.any([timeoutSignal, signal])
          : timeoutSignal,
      });
    } catch (e) {
      if (signal?.aborted) {
        return null;
      }
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

  /**
   * Applies the given state, then re-evaluates only the feedbacks and
   * variables that actually changed.
   */
  updateState(changes) {
    const changedFeedbacks = new Set();
    for (const [key, value] of Object.entries(changes)) {
      if (this[key] === value) {
        continue;
      }
      this[key] = value;
      for (const feedbackId of FEEDBACKS_BY_STATE[key] ?? []) {
        changedFeedbacks.add(feedbackId);
      }
    }

    if (changedFeedbacks.size > 0) {
      this.checkFeedbacks(...changedFeedbacks);
    }
    this.updateVariableValues();
  }

  /**
   * Sends a command to the player. The expected state is shown straight away
   * and rolled back if the player rejects the command. The real state then
   * arrives through the status long poll.
   */
  async sendCommandAsync(path, errorDescription, expectedState = {}) {
    const previousState = {};
    for (const key of Object.keys(expectedState)) {
      previousState[key] = this[key];
    }

    this._commandCount++;
    this.updateState(expectedState);
    const response = await this.requestAsync(path, errorDescription);
    if (!response) {
      this.updateState(previousState);
      return false;
    }
    return true;
  }

  async setStreamSourceAsync(streamUrl) {
    if (!streamUrl) {
      this.log("error", "No stream URL provided");
      return;
    }

    await this.sendCommandAsync(
      `/Play?url=${encodeURIComponent(streamUrl)}`,
      "Error playing stream",
      { currentStream: streamUrl, isPlaying: true },
    );
  }

  async stopAsync() {
    await this.sendCommandAsync("/Stop", "Error stopping music", {
      isPlaying: false,
    });
  }

  async resumeAsync() {
    await this.sendCommandAsync("/Play", "Error playing/resuming music", {
      isPlaying: true,
    });
  }

  async pauseAsync() {
    await this.sendCommandAsync("/Pause", "Error pausing music", {
      isPlaying: false,
    });
  }

  async nextAsync() {
    await this.sendCommandAsync("/Skip", "Error skipping to next track");
  }

  async previousAsync() {
    await this.sendCommandAsync("/Back", "Error going to previous track");
  }

  async toggleShuffleAsync() {
    const isShuffleEnabled = !this.isShuffleEnabled;
    await this.sendCommandAsync(
      `/Shuffle?state=${isShuffleEnabled ? 1 : 0}`,
      "Error toggling shuffle",
      { isShuffleEnabled },
    );
  }

  async setRepeatAsync(repeatState, errorDescription) {
    await this.sendCommandAsync(
      `/Repeat?state=${repeatState}`,
      errorDescription,
      getRepeatState(repeatState),
    );
  }

  async disableRepeatAsync() {
    await this.setRepeatAsync(REPEAT_OFF, "Error turning off repeat");
  }

  async turnOnRepeatCurrentQueueAsync() {
    await this.setRepeatAsync(
      REPEAT_QUEUE,
      "Error turning on repeat current queue",
    );
  }

  async turnOnRepeatCurrentTrackAsync() {
    await this.setRepeatAsync(
      REPEAT_TRACK,
      "Error turning on repeat current track",
    );
  }

  async toggleRepeatAsync() {
    // Cycles repeat queue -> repeat track -> off -> repeat queue
    const newRepeatState = this.isRepeatCurrentQueue
      ? REPEAT_TRACK
      : this.isRepeatCurrentTrack
        ? REPEAT_OFF
        : REPEAT_QUEUE;
    await this.setRepeatAsync(newRepeatState, "Error toggling repeat");
  }

  async increaseVolumeAsync() {
    await this.sendCommandAsync(
      `/Volume?db=${this.config.volumeStepDb}`,
      "Error increasing volume",
    );
  }

  async decreaseVolumeAsync() {
    await this.sendCommandAsync(
      `/Volume?db=${-this.config.volumeStepDb}`,
      "Error decreasing volume",
    );
  }

  async setVolumeAsync(level) {
    const volume = Math.round(Math.min(100, Math.max(0, Number(level) || 0)));
    await this.sendCommandAsync(
      `/Volume?level=${volume}`,
      "Error setting volume",
      { volume },
    );
  }

  async setMuteAsync(isMuted) {
    await this.sendCommandAsync(
      `/Volume?mute=${isMuted ? 1 : 0}`,
      isMuted ? "Error muting" : "Error unmuting",
      { isMuted },
    );
  }

  async toggleMuteAsync() {
    await this.setMuteAsync(!this.isMuted);
  }

  /**
   * Fetches the player status and applies it. With `longPoll`, the player
   * holds the request until its status changes (or the long poll times out).
   * Returns true when a status was applied.
   */
  async updateDeviceStatusAsync({ longPoll = false, signal } = {}) {
    let path = "/Status";
    let timeoutMs = REQUEST_TIMEOUT_MS;
    if (longPoll && this._statusEtag) {
      path += `?timeout=${LONG_POLL_TIMEOUT_SECONDS}&etag=${encodeURIComponent(this._statusEtag)}`;
      timeoutMs = LONG_POLL_TIMEOUT_SECONDS * 1000 + LONG_POLL_GRACE_MS;
    }

    const commandCount = this._commandCount;
    const statusResponse = await this.requestAsync(
      path,
      "Failed to get player status",
      { timeoutMs, signal },
    );
    if (!statusResponse) {
      return false;
    }

    let status;
    try {
      status = this._xmlParser.parse(await statusResponse.text()).status;
    } catch (e) {
      if (signal?.aborted) {
        return false;
      }
      this.log("error", `Failed to read player status: ${e.message}`);
      return false;
    }
    if (!status || typeof status !== "object") {
      this.log("error", "Player status response contained no status");
      return false;
    }

    // A command was sent while this request was underway, so the status may
    // predate it and would undo the command's expected state. Keep the old
    // etag, so the next long poll returns the up-to-date status immediately.
    if (commandCount !== this._commandCount) {
      return true;
    }

    this._statusEtag = status["@_etag"] ?? null;
    this.applyDeviceStatus(status);
    return true;
  }

  applyDeviceStatus(status) {
    const playState = getText(status.state);
    const playbackSource = getPlaybackSource(getText(status.service));
    const volume = getText(status.volume);

    this.updateState({
      ...getRepeatState(Number(getText(status.repeat))),
      playState: playState || null,
      isPlaying: playState === "stream" || playState === "play",
      isShuffleEnabled: Number(getText(status.shuffle)) === 1,
      isMuted: Number(getText(status.mute)) === 1,
      volume: volume ? Number(volume) : null,
      playbackSource,
      // Another source took over, so our stream is no longer the active one
      currentStream:
        playbackSource && playbackSource !== "stream"
          ? null
          : this.currentStream,
      title: getText(status.name ?? status.title1) || null,
      artist: getText(status.artist ?? status.title2) || null,
      album: getText(status.album ?? status.title3) || null,
      artworkUrl: this.getArtworkUrl(getText(status.image)),
    });
  }

  getArtworkUrl(image) {
    if (!image) {
      return null;
    }
    // The player returns its own artwork as a path, e.g. /Artwork?service=...
    return image.startsWith("/") ? `${this.baseUrl}${image}` : image;
  }

  async startStatusPollingAsync() {
    this.stopStatusPolling();
    const generation = ++this._pollGeneration;
    const abortController = new AbortController();
    this._pollAbortController = abortController;
    this.log("info", "Starting status updates");

    // Get the current status right away, then keep listening for changes in
    // the background
    const isUpdated = await this.updateDeviceStatusAsync({
      signal: abortController.signal,
    });
    if (generation !== this._pollGeneration) {
      return;
    }
    this.pollStatusLoopAsync(generation, abortController.signal, isUpdated);
  }

  async pollStatusLoopAsync(generation, signal, isUpdated) {
    while (generation === this._pollGeneration) {
      // Wait before retrying a failed request, and before polling again when
      // the player doesn't support long polling (it sent no etag)
      if (!isUpdated || !this._statusEtag) {
        await delayAsync(this.pollIntervalSeconds * 1000, signal);
        if (generation !== this._pollGeneration) {
          return;
        }
      }

      try {
        isUpdated = await this.updateDeviceStatusAsync({
          longPoll: true,
          signal,
        });
      } catch (e) {
        this.log("error", `Status poll error: ${e}`);
        isUpdated = false;
      }
    }
  }

  stopStatusPolling() {
    this._pollGeneration++;
    this._statusEtag = null;
    if (this._pollAbortController) {
      this._pollAbortController.abort();
      this._pollAbortController = null;
      this._commandCount = 0;
      this.log("info", "Stopped status updates");
    }
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
    const values = {
      playbackSource: this.playbackSource ?? "",
      playState: this.playState ?? "",
      volume: this.volume ?? "",
      muted: this.isMuted === true,
      title: this.title ?? "",
      artist: this.artist ?? "",
      album: this.album ?? "",
      artworkUrl: this.artworkUrl ?? "",
    };

    const changedValues = {};
    for (const [id, value] of Object.entries(values)) {
      if (this._variableValues[id] !== value) {
        changedValues[id] = value;
      }
    }
    if (Object.keys(changedValues).length > 0) {
      Object.assign(this._variableValues, changedValues);
      this.setVariableValues(changedValues);
    }
  }

  getConfigFields() {
    return GetConfigurationFields(this);
  }
}

function getRepeatState(repeatState) {
  return {
    isRepeatEnabled:
      repeatState === REPEAT_QUEUE || repeatState === REPEAT_TRACK,
    isRepeatCurrentTrack: repeatState === REPEAT_TRACK,
    isRepeatCurrentQueue: repeatState === REPEAT_QUEUE,
  };
}

/**
 * Returns the text of an XML element as a string. Elements with attributes
 * are parsed as objects, and numeric text (e.g. a song called "1999") as
 * numbers.
 */
function getText(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    return getText(value["#text"]);
  }
  return String(value).trim();
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

/**
 * Resolves after `ms`, or as soon as `signal` is aborted.
 */
function delayAsync(ms, signal) {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

runEntrypoint(ModuleInstance, UpgradeScripts);
module.exports = ModuleInstance;
