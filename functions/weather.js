/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
// WMO weather interpretation codes, as returned by Open-Meteo.
const WEATHER_CODES = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Foggy", 48: "Freezing fog",
  51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle", 56: "Light freezing drizzle", 57: "Dense freezing drizzle",
  61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain", 66: "Light freezing rain", 67: "Heavy freezing rain",
  71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Rain showers", 81: "Moderate rain showers", 82: "Violent rain showers", 85: "Snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail",
};

const {addDays} = require("./time");

const UNAVAILABLE = "Weather data currently unavailable";

// Days of daily forecast the scheduler uses. Weather says nothing useful about days further out, so later days are
// scheduled without regard to it.
const WEATHER_DAYS = 3;
// A day with at least this much forecast precipitation (mm) counts as rainy even when its dominant weather code is dry.
const WET_DAY_MM = 1;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// Open-Meteo request for the current weather and the next WEATHER_DAYS daily forecasts at a location
// ({latitude, longitude}). The daily dates are local dates in `timeZone`, so they line up with the schedule's days.
function weatherUrl(location, timeZone) {
  const daily = "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max";
  return `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current_weather=true` +
    `&daily=${daily}&forecast_days=${WEATHER_DAYS}&timezone=${encodeURIComponent(timeZone)}`;
}

// Coarse condition used to decide whether weather changed enough to matter: WET (drizzle, rain, showers, snow,
// thunderstorm), DRY (clear, cloudy, fog), OTHER (unknown code) or the unavailable text. Temperature and cloud
// cover are ignored because they drift every few minutes and the scheduler only avoids outdoor tasks in rain.
function weatherKey(current) {
  if (!current || typeof current !== "object" || typeof current.temperature !== "number" || !Number.isFinite(current.temperature)) return UNAVAILABLE;
  const code = current.weathercode;
  if (code === 0 || code === 1 || code === 2 || code === 3 || code === 45 || code === 48) return "DRY";
  if (Object.prototype.hasOwnProperty.call(WEATHER_CODES, code)) return "WET";
  return "OTHER";
}

const isNumber = (v) => typeof v === "number" && Number.isFinite(v);
const isWetCode = (code) => Object.prototype.hasOwnProperty.call(WEATHER_CODES, code) && !(code === 0 || code === 1 || code === 2 || code === 3 || code === 45 || code === 48);

// The daily forecast in Open-Meteo's response as [{date, conditions, minTemp, maxTemp, precipitationMm, rainChance, rainy}],
// in date order, at most WEATHER_DAYS days. `rainy` is true when the day's dominant condition is wet or at least
// WET_DAY_MM of precipitation is forecast. A missing figure is null; a day without a valid date is skipped. A missing
// or unusable `daily` object gives an empty list. Pure: no I/O.
function parseForecast(data) {
  const d = data && data.daily;
  if (!d || !Array.isArray(d.time)) return [];
  const at = (arr, i) => (Array.isArray(arr) && isNumber(arr[i]) ? arr[i] : null);
  const days = [];
  d.time.forEach((date, i) => {
    if (typeof date !== "string" || !DATE_ONLY.test(date)) return;
    const code = at(d.weather_code, i);
    const mm = at(d.precipitation_sum, i);
    days.push({
      date,
      conditions: code !== null && Object.prototype.hasOwnProperty.call(WEATHER_CODES, code) ? WEATHER_CODES[code] : "Variable conditions",
      minTemp: at(d.temperature_2m_min, i),
      maxTemp: at(d.temperature_2m_max, i),
      precipitationMm: mm,
      rainChance: at(d.precipitation_probability_max, i),
      rainy: (code !== null && isWetCode(code)) || (mm !== null && mm >= WET_DAY_MM),
    });
  });
  return days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).slice(0, WEATHER_DAYS);
}

// Coarse weather summary for the run fingerprint: one letter per forecast day (W rainy, D dry), so a change of the
// rain outlook for any of the days re-runs the schedule while temperature drift does not. Without a forecast it falls
// back to the current condition's key.
function forecastKey(forecast, current) {
  if (Array.isArray(forecast) && forecast.length > 0) return forecast.map((day) => (day.rainy ? "W" : "D")).join("");
  return weatherKey(current);
}

// Tags (compared ignoring case) that make a task depend on the weather: it is only scheduled inside the forecast
// window and never on a rainy day.
const WEATHER_TAGS = ["outdoor", "garden"];

// True when the task carries a weather-dependent tag. Pure: no I/O.
function isWeatherSensitive(task) {
  return Boolean(task) && Array.isArray(task.tags) && task.tags.some((tag) => typeof tag === "string" && WEATHER_TAGS.includes(tag.trim().toLowerCase()));
}

// Where weather-dependent tasks may go. Pure: no I/O.
//   today:    the current local date, YYYY-MM-DD
//   forecast: the daily forecast (see parseForecast), possibly empty
//   current:  the coarse current-weather key (weatherKey), used for the window's days when there is no forecast
// Returns {lastDate, rainyDates}: the last local date inside the forecast window (WEATHER_DAYS days from today)
// and the dates in the window that count as rainy. Without a forecast, a WET current key makes every day of the
// window rainy. Later dates are outside the window whatever the weather.
function weatherWindow({today, forecast, current}) {
  const lastDate = addDays(today, WEATHER_DAYS - 1);
  const inWindow = (Array.isArray(forecast) ? forecast : []).filter((d) => d.date >= today && d.date <= lastDate);
  if (inWindow.length > 0) return {lastDate, rainyDates: inWindow.filter((d) => d.rainy).map((d) => d.date)};
  const rainyDates = [];
  if (current === "WET") for (let i = 0; i < WEATHER_DAYS; i++) rainyDates.push(addDays(today, i));
  return {lastDate, rainyDates};
}

module.exports = {WEATHER_CODES, UNAVAILABLE, WEATHER_DAYS, WET_DAY_MM, WEATHER_TAGS, weatherUrl, weatherKey, parseForecast, forecastKey, isWeatherSensitive, weatherWindow};
