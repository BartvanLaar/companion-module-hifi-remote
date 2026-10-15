const Module = require("node:module");
const path = require("node:path");

const realBase = require("@companion-module/base");

/**
 * Stand-in for Companion's InstanceBase that records what the module does
 * instead of talking to Companion over IPC.
 */
class FakeInstanceBase {
  constructor() {
    this.logs = [];
    this.statuses = [];
    this.variableValues = {};
    this.feedbackChecks = [];
    this.label = "hifi-remote";
  }
  log(level, message) {
    this.logs.push({ level, message });
  }
  updateStatus(status, message) {
    this.statuses.push({ status, message });
  }
  setActionDefinitions(actions) {
    this.actionDefinitions = actions;
  }
  setFeedbackDefinitions(feedbacks) {
    this.feedbackDefinitions = feedbacks;
  }
  setPresetDefinitions(presets) {
    this.presetDefinitions = presets;
  }
  setVariableDefinitions(variables) {
    this.variableDefinitions = variables;
  }
  setVariableValues(values) {
    Object.assign(this.variableValues, values);
  }
  checkFeedbacks(...feedbackIds) {
    // Snapshot the state the feedbacks would see at this moment
    this.feedbackChecks.push({
      feedbackIds,
      isPlaying: this.isPlaying,
      isShuffleEnabled: this.isShuffleEnabled,
      isRepeatEnabled: this.isRepeatEnabled,
      isRepeatCurrentTrack: this.isRepeatCurrentTrack,
      isRepeatCurrentQueue: this.isRepeatCurrentQueue,
    });
  }
  get lastStatus() {
    return this.statuses.at(-1)?.status;
  }
}

const fakeBase = {
  ...realBase,
  InstanceBase: FakeInstanceBase,
  runEntrypoint: () => {},
};

const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "@companion-module/base") {
    return fakeBase;
  }
  return originalLoad.call(this, request, ...rest);
};

const ModuleInstance = require(path.join(__dirname, "..", "main.js"));

/**
 * Replaces global fetch with an in-memory BluOS player.
 */
class FakePlayer {
  constructor() {
    this.online = true;
    this.httpStatus = 200;
    this.requests = [];
    this.state = "pause";
    this.service = "Spotify";
    this.shuffle = 0;
    this.repeat = 2;
    this.volume = 30;
    this.mute = 0;
    this.title = "";
    this.artist = "";
    this.album = "";
    this.image = "";
    this.statusBody = null;
    this.etag = 1;
    this.supportsLongPolling = true;
    this._waitingForChange = [];
  }

  install() {
    this._originalFetch = globalThis.fetch;
    globalThis.fetch = (url, options = {}) =>
      this.handle(new URL(url), options.signal);
  }

  uninstall() {
    globalThis.fetch = this._originalFetch;
  }

  /** Commands sent to the player, without the status requests */
  get paths() {
    return this.requests
      .filter((url) => url.pathname !== "/Status")
      .map((url) => url.pathname + url.search);
  }

  get statusRequests() {
    return this.requests.filter((url) => url.pathname === "/Status");
  }

  get waitingLongPolls() {
    return this._waitingForChange.length;
  }

  /** Bumps the etag and answers the waiting long polls, like a real player */
  changed() {
    this.etag++;
    const waiting = this._waitingForChange;
    this._waitingForChange = [];
    for (const resolve of waiting) {
      resolve();
    }
  }

  async handle(url, signal) {
    if (!this.online) {
      throw new TypeError("fetch failed", {
        cause: new Error(`connect ECONNREFUSED ${url.host}`),
      });
    }
    this.requests.push(url);

    if (this.httpStatus !== 200) {
      return new Response("", { status: this.httpStatus });
    }

    const params = url.searchParams;
    if (url.pathname === "/Status") {
      if (
        this.supportsLongPolling &&
        params.has("timeout") &&
        params.get("etag") === String(this.etag)
      ) {
        await this.waitForChange(signal);
      }
      return new Response(this.statusBody ?? this.statusXml());
    }

    switch (url.pathname) {
      case "/Play":
        this.state = params.has("url") ? "stream" : "play";
        if (params.has("url")) {
          this.service = params.get("url");
        }
        break;
      case "/Pause":
        this.state = "pause";
        break;
      case "/Stop":
        this.state = "stop";
        break;
      case "/Shuffle":
        this.shuffle = Number(params.get("state"));
        break;
      case "/Repeat":
        this.repeat = Number(params.get("state"));
        break;
      case "/Volume":
        if (params.has("db")) {
          this.volume += Number(params.get("db"));
        }
        if (params.has("level")) {
          this.volume = Number(params.get("level"));
        }
        if (params.has("mute")) {
          this.mute = Number(params.get("mute"));
        }
        break;
    }
    this.changed();
    return new Response("<ok/>");
  }

  waitForChange(signal) {
    return new Promise((resolve, reject) => {
      const onChange = () => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      };
      const onAbort = () => {
        this._waitingForChange = this._waitingForChange.filter(
          (waiting) => waiting !== onChange,
        );
        reject(new DOMException("This operation was aborted", "AbortError"));
      };
      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener("abort", onAbort, { once: true });
      this._waitingForChange.push(onChange);
    });
  }

  statusXml() {
    const etag = this.supportsLongPolling ? ` etag="${this.etag}"` : "";
    return (
      `<status${etag}><state>${this.state}</state>` +
      `<service>${this.service}</service>` +
      `<shuffle>${this.shuffle}</shuffle><repeat>${this.repeat}</repeat>` +
      `<volume>${this.volume}</volume><mute>${this.mute}</mute>` +
      `<name>${this.title}</name><artist>${this.artist}</artist>` +
      `<album>${this.album}</album>` +
      `<title1>${this.title}</title1><title2>${this.artist}</title2>` +
      `<title3>${this.album}</title3><image>${this.image}</image></status>`
    );
  }
}

const variableContext = (variables = {}) => ({
  parseVariablesInString: async (text) =>
    text.replace(/\$\(([^)]+)\)/g, (match, name) => variables[name] ?? ""),
});

/**
 * Creates an initialised module instance talking to a fake player. Uses a long
 * poll interval so the timer never fires during a test.
 */
async function createInstance(config = {}) {
  const player = new FakePlayer();
  player.install();
  const instance = new ModuleInstance();
  instance.minStatusRequestSpacingMs = 0;
  instance.minRegularPollIntervalSeconds = 0;
  await instance.init({
    host: "player.local",
    port: 11000,
    pollIntervalSeconds: 3600,
    volumeStepDb: 2,
    ...config,
  });
  const cleanup = async () => {
    await instance.destroy();
    player.uninstall();
  };
  return { instance, player, cleanup };
}

/**
 * Waits until `condition` returns true, for things that happen in the
 * background status loop.
 */
async function waitFor(condition, timeoutMs = 2000) {
  const start = Date.now();
  while (!(await condition())) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function runAction(instance, actionId, options = {}, variables = {}) {
  await instance.actionDefinitions[actionId].callback(
    { options },
    variableContext(variables),
  );
}

async function runFeedback(instance, feedbackId, options = {}, variables = {}) {
  return instance.feedbackDefinitions[feedbackId].callback(
    { options },
    variableContext(variables),
  );
}

module.exports = {
  ModuleInstance,
  FakePlayer,
  InstanceStatus: realBase.InstanceStatus,
  createInstance,
  runAction,
  runFeedback,
  waitFor,
};
