const { describe, it, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { createInstance, runAction, runFeedback } = require("./helpers");

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
      mute: 1,
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
      isMuted: true,
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

describe("stream presets", () => {
  let context;
  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  const streamPresets = (instance) =>
    Object.values(instance.presetDefinitions).filter(
      (preset) => preset.category === "Streams",
    );

  const MY_STREAMS =
    "Jazz=https://jazz.example/live; Rock = https://rock.example/stream?q=1&b=2";

  it("has no built-in stations", async () => {
    context = await createInstance();
    assert.deepEqual(streamPresets(context.instance), []);
  });

  it("creates a button for each configured stream", async () => {
    context = await createInstance({ streamPresets: MY_STREAMS });
    const presets = streamPresets(context.instance);
    assert.deepEqual(
      presets.map((preset) => [
        preset.name,
        preset.style.text,
        preset.steps[0].down[0].options.selectedStreamUrl,
      ]),
      [
        ["Jazz", "Jazz", "https://jazz.example/live"],
        ["Rock", "Rock", "https://rock.example/stream?q=1&b=2"],
      ],
    );
  });

  it("start the stream and light up for that same stream", async () => {
    context = await createInstance({ streamPresets: MY_STREAMS });
    for (const preset of streamPresets(context.instance)) {
      const action = preset.steps[0].down[0];
      const feedback = preset.feedbacks[0];
      assert.equal(action.actionId, "setStream", preset.name);
      assert.equal(feedback.feedbackId, "activeStream", preset.name);
      assert.equal(
        feedback.options.stream,
        action.options.selectedStreamUrl,
        preset.name,
      );
    }
  });

  it("light up after the preset's stream was started", async () => {
    context = await createInstance({ streamPresets: MY_STREAMS });
    const { instance } = context;
    const [, rock] = streamPresets(instance);
    const action = rock.steps[0].down[0];
    await runAction(instance, action.actionId, action.options);
    assert.equal(
      await runFeedback(instance, "activeStream", rock.feedbacks[0].options),
      true,
    );
  });

  it("are updated when the config changes", async () => {
    context = await createInstance({ streamPresets: MY_STREAMS });
    const { instance } = context;
    await instance.configUpdated({
      ...instance.config,
      streamPresets: "Talk=https://talk.example/live",
    });
    assert.deepEqual(
      streamPresets(instance).map((preset) => preset.name),
      ["Talk"],
    );
  });

  it("skips invalid entries with a warning", async () => {
    context = await createInstance({
      streamPresets:
        "Jazz=https://jazz.example/live; no-url; =https://x.example; Ftp=ftp://x.example; ;",
    });
    const { instance } = context;
    assert.deepEqual(
      streamPresets(instance).map((preset) => preset.name),
      ["Jazz"],
    );
    const warnings = instance.logs.filter((log) => log.level === "warn");
    assert.equal(warnings.length, 3);
    assert.ok(warnings.every((log) => /Name=https/.test(log.message)));
  });

  it("show the volume of this connection", async () => {
    context = await createInstance();
    const preset = context.instance.presetDefinitions.showVolume;
    assert.match(preset.style.text, /\$\(hifi-remote:volume\)/);
  });
});

describe("parseStreamPresets", () => {
  const { parseStreamPresets } = require("../presets");

  it("returns nothing for an empty field", () => {
    assert.deepEqual(parseStreamPresets(""), {
      streams: [],
      invalidEntries: [],
    });
    assert.deepEqual(parseStreamPresets(undefined).streams, []);
  });

  it("splits on the first = only", () => {
    assert.deepEqual(parseStreamPresets("A=http://a.example/?x=1=2").streams, [
      { label: "A", url: "http://a.example/?x=1=2" },
    ]);
  });

  it("trims names and URLs", () => {
    assert.deepEqual(
      parseStreamPresets("  My Radio  =  https://r.example  ").streams,
      [{ label: "My Radio", url: "https://r.example" }],
    );
  });
});

describe("upgrade scripts", () => {
  it("has no placeholder upgrade scripts", () => {
    assert.deepEqual(require("../upgrades"), []);
  });
});

describe("variables", () => {
  let context;
  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  it("are all set at startup", async () => {
    context = await createInstance({ host: "" });
    const { variableDefinitions, variableValues } = context.instance;
    for (const { variableId } of variableDefinitions) {
      assert.ok(variableId in variableValues, variableId);
    }
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
