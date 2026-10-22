/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
const BEARER = /^Bearer\s+(\S+)$/i;

// Token from an "Authorization: Bearer <token>" header, or null.
function getBearerToken(header) {
  const match = BEARER.exec(typeof header === "string" ? header : "");
  return match ? match[1] : null;
}

// True only for a verified Google account whose email equals the owner's (case-insensitive).
// An empty or missing owner email matches nobody.
function isOwner(decoded, ownerEmail) {
  const owner = typeof ownerEmail === "string" ? ownerEmail.trim().toLowerCase() : "";
  if (!decoded || !owner) return false;
  return decoded.email_verified === true && typeof decoded.email === "string" && decoded.email.toLowerCase() === owner;
}

// Build the wrapper that restricts an onRequest handler to the owner.
//   verifyToken(token) -> decoded token, or throws if invalid or expired
//   getOwnerEmail()    -> the allowlisted email
// 401: no token or an invalid one. 403: a valid sign-in by another account (or no owner configured).
function makeOwnerOnly(verifyToken, getOwnerEmail) {
  return (handler) => async (req, res) => {
    const token = getBearerToken(req.get("Authorization"));
    if (!token) return res.status(401).send({error: "Sign-in required"});
    let decoded;
    try {
      decoded = await verifyToken(token);
    } catch (err) {
      return res.status(401).send({error: "Invalid or expired sign-in"});
    }
    if (!isOwner(decoded, getOwnerEmail())) return res.status(403).send({error: "This account is not allowed"});
    return handler(req, res);
  };
}

module.exports = {getBearerToken, isOwner, makeOwnerOnly};
