const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { createInstance, runFeedback } = require("./helpers");

describe("feedbacks", () => {
  let context;
  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  it("are all boolean feedbacks with a description and default style", async () => {
    context = await createInstance();
    for (const [id, feedback] of Object.entries(
      context.instance.feedbackDefinitions,
    )) {
      assert.equal(feedback.type, "boolean", id);
      assert.ok(feedback.description, id);
      assert.ok(Object.keys(feedback.defaultStyle).length > 0, id);
    }
  });

  it("return false before the first status is known", async () => {
    context = await createInstance({ host: "" });
    for (const id of Object.keys(context.instance.feedbackDefinitions)) {
      assert.equal(await runFeedback(context.instance, id), false, id);
    }
  });

  it("reflect the player state", async () => {
    context = await createInstance();
    const { instance, player } = context;
    Object.assign(player, {
      state: "play",
      shuffle: 1,
      repeat: 1,
      service: "Bluetooth",
    });
    await instance.updateDeviceStatusAsync();

    const expected = {
      playbackState: true,
      isShuffleEnabled: true,
      isRepeatEnabled: true,
      isRepeatCurrentTrack: true,
      isRepeatCurrentQueue: false,
      isStreamEnabled: false,
      isSpotifyEnabled: false,
      isBluetoothEnabled: true,
    };
    for (const [id, value] of Object.entries(expected)) {
      assert.equal(await runFeedback(instance, id), value, id);
    }
  });

  describe("activeStream", () => {
    it("is true only for the stream that was started", async () => {
      context = await createInstance();
      context.instance.currentStream = "https://radio.example/a";
      assert.equal(
        await runFeedback(context.instance, "activeStream", {
          stream: "https://radio.example/a",
        }),
        true,
      );
      assert.equal(
        await runFeedback(context.instance, "activeStream", {
          stream: "https://radio.example/b",
        }),
        false,
      );
    });

    it("parses variables in the stream URL", async () => {
      context = await createInstance();
      context.instance.currentStream = "https://radio.example/a";
      const result = await runFeedback(
        context.instance,
        "activeStream",
        { stream: "$(internal:station)" },
        { "internal:station": "https://radio.example/a" },
      );
      assert.equal(result, true);
    });
  });
});

describe("presets", () => {
  let context;
  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  it("only reference existing actions and feedbacks", async () => {
    context = await createInstance();
    const { actionDefinitions, feedbackDefinitions, presetDefinitions } =
      context.instance;

    assert.ok(Object.keys(presetDefinitions).length > 0);
    for (const [id, preset] of Object.entries(presetDefinitions)) {
      for (const step of preset.steps) {
        for (const action of [...step.down, ...step.up]) {
          assert.ok(actionDefinitions[action.actionId], `${id}: action`);
        }
      }
      for (const feedback of preset.feedbacks) {
        assert.ok(feedbackDefinitions[feedback.feedbackId], `${id}: feedback`);
      }
    }
  });
});

describe("variables", () => {
  let context;
  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  it("only set values for defined variables", async () => {
    context = await createInstance();
    await context.instance.updateDeviceStatusAsync();
    const defined = context.instance.variableDefinitions.map(
      (v) => v.variableId,
    );
    for (const id of Object.keys(context.instance.variableValues)) {
      assert.ok(defined.includes(id), id);
    }
  });
});
