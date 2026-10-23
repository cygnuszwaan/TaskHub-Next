/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const {describe, it} = require("node:test");
const assert = require("node:assert/strict");
const {WEATHER_CODES, UNAVAILABLE, WEATHER_DAYS, weatherUrl, weatherKey, parseForecast, forecastKey, isWeatherSensitive, weatherWindow} = require("../weather");

describe("weather.js", () => {
  describe("weatherUrl", () => {
    const url = (loc, zone) => new URL(weatherUrl(loc, zone));
    it("asks Open-Meteo for the current weather and a 3-day daily forecast at the location", () => {
      const u = url({latitude: -36.63, longitude: 174.78}, "Pacific/Auckland");
      assert.equal(u.origin + u.pathname, "https://api.open-meteo.com/v1/forecast");
      assert.equal(u.searchParams.get("latitude"), "-36.63");
      assert.equal(u.searchParams.get("longitude"), "174.78");
      assert.equal(u.searchParams.get("current_weather"), "true");
      assert.equal(u.searchParams.get("forecast_days"), String(WEATHER_DAYS));
      assert.equal(WEATHER_DAYS, 3);
      assert.deepEqual(u.searchParams.get("daily").split(","), ["weather_code", "temperature_2m_max", "temperature_2m_min", "precipitation_sum", "precipitation_probability_max"]);
    });
    it("asks for the days in the configured time zone, encoded", () => {
      assert.equal(url({latitude: 34.05, longitude: -118.24}, "America/Los_Angeles").searchParams.get("timezone"), "America/Los_Angeles");
      assert.match(weatherUrl({latitude: 0, longitude: 0}, "America/Los_Angeles"), /timezone=America%2FLos_Angeles$/);
    });
  });

  describe("weatherKey", () => {
    it("calls clear, cloudy and foggy conditions DRY", () => {
      for (const weathercode of [0, 1, 2, 3, 45, 48]) assert.equal(weatherKey({weathercode, temperature: 10}), "DRY", String(weathercode));
    });
    it("calls drizzle, rain, snow, showers and thunderstorms WET", () => {
      for (const weathercode of [51, 57, 61, 67, 71, 77, 80, 82, 85, 86, 95, 99]) assert.equal(weatherKey({weathercode, temperature: 10}), "WET", String(weathercode));
    });
    it("covers every listed code as DRY or WET", () => {
      for (const code of Object.keys(WEATHER_CODES)) assert.match(weatherKey({weathercode: Number(code), temperature: 1}), /^(DRY|WET)$/);
    });
    it("ignores the temperature and the cloud cover", () => {
      assert.equal(weatherKey({weathercode: 0, temperature: 5}), weatherKey({weathercode: 3, temperature: 25}));
      assert.equal(weatherKey({weathercode: 61, temperature: 5}), weatherKey({weathercode: 65, temperature: 25}));
    });
    it("reports OTHER for an unknown code and unavailable for an unusable reading", () => {
      assert.equal(weatherKey({weathercode: 1234, temperature: 10}), "OTHER");
      assert.equal(weatherKey({temperature: 10}), "OTHER");
      for (const bad of [undefined, null, "rain", {weathercode: 1}, {weathercode: 1, temperature: NaN}]) assert.equal(weatherKey(bad), UNAVAILABLE);
    });
  });

  describe("parseForecast", () => {
    const daily = (extra = {}) => ({daily: {
      time: ["2026-10-22", "2026-10-23", "2026-10-24"],
      weather_code: [0, 61, 3],
      temperature_2m_max: [18.4, 15, 17],
      temperature_2m_min: [10, 9.5, 11],
      precipitation_sum: [0, 6.2, 0.2],
      precipitation_probability_max: [5, 90, 20],
      ...extra,
    }});
    it("turns each day into a record with the rain outlook", () => {
      assert.deepEqual(parseForecast(daily()), [
        {date: "2026-10-22", conditions: "Clear sky", minTemp: 10, maxTemp: 18.4, precipitationMm: 0, rainChance: 5, rainy: false},
        {date: "2026-10-23", conditions: "Slight rain", minTemp: 9.5, maxTemp: 15, precipitationMm: 6.2, rainChance: 90, rainy: true},
        {date: "2026-10-24", conditions: "Overcast", minTemp: 11, maxTemp: 17, precipitationMm: 0.2, rainChance: 20, rainy: false},
      ]);
    });
    it("calls a day rainy for a wet code or for at least 1 mm, but not for drizzle-level amounts under a dry code", () => {
      const r = parseForecast(daily({weather_code: [51, 3, 3], precipitation_sum: [0, 1, 0.9]}));
      assert.deepEqual(r.map((d) => d.rainy), [true, true, false]);
    });
    it("treats showers, snow and thunderstorms as rainy", () => {
      const r = parseForecast(daily({weather_code: [80, 71, 95]}));
      assert.deepEqual(r.map((d) => d.rainy), [true, true, true]);
    });
    it("keeps missing figures as null and an unknown code as variable conditions", () => {
      const r = parseForecast({daily: {time: ["2026-10-22"], weather_code: [1234]}});
      assert.deepEqual(r, [{date: "2026-10-22", conditions: "Variable conditions", minTemp: null, maxTemp: null, precipitationMm: null, rainChance: null, rainy: false}]);
    });
    it("does not guess rain from missing data", () => {
      assert.equal(parseForecast({daily: {time: ["2026-10-22"]}})[0].rainy, false);
    });
    it("skips days without a valid date, sorts by date and keeps at most three", () => {
      const r = parseForecast({daily: {time: ["2026-10-25", "bad", "2026-10-22", "2026-10-24", "2026-10-23"], weather_code: [0, 0, 0, 0, 0]}});
      assert.deepEqual(r.map((d) => d.date), ["2026-10-22", "2026-10-23", "2026-10-24"]);
    });
    it("gives an empty list for a missing or unusable daily object", () => {
      for (const bad of [undefined, null, {}, {daily: null}, {daily: {}}, {daily: {time: "2026-10-22"}}, "x"]) assert.deepEqual(parseForecast(bad), [], JSON.stringify(bad));
    });
    it("ignores non-numeric figures", () => {
      const r = parseForecast(daily({temperature_2m_max: ["hot", 15, 17], precipitation_sum: [null, "wet", 0]}));
      assert.equal(r[0].maxTemp, null);
      assert.equal(r[0].precipitationMm, null);
      assert.equal(r[1].precipitationMm, null);
      assert.equal(r[1].rainy, true); // from the code, 61
    });
  });

  describe("forecastKey", () => {
    const day = (rainy) => ({date: "2026-10-22", rainy});
    it("has one letter per day: W rainy, D dry", () => {
      assert.equal(forecastKey([day(false), day(true), day(false)], undefined), "DWD");
    });
    it("ignores the current reading when there is a forecast", () => {
      assert.equal(forecastKey([day(false)], {weathercode: 61, temperature: 10}), "D");
    });
    it("changes when the outlook for any day changes", () => {
      assert.notEqual(forecastKey([day(false), day(false), day(false)]), forecastKey([day(false), day(false), day(true)]));
    });
    it("falls back to the current condition's key without a forecast", () => {
      assert.equal(forecastKey([], {weathercode: 61, temperature: 10}), "WET");
      assert.equal(forecastKey(undefined, {weathercode: 0, temperature: 10}), "DRY");
      assert.equal(forecastKey([], undefined), UNAVAILABLE);
    });
  });

  describe("isWeatherSensitive", () => {
    it("is true for an Outdoor or Garden tag, ignoring case and spaces", () => {
      for (const tag of ["Outdoor", "outdoor", " GARDEN ", "Garden"]) assert.equal(isWeatherSensitive({tags: ["Physical", tag]}), true, tag);
    });
    it("is false for other tags, no tags or no task", () => {
      assert.equal(isWeatherSensitive({tags: ["Indoor", "Gardening tools", "Outdoors"]}), false);
      assert.equal(isWeatherSensitive({tags: []}), false);
      assert.equal(isWeatherSensitive({}), false);
      assert.equal(isWeatherSensitive({tags: [null, 3]}), false);
      assert.equal(isWeatherSensitive(undefined), false);
    });
  });

  describe("weatherWindow", () => {
    const day = (date, rainy) => ({date, rainy});
    it("ends the window WEATHER_DAYS days from today and lists the rainy days in it", () => {
      const w = weatherWindow({today: "2026-10-22", forecast: [day("2026-10-22", false), day("2026-10-23", true), day("2026-10-24", true)], current: "W"});
      assert.deepEqual(w, {lastDate: "2026-10-24", rainyDates: ["2026-10-23", "2026-10-24"]});
    });
    it("ignores forecast days outside the window", () => {
      const w = weatherWindow({today: "2026-10-22", forecast: [day("2026-10-21", true), day("2026-10-22", false), day("2026-10-25", true)], current: "DRY"});
      assert.deepEqual(w.rainyDates, []);
    });
    it("rolls over a month end", () => {
      assert.equal(weatherWindow({today: "2026-10-30", forecast: [], current: "DRY"}).lastDate, "2026-11-01");
    });
    it("without a forecast, treats every window day as rainy when the current weather is wet", () => {
      assert.deepEqual(weatherWindow({today: "2026-10-22", forecast: [], current: "WET"}), {lastDate: "2026-10-24", rainyDates: ["2026-10-22", "2026-10-23", "2026-10-24"]});
      assert.deepEqual(weatherWindow({today: "2026-10-22", forecast: undefined, current: "WET"}).rainyDates.length, WEATHER_DAYS);
    });
    it("without a forecast, treats dry or unknown weather as no rainy days but still ends the window", () => {
      for (const current of ["DRY", "OTHER", UNAVAILABLE]) assert.deepEqual(weatherWindow({today: "2026-10-22", forecast: [], current}), {lastDate: "2026-10-24", rainyDates: []});
    });
  });
});
