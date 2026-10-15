const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  ModuleInstance,
  createInstance,
  InstanceStatus,
  waitFor,
} = require("./helpers");

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

  describe("track info and volume", () => {
    it("exposes volume, mute, play state and track info as variables", async () => {
      context = await createInstance();
      Object.assign(context.player, {
        state: "play",
        volume: 42,
        mute: 1,
        title: "Song",
        artist: "Artist",
        album: "Album",
        image: "https://img.example/cover.jpg",
      });
      await context.instance.updateDeviceStatusAsync();
      const values = context.instance.variableValues;
      assert.equal(values.playState, "play");
      assert.equal(values.volume, 42);
      assert.equal(values.muted, true);
      assert.equal(values.title, "Song");
      assert.equal(values.artist, "Artist");
      assert.equal(values.album, "Album");
      assert.equal(values.artworkUrl, "https://img.example/cover.jpg");
    });

    it("keeps numeric titles as text", async () => {
      context = await createInstance();
      context.player.title = "1999";
      await context.instance.updateDeviceStatusAsync();
      assert.equal(context.instance.variableValues.title, "1999");
    });

    it("makes artwork paths of the player absolute", async () => {
      context = await createInstance();
      context.player.image = "/Artwork?service=Spotify&amp;id=1";
      await context.instance.updateDeviceStatusAsync();
      assert.equal(
        context.instance.variableValues.artworkUrl,
        "http://player.local:11000/Artwork?service=Spotify&id=1&followRedirects=1",
      );
    });

    it("reads track info and the now playing lines separately", async () => {
      context = await createInstance();
      context.player.statusBody =
        '<status etag="9"><name>Name</name><artist>Artist</artist>' +
        "<album>Album</album><title1>T1</title1><title2>T2</title2>" +
        "<title3>T3</title3></status>";
      await context.instance.updateDeviceStatusAsync();
      const values = context.instance.variableValues;
      assert.deepEqual(
        [values.title, values.artist, values.album],
        ["Name", "Artist", "Album"],
      );
      assert.deepEqual(
        [
          values.nowPlayingLine1,
          values.nowPlayingLine2,
          values.nowPlayingLine3,
        ],
        ["T1", "T2", "T3"],
      );
    });

    it("has now playing lines for radio without artist or album", async () => {
      context = await createInstance();
      context.player.statusBody =
        '<status etag="9"><title1>Radio 1</title1>' +
        "<title2>Live news</title2></status>";
      await context.instance.updateDeviceStatusAsync();
      const values = context.instance.variableValues;
      assert.equal(values.nowPlayingLine1, "Radio 1");
      assert.equal(values.nowPlayingLine2, "Live news");
      assert.equal(values.artist, "");
    });

    it("leaves artwork from other hosts unchanged", async () => {
      context = await createInstance();
      context.player.image = "https://img.example/Artwork?id=1";
      await context.instance.updateDeviceStatusAsync();
      assert.equal(
        context.instance.variableValues.artworkUrl,
        "https://img.example/Artwork?id=1",
      );
    });

    it("reads elements that have attributes", async () => {
      context = await createInstance();
      context.player.statusBody =
        '<status etag="9"><volume db="-20">25</volume></status>';
      await context.instance.updateDeviceStatusAsync();
      assert.equal(context.instance.variableValues.volume, 25);
    });

    it("clears the track info when the player reports none", async () => {
      context = await createInstance();
      context.player.title = "Song";
      await context.instance.updateDeviceStatusAsync();
      context.player.title = "";
      await context.instance.updateDeviceStatusAsync();
      assert.equal(context.instance.variableValues.title, "");
    });
  });

  describe("change detection", () => {
    it("does not re-check feedbacks or variables when nothing changed", async () => {
      context = await createInstance();
      const { instance } = context;
      await instance.updateDeviceStatusAsync();
      instance.feedbackChecks = [];
      instance.variableValues = {};

      await instance.updateDeviceStatusAsync();
      assert.deepEqual(instance.feedbackChecks, []);
      assert.deepEqual(instance.variableValues, {});
    });

    it("only re-checks the feedbacks affected by a change", async () => {
      context = await createInstance();
      const { instance, player } = context;
      await instance.updateDeviceStatusAsync();
      instance.feedbackChecks = [];

      player.shuffle = 1;
      await instance.updateDeviceStatusAsync();
      assert.deepEqual(
        instance.feedbackChecks.map((check) => check.feedbackIds),
        [["isShuffleEnabled"]],
      );
    });

    it("re-checks all source feedbacks when the source changes", async () => {
      context = await createInstance();
      const { instance, player } = context;
      instance.feedbackChecks = [];

      player.service = "Bluetooth";
      await instance.updateDeviceStatusAsync();
      assert.deepEqual(instance.feedbackChecks[0].feedbackIds.sort(), [
        "isBluetoothEnabled",
        "isSpotifyEnabled",
        "isStreamEnabled",
      ]);
    });

    it("only sends the variables that changed", async () => {
      context = await createInstance();
      const { instance, player } = context;
      await instance.updateDeviceStatusAsync();
      instance.variableValues = {};

      player.volume = 50;
      await instance.updateDeviceStatusAsync();
      assert.deepEqual(instance.variableValues, { volume: 50 });
    });
  });

  describe("long polling", () => {
    it("waits for changes using the etag of the last status", async () => {
      context = await createInstance();
      const { player } = context;
      await waitFor(() => player.waitingLongPolls === 1);
      const longPoll = player.statusRequests.at(-1);
      assert.equal(longPoll.searchParams.get("etag"), String(player.etag));
      assert.equal(longPoll.searchParams.get("timeout"), "100");
    });

    it("picks up changes made outside Companion straight away", async () => {
      context = await createInstance();
      const { instance, player } = context;
      await waitFor(() => player.waitingLongPolls === 1);

      // E.g. someone pressed play in the BluOS app
      player.state = "play";
      player.changed();
      await waitFor(() => instance.isPlaying === true);
    });

    it("ignores a status that was requested before a newer command", async () => {
      context = await createInstance();
      const { instance, player } = context;
      await waitFor(() => player.waitingLongPolls === 1);

      // The long poll answers with shuffle on, but a command turning shuffle
      // off is sent before that answer is applied
      player.shuffle = 1;
      player.changed();
      instance.isShuffleEnabled = true;
      await instance.toggleShuffleAsync();
      assert.equal(instance.isShuffleEnabled, false);

      await waitFor(() => player.waitingLongPolls === 1);
      assert.equal(player.shuffle, 0);
      assert.equal(instance.isShuffleEnabled, false);
    });

    it("does not spin when the player sends no etag", async () => {
      context = await createInstance();
      const { instance, player } = context;
      player.supportsLongPolling = false;
      await instance.configUpdated({ ...instance.config });
      const countAfterStart = player.statusRequests.length;

      // With a 3600s interval no further requests may be made
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(player.statusRequests.length, countAfterStart);
    });

    it("keeps status requests at least the minimum spacing apart", async () => {
      context = await createInstance();
      const { instance, player } = context;
      instance.minStatusRequestSpacingMs = 200;
      await instance.configUpdated({ ...instance.config });
      await waitFor(() => player.waitingLongPolls === 1);
      player.requests = [];

      // Several changes in a row must not cause a burst of status requests
      for (let i = 0; i < 5; i++) {
        player.state = i % 2 ? "play" : "pause";
        player.changed();
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.equal(player.statusRequests.length, 0);
      await waitFor(() => player.statusRequests.length === 1);
    });

    it("polls without etag at most every 30 seconds by default", () => {
      const instance = new ModuleInstance();
      assert.equal(instance.minRegularPollIntervalSeconds, 30);
      assert.equal(instance.minStatusRequestSpacingMs, 1000);
    });

    it("polls on the interval when the player sends no etag", async () => {
      context = await createInstance({ pollIntervalSeconds: 0.01 });
      const { instance, player } = context;
      player.supportsLongPolling = false;
      await instance.configUpdated({ ...instance.config });

      player.state = "play";
      await waitFor(() => instance.isPlaying === true);
    });

    it("stops cleanly without logging errors", async () => {
      context = await createInstance();
      const { instance, player } = context;
      await waitFor(() => player.waitingLongPolls === 1);
      const requestCount = player.requests.length;

      await instance.destroy();
      await new Promise((resolve) => setTimeout(resolve, 20));
      assert.equal(instance.isPolling, false);
      assert.equal(player.requests.length, requestCount);
      assert.equal(player.waitingLongPolls, 0);
      assert.ok(!instance.logs.some((log) => log.level === "error"));
      assert.equal(instance.lastStatus, InstanceStatus.Ok);
    });

    it("starts over with a plain status request when the config changes", async () => {
      context = await createInstance();
      const { instance, player } = context;
      await waitFor(() => player.waitingLongPolls === 1);
      player.requests = [];

      await instance.configUpdated({ ...instance.config });
      await waitFor(() => player.waitingLongPolls === 1);
      assert.equal(player.statusRequests[0].search, "");
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
      assert.equal(context.instance.isPolling, false);
      assert.deepEqual(context.player.requests, []);
    });

    it("reports ok when the player answers", async () => {
      context = await createInstance();
      assert.equal(context.instance.lastStatus, InstanceStatus.Ok);
    });

    it("keeps retrying when the player is offline at startup", async () => {
      context = await createInstance({ pollIntervalSeconds: 0.01 });
      const { instance, player } = context;

      player.online = false;
      await instance.configUpdated({ ...instance.config });
      assert.equal(instance.lastStatus, InstanceStatus.ConnectionFailure);
      assert.equal(instance.isPolling, true);

      player.online = true;
      await waitFor(() => instance.lastStatus === InstanceStatus.Ok);
    });

    it("logs an offline player once, not on every poll", async () => {
      context = await createInstance();
      const { instance, player } = context;
      player.online = false;
      for (let i = 0; i < 3; i++) {
        await instance.updateDeviceStatusAsync();
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
      assert.equal(context.instance.isPolling, false);
      assert.equal(context.instance.lastStatus, InstanceStatus.BadConfig);
    });

    it("uses the configured poll interval at startup", async () => {
      context = await createInstance({ pollIntervalSeconds: 42 });
      assert.equal(context.instance.pollIntervalSeconds, 42);
    });
  });
});
