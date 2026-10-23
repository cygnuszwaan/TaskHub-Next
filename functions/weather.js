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

const UNAVAILABLE = "Weather data currently unavailable";

// Open-Meteo request for the current weather at a location ({latitude, longitude}).
function weatherUrl(location) {
  return `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current_weather=true`;
}

// One-line description of Open-Meteo's `current_weather` object, e.g. "Slight rain, 14.2°C". An unknown code reads
// as "Variable conditions"; a missing or unusable object (or temperature) gives the unavailable text.
function describeWeather(current) {
  if (!current || typeof current !== "object" || typeof current.temperature !== "number" || !Number.isFinite(current.temperature)) return UNAVAILABLE;
  const description = Object.prototype.hasOwnProperty.call(WEATHER_CODES, current.weathercode) ? WEATHER_CODES[current.weathercode] : "Variable conditions";
  return `${description}, ${current.temperature}°C`;
}

module.exports = {WEATHER_CODES, UNAVAILABLE, weatherUrl, describeWeather};
