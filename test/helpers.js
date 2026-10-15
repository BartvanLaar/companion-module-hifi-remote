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
  checkFeedbacks() {
    // Snapshot the state the feedbacks would see at this moment
    this.feedbackChecks.push({
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
    this.statusBody = null;
  }

  install() {
    this._originalFetch = globalThis.fetch;
    globalThis.fetch = (url) => this.handle(new URL(url));
  }

  uninstall() {
    globalThis.fetch = this._originalFetch;
  }

  get paths() {
    return this.requests.map((url) => url.pathname + url.search);
  }

  async handle(url) {
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
      case "/Status":
        return new Response(this.statusBody ?? this.statusXml());
    }
    return new Response("<ok/>");
  }

  statusXml() {
    return (
      `<status etag="1"><state>${this.state}</state>` +
      `<service>${this.service}</service>` +
      `<shuffle>${this.shuffle}</shuffle><repeat>${this.repeat}</repeat></status>`
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
};
