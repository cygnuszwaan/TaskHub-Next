/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
// Clients that projects can belong to: validation, the list helpers and the lines printed on a job sheet.
// Pure: no I/O.

const MAX_NAME_LENGTH = 100;
const MAX_ADDRESS_LENGTH = 300;
const MAX_PHONE_LENGTH = 40;
const MAX_EMAIL_LENGTH = 100;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A one-line text field: whitespace collapsed, null/undefined meaning empty. Returns {text} or {error}.
function oneLine(value, label, max) {
  if (value === undefined || value === null) return {text: ""};
  if (typeof value !== "string") return {error: `${label} must be text`};
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length > max) return {error: `${label} must be at most ${max} characters`};
  return {text};
}

// The fields of a client from the owner: {name, address, phone, email}. The name is required (1..100 characters, inner
// whitespace collapsed); the address may span lines (each line trimmed, blank lines dropped, at most 300 characters in
// all); the phone is one line of at most 40 characters; the email, when given, must look like an address (at most 100
// characters). A missing or null optional field is empty. Returns {client: {name, address, phone, email}} or {error}.
function normalizeClientFields(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {error: "client must be an object"};
  const name = oneLine(value.name, "name", MAX_NAME_LENGTH);
  if (name.error) return {error: name.error};
  if (!name.text) return {error: "name must be a non-empty string"};
  let address = "";
  if (value.address !== undefined && value.address !== null) {
    if (typeof value.address !== "string") return {error: "address must be text"};
    address = value.address.replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/[^\S\n]+/g, " ").trim()).filter(Boolean).join("\n");
    if (address.length > MAX_ADDRESS_LENGTH) return {error: `address must be at most ${MAX_ADDRESS_LENGTH} characters`};
  }
  const phone = oneLine(value.phone, "phone", MAX_PHONE_LENGTH);
  if (phone.error) return {error: phone.error};
  const email = oneLine(value.email, "email", MAX_EMAIL_LENGTH);
  if (email.error) return {error: email.error};
  if (email.text && !EMAIL_PATTERN.test(email.text)) return {error: "email is not a valid address"};
  return {client: {name: name.text, address, phone: phone.text, email: email.text}};
}

// Clients sorted by name (case-insensitive), then id. Returns a new array.
function sortClients(clients) {
  const key = (c) => String(c.name || "").toLowerCase();
  return [...clients].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function nameTaken(clients, name, exceptId) {
  const key = name.toLowerCase();
  return clients.some((c) => c.id !== exceptId && String(c.name || "").toLowerCase() === key);
}

// Add a client; names are unique ignoring case. Returns {clients, client} or {error}.
function addClient(clients, fields, makeId) {
  const {client: clean, error} = normalizeClientFields(fields);
  if (error) return {error};
  if (nameTaken(clients, clean.name)) return {error: `A client named "${clean.name}" already exists`};
  const client = {id: makeId(), ...clean};
  return {clients: sortClients([...clients, client]), client};
}

// Replace a client's fields (the id stays). Returns {clients, client}, {notFound: true} or {error}.
function updateClient(clients, clientId, fields) {
  if (!clients.some((c) => c.id === clientId)) return {notFound: true};
  const {client: clean, error} = normalizeClientFields(fields);
  if (error) return {error};
  if (nameTaken(clients, clean.name, clientId)) return {error: `A client named "${clean.name}" already exists`};
  const client = {id: clientId, ...clean};
  return {clients: sortClients(clients.map((c) => (c.id === clientId ? client : c))), client};
}

// The projects with `clientId` taken off every project that has it. Returns new objects only for those that changed.
function removeClientFromProjects(projects, clientId) {
  return projects.map((p) => {
    if (p.clientId !== clientId) return p;
    const next = {...p};
    delete next.clientId;
    return next;
  });
}

// Give a project a client, or take it off (null or "" removes it). Returns {projects, project}, {notFound: true} for an
// unknown project, or {error} for a client id that is not in `clients`.
function setProjectClient(projects, clients, projectId, clientId) {
  const project = projects.find((p) => p.id === projectId);
  if (!project) return {notFound: true};
  const next = {...project};
  if (clientId === null || clientId === "" || clientId === undefined) delete next.clientId;
  else if (typeof clientId === "string" && clients.some((c) => c.id === clientId)) next.clientId = clientId;
  else return {error: "Client not found"};
  return {projects: projects.map((p) => (p.id === projectId ? next : p)), project: next};
}

// The lines a job sheet prints for a client: name, the address's lines, phone, email; nothing for a missing client.
function clientLines(client) {
  if (!client || typeof client !== "object") return [];
  const lines = [];
  if (client.name) lines.push(String(client.name));
  if (client.address) lines.push(...String(client.address).split("\n"));
  if (client.phone) lines.push(String(client.phone));
  if (client.email) lines.push(String(client.email));
  return lines;
}

module.exports = {MAX_NAME_LENGTH, MAX_ADDRESS_LENGTH, MAX_PHONE_LENGTH, MAX_EMAIL_LENGTH, normalizeClientFields, sortClients, addClient, updateClient, removeClientFromProjects, setProjectClient, clientLines};
