/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {WEATHER_CODES, UNAVAILABLE, weatherUrl, describeWeather} = require("../weather");

describe("weather.js", () => {
  describe("weatherUrl", () => {
    it("asks Open-Meteo for the current weather at the location", () => {
      assert.equal(weatherUrl({latitude: -36.63, longitude: 174.78}), "https://api.open-meteo.com/v1/forecast?latitude=-36.63&longitude=174.78&current_weather=true");
    });
    it("uses whatever coordinates it is given", () => {
      assert.equal(weatherUrl({latitude: 34.05, longitude: -118.24}), "https://api.open-meteo.com/v1/forecast?latitude=34.05&longitude=-118.24&current_weather=true");
    });
  });

  describe("describeWeather", () => {
    it("combines the condition and the temperature", () => {
      assert.equal(describeWeather({weathercode: 61, temperature: 14.2}), "Slight rain, 14.2°C");
      assert.equal(describeWeather({weathercode: 0, temperature: -3}), "Clear sky, -3°C");
      assert.equal(describeWeather({weathercode: 0, temperature: 0}), "Clear sky, 0°C");
    });
    it("knows snow, drizzle and hail as well as rain", () => {
      assert.equal(describeWeather({weathercode: 73, temperature: -1}), "Moderate snow, -1°C");
      assert.equal(describeWeather({weathercode: 51, temperature: 9}), "Light drizzle, 9°C");
      assert.equal(describeWeather({weathercode: 99, temperature: 20}), "Thunderstorm with heavy hail, 20°C");
    });
    it("calls an unknown or missing code variable conditions", () => {
      assert.equal(describeWeather({weathercode: 1234, temperature: 10}), "Variable conditions, 10°C");
      assert.equal(describeWeather({temperature: 10}), "Variable conditions, 10°C");
      assert.equal(describeWeather({weathercode: "toString", temperature: 10}), "Variable conditions, 10°C");
    });
    it("reports unavailable for a missing or unusable reading", () => {
      for (const bad of [undefined, null, "rain", 5, {}, {weathercode: 1}, {weathercode: 1, temperature: "warm"}, {weathercode: 1, temperature: NaN}]) {
        assert.equal(describeWeather(bad), UNAVAILABLE, JSON.stringify(bad));
      }
    });
    it("has a description for every listed code", () => {
      for (const [code, text] of Object.entries(WEATHER_CODES)) {
        assert.equal(describeWeather({weathercode: Number(code), temperature: 1}), `${text}, 1°C`);
      }
    });
  });
});
