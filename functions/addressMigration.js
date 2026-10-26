/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
// Retiring the client Address field: a client's printed address is now its location's text. Pure: no I/O.

const {MAX_LOCATION_NAME_LENGTH} = require("./location");

// An address as one line: its lines joined with commas, cut to the location name limit; "" for none.
function addressAsLine(address) {
  if (typeof address !== "string") return "";
  return address.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join(", ").slice(0, MAX_LOCATION_NAME_LENGTH);
}

// What the migration does to each stored client with an `address` key (clients without one are left alone):
//   a client with no location of its own gets its address as the location's text (no map position, which the owner can add by
//   picking the address in the Clients form), and the key goes;
//   a client with a location keeps it, the address is only removed, and the plan reports it as `dropped` so it can be kept by hand.
// Returns {changes: [{id, name, address, location}], dropped: [{id, name, address}]}, `location` the {name} to set or null for none.
function planAddressMigration(clients) {
  const changes = [];
  const dropped = [];
  for (const client of Array.isArray(clients) ? clients : []) {
    if (!client || typeof client !== "object" || !("address" in client)) continue;
    const line = addressAsLine(client.address);
    const hasLocation = !!(client.location && typeof client.location === "object" && client.location.name);
    const location = line && !hasLocation ? {name: line} : null;
    changes.push({id: client.id, name: client.name, address: line, location});
    if (line && hasLocation) dropped.push({id: client.id, name: client.name, address: line});
  }
  return {changes, dropped};
}

module.exports = {addressAsLine, planAddressMigration};
