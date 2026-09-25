import crypto from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { languages } from "../../../lib/languages";
import { getUser, saveUser } from "../../../lib/storage";

export const runtime = "nodejs";

const scrypt = promisify(crypto.scrypt);
const cookieName = "astra_session";
const normalizeContact = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, "");
const userId = (contact) => crypto.createHash("sha256").update(contact).digest("hex");
const publicUser = ({ passwordHash, passwordSalt, ...user }) => user;

async function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: (await scrypt(password, salt, 64)).toString("hex") };
}

async function passwordMatches(password, user) {
  const candidate = Buffer.from((await hashPassword(password, user.passwordSalt)).hash, "hex");
  const stored = Buffer.from(user.passwordHash, "hex");
  return candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
}

function sessionToken(id) {
  const payload = Buffer.from(JSON.stringify({ id, expires: Date.now() + 7 * 86400000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", process.env.AUTH_SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function sessionId() {
  try {
    const [payload, signature] = cookies().get(cookieName)?.value.split(".") || [];
    if (!payload || !signature) return null;
    const expected = crypto.createHmac("sha256", process.env.AUTH_SECRET).update(payload).digest("base64url");
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return session.expires > Date.now() ? session.id : null;
  } catch { return null; }
}

function setSession(id) {
  cookies().set(cookieName, sessionToken(id), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 7 * 86400 });
}

function validateContact(contact) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) || /^\+?\d{7,15}$/.test(contact);
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePhone(phone) {
  return /^\+?\d{7,15}$/.test(phone);
}

export async function GET() {
  try {
    const id = sessionId();
    const user = id && await getUser(id);
    return user ? Response.json({ user: publicUser(user) }) : Response.json({ error: "Not signed in." }, { status: 401 });
  } catch (error) {
    return Response.json({ error: error.message || "Could not load profile." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (body.action === "signup") {
      const email = normalizeContact(body.email);
      const contactNumber = normalizeContact(body.contactNumber);
      const id = userId(email);
      if (!validateEmail(email) || !validatePhone(contactNumber) || String(body.password || "").length < 8 || !String(body.name || "").trim() || !String(body.branch || "").trim() || !String(body.semester || "").trim() || !String(body.usn || "").trim()) return Response.json({ error: "Complete all registration details with a valid email, contact number, and 8-character password." }, { status: 400 });
      if (await getUser(id)) return Response.json({ error: "An account already exists for this email or phone." }, { status: 409 });
      const password = await hashPassword(body.password);
      const user = { id, name: body.name.trim(), contact: email, email, contactNumber, branch: body.branch.trim(), semester: body.semester.trim(), usn: body.usn.trim().toUpperCase(), role: "student", preferredLanguage: "English", gradeSubject: "", notifications: true, passwordHash: password.hash, passwordSalt: password.salt, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      await saveUser(user);
      setSession(id);
      return Response.json({ user: publicUser(user) }, { status: 201 });
    }
    const contact = normalizeContact(body.contact);
    const id = userId(contact);
    if (!validateContact(contact) || String(body.password || "").length < 8) return Response.json({ error: "Enter a valid email or phone and an 8-character password." }, { status: 400 });
    const user = await getUser(id);
    if (!user || !await passwordMatches(body.password, user)) return Response.json({ error: "Incorrect email/phone or password." }, { status: 401 });
    setSession(id);
    return Response.json({ user: publicUser(user) });
  } catch (error) {
    console.error("Authentication failed", error);
    return Response.json({ error: error.message || "Authentication failed." }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const id = sessionId();
    const user = id && await getUser(id);
    if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });
    const body = await request.json();
    if (body.newPassword) {
      if (!await passwordMatches(String(body.currentPassword || ""), user)) return Response.json({ error: "Current password is incorrect." }, { status: 401 });
      if (String(body.newPassword).length < 8) return Response.json({ error: "New password must be at least 8 characters." }, { status: 400 });
      const password = await hashPassword(body.newPassword);
      user.passwordHash = password.hash;
      user.passwordSalt = password.salt;
    }
    if (body.name !== undefined) user.name = String(body.name).trim().slice(0, 100) || user.name;
    if (body.role !== undefined && ["teacher", "student", "admin"].includes(body.role)) user.role = body.role;
    if (body.preferredLanguage !== undefined && languages.includes(body.preferredLanguage)) user.preferredLanguage = body.preferredLanguage;
    if (body.gradeSubject !== undefined) user.gradeSubject = String(body.gradeSubject).trim().slice(0, 120);
    if (body.notifications !== undefined) user.notifications = Boolean(body.notifications);
    user.updatedAt = new Date().toISOString();
    await saveUser(user);
    return Response.json({ user: publicUser(user) });
  } catch (error) {
    console.error("Profile update failed", error);
    return Response.json({ error: error.message || "Could not update profile." }, { status: 500 });
  }
}

export async function DELETE() {
  cookies().set(cookieName, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return Response.json({ signedOut: true });
}
