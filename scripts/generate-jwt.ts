/**
 * Generate a JWT token for PostgREST authentication.
 *
 * Usage:
 *   npx ts-node scripts/generate-jwt.ts <jwt-secret>
 *
 * The generated token has role "service_role" and no expiration.
 * Set the output as ELPASS_TOKEN in your .env file.
 */

import crypto from "crypto";

function base64url(data: string | Buffer): string {
  const buf = typeof data === "string" ? Buffer.from(data) : data;
  return buf.toString("base64url");
}

function generateJwt(secret: string): string {
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    role: "service_role",
    iat: Math.floor(Date.now() / 1000),
  };

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const signature = crypto
    .createHmac("sha256", secret)
    .update(signingInput)
    .digest();

  return `${signingInput}.${base64url(signature)}`;
}

// --- Main ---
const secret = process.argv[2];
if (!secret) {
  console.error("Usage: npx ts-node scripts/generate-jwt.ts <jwt-secret>");
  console.error("\nThe secret must match PGRST_JWT_SECRET in your .env file.");
  console.error("Minimum 32 characters recommended.");
  process.exit(1);
}

if (secret.length < 32) {
  console.warn(
    "WARNING: Secret is shorter than 32 characters. PostgREST requires at least 32 chars.\n",
  );
}

const token = generateJwt(secret);

console.log("Generated JWT token:\n");
console.log(token);
console.log("\nAdd this to your .env file as:");
console.log(`ELPASS_TOKEN=${token}`);
