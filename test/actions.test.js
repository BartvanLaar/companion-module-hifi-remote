const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { createInstance, runAction } = require("./helpers");

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
    it(`${actionId} sends ${expectedPath} and refreshes the status`, async () => {
      const { instance, player } = await setup();
      await runAction(instance, actionId);
      assert.deepEqual(player.paths, [expectedPath, "/Status"]);
    });
  }

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
