const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

require("./helpers");
const {
  DEFAULTS,
  GetConfigurationFields,
  SetConfigurationFieldDefaultValues,
} = require("../config");

describe("config", () => {
  it("fills in defaults for missing values", () => {
    const config = SetConfigurationFieldDefaultValues(null, {});
    assert.deepEqual(config, {
      host: "",
      port: 11000,
      pollIntervalSeconds: 5,
      volumeStepDb: 2,
      streamPresets: "",
    });
  });

  it("keeps configured values", () => {
    const config = SetConfigurationFieldDefaultValues(null, {
      host: "192.168.1.20",
      port: 11001,
      pollIntervalSeconds: 10,
      volumeStepDb: 4,
      streamPresets: "Jazz=https://jazz.example/live",
    });
    assert.deepEqual(config, {
      host: "192.168.1.20",
      port: 11001,
      pollIntervalSeconds: 10,
      volumeStepDb: 4,
      streamPresets: "Jazz=https://jazz.example/live",
    });
  });

  it("trims whitespace around the host", () => {
    const config = SetConfigurationFieldDefaultValues(null, {
      host: "  living.local ",
    });
    assert.equal(config.host, "living.local");
  });

  it("requires a host and has no default for it", () => {
    const hostField = GetConfigurationFields(null).find(
      (field) => field.id === "host",
    );
    assert.equal(hostField.default, "");
    assert.equal(hostField.required, true);
  });

  it("uses the shared defaults", () => {
    assert.deepEqual(SetConfigurationFieldDefaultValues(null, {}), DEFAULTS);
    for (const field of GetConfigurationFields(null)) {
      assert.equal(field.default, DEFAULTS[field.id], field.id);
    }
  });

  it("does not let the defaults be changed by accident", () => {
    assert.ok(Object.isFrozen(DEFAULTS));
  });

  it("has field defaults that match the applied defaults", () => {
    const applied = SetConfigurationFieldDefaultValues(null, {});
    for (const field of GetConfigurationFields(null)) {
      assert.equal(field.default, applied[field.id], field.id);
    }
  });
});
