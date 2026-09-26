import { randomUUID, scryptSync, randomBytes } from "node:crypto";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { db } from "../server.js";
import type { AccountRole } from "../server.js";

function argumentsFrom(argv: string[]): Record<string, string> {
  const options: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`Expected --option value; received "${key}".`);
    }
    options[key.slice(2)] = value;
    i += 1;
  }
  return options;
}

async function hiddenPassword() {
  if (!stdin.isTTY) throw new Error("Run this command in a terminal so the password can be entered securely.");
  stdout.write("Password (12+ characters): ");
  stdin.setRawMode(true);
  stdin.resume();
  let password = "";
  try {
    for await (const chunk of stdin) {
      for (const char of chunk.toString()) {
        if (char === "\u0003") throw new Error("Cancelled.");
        if (char === "\r" || char === "\n") {
          stdout.write("\n");
          return password;
        }
        if (char === "\u007f" || char === "\b") {
          password = password.slice(0, -1);
          continue;
        }
        password += char;
      }
    }
  } finally {
    stdin.setRawMode(false);
    stdin.pause();
  }
  return password;
}

export async function createUser(options: Record<string, string>, password: string): Promise<{ id: string; email: string; role: AccountRole }> {
  const role = options.role;
  const email = options.email?.trim().toLowerCase();
  const name = options.name?.trim();
  if (role !== "doctor" && role !== "patient") throw new Error("Role must be doctor or patient.");
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Provide a valid --email.");
  }
  if (!name || name.length > 120) throw new Error("Provide a --name of at most 120 characters.");
  if (password.length < 12 || password.length > 1024) throw new Error("Password must contain 12 to 1024 characters.");

  let doctor;
  if (role === "patient") {
    if (!options.doctor) throw new Error("A patient requires --doctor with an existing clinician email.");
    doctor = db.prepare("SELECT id FROM users WHERE email = ? AND role = 'doctor'").get(options.doctor.trim().toLowerCase()) as { id: string } | undefined;
    if (!doctor) throw new Error("That clinician account does not exist.");
  } else if (options.doctor) {
    throw new Error("--doctor is only used when creating a patient.");
  }

  const salt = randomBytes(16).toString("hex");
  const passwordHash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  const id = randomUUID();
  const insertUser = db.prepare(`
    INSERT INTO users (id, email, name, role, salt, password_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  db.exec("BEGIN IMMEDIATE");
  try {
    insertUser.run(id, email, name, role, salt, passwordHash, new Date().toISOString());
    if (doctor) db.prepare("INSERT INTO doctor_patients (doctor_id, patient_id) VALUES (?, ?)").run(doctor.id, id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { id, email, role };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = argumentsFrom(process.argv.slice(2));
    const password = await hiddenPassword();
    const user = await createUser(options, password);
    console.log(`Created ${user.role} account ${user.email}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Account creation failed.");
    process.exitCode = 1;
  } finally {
    db.close();
  }
}
