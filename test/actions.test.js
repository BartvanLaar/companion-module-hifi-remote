const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { createInstance, runAction, waitFor } = require("./helpers");

describe("actions", () => {
  let context;
  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  async function setup(config) {
    context = await createInstance(config);
    // Ignore the requests made during init
    context.player.requests = [];
    return context;
  }

  const simpleActions = [
    ["pause", "/Pause"],
    ["stopPlayback", "/Stop"],
    ["resume", "/Play"],
    ["next", "/Skip"],
    ["previous", "/Back"],
    ["repeatQueue", "/Repeat?state=0"],
    ["repeatTrack", "/Repeat?state=1"],
    ["disableRepeat", "/Repeat?state=2"],
  ];

  for (const [actionId, expectedPath] of simpleActions) {
    it(`${actionId} sends ${expectedPath}`, async () => {
      const { instance, player } = await setup();
      await runAction(instance, actionId);
      assert.deepEqual(player.paths, [expectedPath]);
    });
  }

  it("leaves refreshing the status to the long poll", async () => {
    const { instance, player } = await setup();
    await waitFor(() => player.waitingLongPolls === 1);
    await runAction(instance, "next");

    // The waiting long poll answers and a new one waits for the next change
    await waitFor(
      () =>
        player.waitingLongPolls === 1 &&
        player.statusRequests.at(-1).searchParams.get("etag") ===
          String(player.etag),
    );
    assert.ok(player.statusRequests.at(-1).searchParams.has("timeout"));
  });

  it("shows the player's state after an action without a manual refresh", async () => {
    const { instance, player } = await setup();
    await waitFor(() => player.waitingLongPolls === 1);
    await runAction(instance, "volumeUp");
    await waitFor(() => instance.variableValues.volume === 32);
    assert.equal(player.volume, 32);
  });

  it("does nothing until a host is configured", async () => {
    const { instance, player } = await setup({ host: "" });
    await runAction(instance, "pause");
    assert.deepEqual(player.paths, []);
    assert.ok(
      instance.logs.some(
        (log) => log.level === "warn" && /not configured/.test(log.message),
      ),
    );
  });

  describe("togglePlayback", () => {
    it("pauses when playing", async () => {
      const { instance, player } = await setup();
      instance.isPlaying = true;
      await runAction(instance, "togglePlayback");
      assert.equal(player.paths[0], "/Pause");
    });

    it("resumes when not playing", async () => {
      const { instance, player } = await setup();
      instance.isPlaying = false;
      await runAction(instance, "togglePlayback");
      assert.equal(player.paths[0], "/Play");
    });
  });

  describe("volume", () => {
    it("sets an absolute volume and clamps it to 0-100", async () => {
      const { instance, player } = await setup();
      await runAction(instance, "setVolume", { level: 55 });
      await runAction(instance, "setVolume", { level: 150 });
      await runAction(instance, "setVolume", { level: -5 });
      assert.deepEqual(player.paths, [
        "/Volume?level=55",
        "/Volume?level=100",
        "/Volume?level=0",
      ]);
    });

    it("shows the new volume before the player answers", async () => {
      const { instance } = await setup();
      await runAction(instance, "setVolume", { level: 55 });
      assert.equal(instance.variableValues.volume, 55);
    });

    it("mutes and unmutes", async () => {
      const { instance, player } = await setup();
      await runAction(instance, "mute");
      assert.equal(instance.isMuted, true);
      await runAction(instance, "unmute");
      assert.equal(instance.isMuted, false);
      assert.deepEqual(player.paths, ["/Volume?mute=1", "/Volume?mute=0"]);
    });

    it("toggles mute", async () => {
      const { instance, player } = await setup();
      await runAction(instance, "toggleMute");
      await runAction(instance, "toggleMute");
      assert.deepEqual(player.paths, ["/Volume?mute=1", "/Volume?mute=0"]);
      assert.equal(player.mute, 0);
    });

    it("uses the configured step", async () => {
      const { instance, player } = await setup({ volumeStepDb: 3 });
      await runAction(instance, "volumeUp");
      await runAction(instance, "volumeDown");
      assert.deepEqual(
        player.paths.filter((p) => p.startsWith("/Volume")),
        ["/Volume?db=3", "/Volume?db=-3"],
      );
    });
  });

  describe("shuffle", () => {
    it("turns shuffle on when it is off, and off when it is on", async () => {
      const { instance, player } = await setup();
      await runAction(instance, "toggleShuffle");
      assert.equal(player.paths[0], "/Shuffle?state=1");
      assert.equal(instance.isShuffleEnabled, true);

      player.requests = [];
      await runAction(instance, "toggleShuffle");
      assert.equal(player.paths[0], "/Shuffle?state=0");
      assert.equal(instance.isShuffleEnabled, false);
    });
  });

  describe("repeat", () => {
    it("cycles queue -> track -> off -> queue", async () => {
      const { instance, player } = await setup();
      player.repeat = 2;
      await instance.updateDeviceStatusAsync();

      const sent = [];
      for (let i = 0; i < 4; i++) {
        player.requests = [];
        await runAction(instance, "toggleRepeat");
        sent.push(player.paths[0]);
      }
      assert.deepEqual(sent, [
        "/Repeat?state=0",
        "/Repeat?state=1",
        "/Repeat?state=2",
        "/Repeat?state=0",
      ]);
    });

    const optimisticCases = [
      ["repeatTrack", { track: true, queue: false, enabled: true }],
      ["repeatQueue", { track: false, queue: true, enabled: true }],
      ["disableRepeat", { track: false, queue: false, enabled: false }],
    ];
    for (const [actionId, expected] of optimisticCases) {
      it(`${actionId} updates feedbacks before the player answers`, async () => {
        const { instance } = await setup();
        // Start from a repeat state that differs from all expected states
        instance.updateState({
          isRepeatEnabled: null,
          isRepeatCurrentTrack: null,
          isRepeatCurrentQueue: null,
        });
        instance.feedbackChecks = [];
        await runAction(instance, actionId);
        const firstCheck = instance.feedbackChecks[0];
        assert.deepEqual(
          {
            track: firstCheck.isRepeatCurrentTrack,
            queue: firstCheck.isRepeatCurrentQueue,
            enabled: firstCheck.isRepeatEnabled,
          },
          expected,
        );
      });
    }

    it("toggleRepeat updates feedbacks before the player answers", async () => {
      const { instance } = await setup();
      instance.feedbackChecks = [];
      await runAction(instance, "toggleRepeat");
      const firstCheck = instance.feedbackChecks[0];
      assert.equal(firstCheck.isRepeatCurrentQueue, true);
      assert.equal(firstCheck.isRepeatEnabled, true);
    });
  });

  describe("failed commands", () => {
    it("roll back the expected state when the player rejects them", async () => {
      const { instance, player } = await setup();
      instance.updateState({ isPlaying: true });
      player.httpStatus = 500;
      await runAction(instance, "pause");
      assert.equal(instance.isPlaying, true);
    });

    it("clear the state instead of rolling back when the connection is lost", async () => {
      const { instance, player } = await setup();
      player.online = false;
      await runAction(instance, "toggleShuffle");
      assert.equal(instance.isShuffleEnabled, null);
    });
    it("roll back the active stream", async () => {
      const { instance, player } = await setup();
      player.httpStatus = 500;
      await runAction(instance, "setStream", {
        selectedStreamUrl: "https://radio.example/live",
      });
      assert.equal(instance.currentStream, null);
    });
  });

  describe("setStream", () => {
    it("URL-encodes the stream URL", async () => {
      const { instance, player } = await setup();
      const streamUrl = "https://radio.example/live?bitrate=320&format=aac";
      await runAction(instance, "setStream", { selectedStreamUrl: streamUrl });

      const playRequest = player.requests.find((u) => u.pathname === "/Play");
      assert.equal(playRequest.searchParams.get("url"), streamUrl);
      assert.equal([...playRequest.searchParams.keys()].length, 1);
      assert.equal(instance.currentStream, streamUrl);
    });

    it("parses variables in the stream URL", async () => {
      const { instance, player } = await setup();
      await runAction(
        instance,
        "setStream",
        { selectedStreamUrl: "$(internal:station)" },
        { "internal:station": "https://radio.example/a" },
      );
      const playRequest = player.requests.find((u) => u.pathname === "/Play");
      assert.equal(
        playRequest.searchParams.get("url"),
        "https://radio.example/a",
      );
    });

    it("does not play URLs other than http(s)", async () => {
      const { instance, player } = await setup();
      await runAction(
        instance,
        "setStream",
        { selectedStreamUrl: "$(internal:station)" },
        { "internal:station": "file:///etc/passwd" },
      );
      assert.deepEqual(player.paths, []);
      assert.equal(instance.currentStream, null);
    });

    it("does not play when the URL is empty", async () => {
      const { instance, player } = await setup();
      await runAction(instance, "setStream", { selectedStreamUrl: "  " });
      assert.deepEqual(player.paths, []);
    });
  });

  describe("errors", () => {
    it("logs HTTP errors without throwing", async () => {
      const { instance, player } = await setup();
      player.httpStatus = 500;
      await runAction(instance, "next");
      assert.ok(
        instance.logs.some(
          (log) => log.level === "error" && /500/.test(log.message),
        ),
      );
    });

    it("does not throw when the player is offline", async () => {
      const { instance, player } = await setup();
      player.online = false;
      await assert.doesNotReject(runAction(instance, "pause"));
    });
  });
});
