const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { createInstance, InstanceStatus } = require("./helpers");

describe("status polling", () => {
  let context;
  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  describe("player state", () => {
    const stateCases = [
      ["play", true],
      ["stream", true],
      ["pause", false],
      ["stop", false],
    ];
    for (const [state, isPlaying] of stateCases) {
      it(`state "${state}" means isPlaying=${isPlaying}`, async () => {
        context = await createInstance();
        context.player.state = state;
        await context.instance.updateDeviceStatusAsync();
        assert.equal(context.instance.isPlaying, isPlaying);
      });
    }

    const repeatCases = [
      [0, { enabled: true, queue: true, track: false }],
      [1, { enabled: true, queue: false, track: true }],
      [2, { enabled: false, queue: false, track: false }],
    ];
    for (const [repeat, expected] of repeatCases) {
      it(`repeat=${repeat} is read correctly`, async () => {
        context = await createInstance();
        context.player.repeat = repeat;
        await context.instance.updateDeviceStatusAsync();
        const { instance } = context;
        assert.deepEqual(
          {
            enabled: instance.isRepeatEnabled,
            queue: instance.isRepeatCurrentQueue,
            track: instance.isRepeatCurrentTrack,
          },
          expected,
        );
      });
    }

    it("reads shuffle", async () => {
      context = await createInstance();
      context.player.shuffle = 1;
      await context.instance.updateDeviceStatusAsync();
      assert.equal(context.instance.isShuffleEnabled, true);
    });
  });

  describe("playback source", () => {
    const sourceCases = [
      ["Spotify", "spotify"],
      ["Bluetooth", "bluetooth"],
      ["https://radio.example/live", "stream"],
      ["http://radio.example/live", "stream"],
      ["TuneIn", "tunein"],
      ["", ""],
    ];
    for (const [service, expected] of sourceCases) {
      it(`service "${service}" gives playbackSource "${expected}"`, async () => {
        context = await createInstance();
        context.player.service = service;
        await context.instance.updateDeviceStatusAsync();
        assert.equal(context.instance.variableValues.playbackSource, expected);
      });
    }

    it("does not keep a stale source when the player reports none", async () => {
      context = await createInstance();
      context.player.service = "Spotify";
      await context.instance.updateDeviceStatusAsync();
      context.player.service = "";
      await context.instance.updateDeviceStatusAsync();
      assert.equal(context.instance.playbackSource, null);
    });

    it("forgets the active stream when another source takes over", async () => {
      context = await createInstance();
      context.instance.currentStream = "https://radio.example/live";
      context.player.service = "Spotify";
      await context.instance.updateDeviceStatusAsync();
      assert.equal(context.instance.currentStream, null);
    });

    it("keeps the active stream while a stream is playing", async () => {
      context = await createInstance();
      context.instance.currentStream = "https://radio.example/live";
      context.player.service = "https://radio.example/live";
      await context.instance.updateDeviceStatusAsync();
      assert.equal(
        context.instance.currentStream,
        "https://radio.example/live",
      );
    });
  });

  describe("invalid responses", () => {
    it("ignores a response without a status element", async () => {
      context = await createInstance();
      context.player.statusBody = "<sync/>";
      await assert.doesNotReject(context.instance.updateDeviceStatusAsync());
      assert.ok(
        context.instance.logs.some((log) => /no status/.test(log.message)),
      );
    });
  });

  describe("connection status", () => {
    it("reports bad config without a host and does not poll", async () => {
      context = await createInstance({ host: "" });
      assert.equal(context.instance.lastStatus, InstanceStatus.BadConfig);
      assert.equal(context.instance._statusPollTimer, null);
      assert.deepEqual(context.player.paths, []);
    });

    it("reports ok when the player answers", async () => {
      context = await createInstance();
      assert.equal(context.instance.lastStatus, InstanceStatus.Ok);
    });

    it("keeps polling when the player is offline at startup", async () => {
      context = await createInstance();
      const { instance, player } = context;

      player.online = false;
      await instance.configUpdated({ ...instance.config });
      assert.equal(instance.lastStatus, InstanceStatus.ConnectionFailure);
      assert.notEqual(instance._statusPollTimer, null);

      player.online = true;
      await instance.pollStatusAsync();
      assert.equal(instance.lastStatus, InstanceStatus.Ok);
    });

    it("logs an offline player once, not on every poll", async () => {
      context = await createInstance();
      const { instance, player } = context;
      player.online = false;
      for (let i = 0; i < 3; i++) {
        await instance.pollStatusAsync();
      }
      const errors = instance.logs.filter((log) => log.level === "error");
      assert.equal(errors.length, 1);
    });

    it("stops polling when the host is cleared", async () => {
      context = await createInstance();
      await context.instance.configUpdated({
        ...context.instance.config,
        host: "",
      });
      assert.equal(context.instance._statusPollTimer, null);
      assert.equal(context.instance.lastStatus, InstanceStatus.BadConfig);
    });

    it("uses the configured poll interval at startup", async () => {
      context = await createInstance({ pollIntervalSeconds: 42 });
      assert.equal(context.instance.pollIntervalSeconds, 42);
    });
  });
});
