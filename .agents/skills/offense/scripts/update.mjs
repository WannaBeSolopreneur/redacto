// scripts/skill-updater-cli.mjs
import path2 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// scripts/skill-updater.mjs
import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, realpath, rename, unlink } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
var INSTALL_RECORD = ".skill-install.json";
var LOCK = ".skill-update.lock";
var JOURNAL = ".skill-update-transaction.json";
var PENDING = ".skill-update-pending.json";
var MAX_FILE = 2e6;
var MAX_TOTAL = 12e6;
var MAX_MANIFEST = 128e3;
var hash = (value) => createHash("sha256").update(value).digest("hex");
var shaPattern = /^[a-f0-9]{64}$/;
var versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
var names = /* @__PURE__ */ new Set(["offense", "purple"]);
var NEW_SESSION_MESSAGE = "Start a new coding-agent session in this same project to load the updated skill.";
function managedPath(value) {
  return typeof value === "string" && !value.includes("\\") && !value.split("/").some((part) => !part || part.startsWith(".")) && (value === "SKILL.md" || /^(?:scripts\/[A-Za-z0-9_./-]+\.mjs|references\/[A-Za-z0-9_./-]+\.md|agents\/openai\.yaml)$/.test(value));
}
function relativePath(value) {
  return typeof value === "string" && value && !path.isAbsolute(value) && !value.includes("\\") && !value.split("/").some((part) => !part || part === "." || part === "..");
}
function compareVersions(a, b) {
  const left = a.split(".").map(Number), right = b.split(".").map(Number);
  for (let index = 0; index < 3; index++) if (left[index] !== right[index]) return left[index] > right[index] ? 1 : -1;
  return 0;
}
function validateRelease(manifest, skill) {
  if (!names.has(skill) || manifest?.schemaVersion !== 1 || manifest.skill !== skill || !versionPattern.test(manifest.version || "") || !Number.isInteger(manifest.minimumNodeMajor) || manifest.minimumNodeMajor < 20 || manifest.minimumNodeMajor > 99 || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 32) throw Error("Unsupported skill release manifest.");
  const seen = /* @__PURE__ */ new Set();
  let total = 0;
  for (const file of manifest.files) {
    if (!managedPath(file.path) || seen.has(file.path.toLowerCase()) || !shaPattern.test(file.sha256 || "") || !Number.isInteger(file.bytes) || file.bytes < 0 || file.bytes > MAX_FILE) throw Error("Invalid or duplicate managed skill file.");
    seen.add(file.path.toLowerCase());
    total += file.bytes;
  }
  const entrypoint = skill === "offense" ? "scripts/offense.mjs" : "scripts/purple.mjs";
  if (!seen.has("skill.md") || !seen.has(entrypoint) || !seen.has("scripts/update.mjs") || !manifest.files.find((file) => file.path === "SKILL.md")?.bytes || total > MAX_TOTAL) throw Error("Incomplete or oversized skill release.");
  if (!Array.isArray(manifest.previousReleases) || manifest.previousReleases.length > 16) throw Error("Invalid skill release history.");
  for (const release of manifest.previousReleases) {
    if (!versionPattern.test(release?.version || "") || !release.files || typeof release.files !== "object" || Array.isArray(release.files) || Object.keys(release.files).length > 32 || Object.entries(release.files).some(([file, digest]) => !managedPath(file) || !shaPattern.test(digest))) throw Error("Invalid historical skill hashes.");
  }
  return manifest;
}
async function rootDirectory(root) {
  const resolved = path.resolve(root), info = await lstat(resolved);
  if (!info.isDirectory() || info.isSymbolicLink() || await realpath(resolved) !== resolved) throw Error("Skill installation must be a real directory without symlink parents.");
  return resolved;
}
async function inside(root, relative, createParents = false) {
  if (!relativePath(relative)) throw Error("Invalid skill-local path.");
  const parts = relative.split("/");
  let current = root;
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      if (!createParents) return null;
      try {
        await mkdir(current, { mode: 448 });
      } catch (created) {
        if (created.code !== "EEXIST") throw created;
      }
      info = await lstat(current);
    }
    if (!info.isDirectory() || info.isSymbolicLink()) throw Error("Refusing a symlink or non-directory in the skill installation.");
  }
  return path.join(root, ...parts);
}
async function localFile(root, relative, limit = MAX_FILE) {
  const filename = await inside(root, relative);
  if (!filename) return null;
  let handle;
  try {
    const info = await lstat(filename);
    if (!info.isFile() || info.isSymbolicLink() || info.size > limit) throw Error("Refusing an unsafe or oversized skill file: " + relative);
    handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
    const actual = await handle.stat();
    if (!actual.isFile() || actual.size > limit) throw Error("Skill file changed while reading: " + relative);
    const bytes = await handle.readFile();
    if (bytes.length > limit) throw Error("Oversized skill file: " + relative);
    return { bytes, sha256: hash(bytes), mode: actual.mode & 511 };
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  } finally {
    await handle?.close();
  }
}
async function atomicFile(root, relative, bytes, mode = 384) {
  const filename = await inside(root, relative, true);
  await localFile(root, relative, relative === JOURNAL ? MAX_TOTAL * 2 : MAX_TOTAL);
  const temp = path.join(path.dirname(filename), ".purple-update-" + randomUUID());
  let handle;
  try {
    handle = await open(temp, "wx", mode);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = null;
    await inside(root, relative);
    await localFile(root, relative, relative === JOURNAL ? MAX_TOTAL * 2 : MAX_TOTAL);
    await rename(temp, filename);
  } finally {
    await handle?.close();
    await unlink(temp).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}
async function removeLocal(root, relative) {
  if (!await localFile(root, relative, MAX_TOTAL * 2)) return;
  await unlink(await inside(root, relative));
}
function recordJson(file) {
  try {
    return file ? JSON.parse(file.bytes.toString("utf8")) : null;
  } catch {
    throw Error("Invalid local skill update record.");
  }
}
function validateRecord(record, skill) {
  if (record === null) return null;
  if (record.schemaVersion !== 1 || record.skill !== skill || !versionPattern.test(record.releaseVersion || "") || !record.files || Array.isArray(record.files) || typeof record.files !== "object" || Object.keys(record.files).length > 32 || Object.entries(record.files).some(([file, value]) => !managedPath(file) || !shaPattern.test(value?.upstreamSha256 || "") || !shaPattern.test(value?.localSha256 || "") || typeof value.customized !== "boolean")) throw Error("Invalid local skill installation receipt.");
  return record;
}
async function acquireLock(root) {
  const filename = await inside(root, LOCK);
  let handle;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      handle = await open(filename, "wx", 384);
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const bytes = await localFile(root, LOCK, 1024);
      if (!bytes) continue;
      let existing;
      try {
        existing = recordJson(bytes);
      } catch {
        return null;
      }
      if (!Number.isInteger(existing?.pid) || existing.pid < 1) return null;
      try {
        process.kill(existing.pid, 0);
        return null;
      } catch (probe) {
        if (probe.code !== "ESRCH") return null;
      }
      await removeLocal(root, LOCK);
    }
  }
  if (!handle) return null;
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid }));
  } catch (error) {
    await handle.close();
    await unlink(filename);
    throw error;
  }
  await handle.close();
  return () => removeLocal(root, LOCK);
}
async function boundedDownload(fetchImpl, url, limit, signal) {
  const response = await fetchImpl(url, {
    method: "GET",
    headers: { accept: "application/json, text/plain, */*", "cache-control": "no-cache" },
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
    signal
  });
  if (!response.ok) throw Error("Skill release download returned HTTP " + response.status + ".");
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) throw Error("Skill release download exceeds its size limit.");
  if (!response.body) throw Error("Skill release download has no body.");
  const reader = response.body.getReader(), chunks = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) throw Error("Skill release download exceeds its size limit.");
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => {
    });
    throw error;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
async function snapshot(root, files) {
  const entries = await Promise.all(files.map(async (file) => [file.path, await localFile(root, file.path)]));
  if (entries.reduce((total, [, file]) => total + (file?.bytes.length || 0), 0) > MAX_TOTAL) throw Error("Installed skill exceeds its size limit.");
  return new Map(entries);
}
function installationRecord(skill, manifest, current) {
  return {
    schemaVersion: 1,
    skill,
    releaseVersion: manifest.version,
    files: Object.fromEntries(manifest.files.map((file) => [file.path, {
      upstreamSha256: file.sha256,
      localSha256: current.get(file.path).sha256,
      customized: current.get(file.path).sha256 !== file.sha256
    }]))
  };
}
function result(status, extra = {}) {
  return { status, sessionReloadRequired: false, stop: false, ...extra };
}
async function recoverTransaction(root, skill) {
  const journal = recordJson(await localFile(root, JOURNAL, MAX_TOTAL * 2));
  if (!journal) return;
  if (journal.schemaVersion !== 1 || journal.skill !== skill || !Array.isArray(journal.files) || journal.files.length > 32 || !shaPattern.test(journal.newReceiptSha256 || "") || journal.oldReceipt !== null && typeof journal.oldReceipt !== "string") throw Error("Invalid interrupted skill update.");
  const conflicts = [];
  for (const file of journal.files) {
    if (!managedPath(file.path) || !shaPattern.test(file.nextSha256 || "") || file.previous !== null && (typeof file.previous !== "string" || !shaPattern.test(file.previousSha256 || "")) || !Number.isInteger(file.mode) || file.mode < 0 || file.mode > 511) throw Error("Invalid interrupted skill file.");
    const previous = file.previous === null ? null : Buffer.from(file.previous, "base64");
    if (previous && (previous.length > MAX_FILE || hash(previous) !== file.previousSha256)) throw Error("Invalid skill recovery content.");
    const current = await localFile(root, file.path);
    if (current?.sha256 === file.previousSha256 || !current && !previous) continue;
    if (current?.sha256 !== file.nextSha256) {
      conflicts.push(file.path);
      continue;
    }
    if (previous) await atomicFile(root, file.path, previous, file.mode & 511);
    else await removeLocal(root, file.path);
  }
  const oldReceipt = journal.oldReceipt === null ? null : Buffer.from(journal.oldReceipt, "base64");
  if (oldReceipt) {
    if (oldReceipt.length > MAX_MANIFEST) throw Error("Invalid recovery receipt size.");
    validateRecord(recordJson({ bytes: oldReceipt }), skill);
  }
  const currentReceipt = await localFile(root, INSTALL_RECORD, MAX_MANIFEST);
  if (currentReceipt?.sha256 === journal.newReceiptSha256) {
    if (oldReceipt) await atomicFile(root, INSTALL_RECORD, oldReceipt);
    else await removeLocal(root, INSTALL_RECORD);
  } else if (currentReceipt?.sha256 !== (oldReceipt ? hash(oldReceipt) : void 0)) conflicts.push(INSTALL_RECORD);
  if (conflicts.length) throw Error("Interrupted update preserved concurrent edits; review staged files before accepting local changes: " + conflicts.join(", "));
  await removeLocal(root, JOURNAL);
}
async function checkSkillUpdates({ skill, root, automatic = false, mode = "auto", fetchImpl = fetch, beforeReplace } = {}) {
  let releaseLock, resolved, recoveryNeeded = false;
  try {
    if (!names.has(skill) || !["auto", "check", "accept-local"].includes(mode)) throw Error("Unknown skill or update mode.");
    resolved = await rootDirectory(root);
    if (path.basename(path.dirname(resolved)) === "skills" && path.basename(path.dirname(path.dirname(resolved))) === "public" && await lstat(path.resolve(resolved, "../../..", ".git")).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    })) {
      return result("not_installed", automatic ? {} : { message: "Run the updater from an installed skill copy, not the repository\u2019s published source assets." });
    }
    if (automatic && !await localFile(resolved, "SKILL.md")) return result("not_installed");
    releaseLock = await acquireLock(resolved);
    if (!releaseLock) return result("busy", { stop: true, message: "A skill update is running or its lock needs review. Retry after it finishes." });
    if (mode !== "accept-local") {
      recoveryNeeded = true;
      await recoverTransaction(resolved, skill);
      recoveryNeeded = false;
    }
    const origin = "https://app.purpleteam.sh/skills/" + skill + "/";
    const manifestBytes = await boundedDownload(fetchImpl, origin + "manifest.json", MAX_MANIFEST, AbortSignal.timeout(5e3));
    let manifest;
    try {
      manifest = validateRelease(JSON.parse(manifestBytes.toString("utf8")), skill);
    } catch {
      throw Error("Invalid or unsupported skill release manifest.");
    }
    if (Number(process.versions.node.split(".")[0]) < manifest.minimumNodeMajor) return result("runtime_required", { message: `Skill ${manifest.version} requires Node ${manifest.minimumNodeMajor}+. Existing installation was preserved.` });
    const receiptFile = await localFile(resolved, INSTALL_RECORD, MAX_MANIFEST), receipt = validateRecord(recordJson(receiptFile), skill);
    const current = await snapshot(resolved, manifest.files), digest = hash(manifestBytes);
    if (receipt?.releaseVersion === manifest.version && (Object.keys(receipt.files).length !== manifest.files.length || manifest.files.some((file) => receipt.files[file.path]?.upstreamSha256 !== file.sha256))) throw Error("Hosted skill files changed without a version bump; no update was applied.");
    const pending = mode === "accept-local" ? recordJson(await localFile(resolved, PENDING, MAX_MANIFEST)) : null;
    if (mode === "accept-local") {
      if (pending?.version !== manifest.version || pending?.manifestSha256 !== digest || pending?.skill !== skill || !relativePath(pending?.directory) || !/^\.skill-updates\/[A-Za-z0-9.-]+$/.test(pending.directory) || current.size !== manifest.files.length || [...current.values()].some((file) => !file)) throw Error("Review and merge a complete staged release before accepting local files.");
      const staged = await localFile(resolved, pending.directory + "/manifest.json", MAX_MANIFEST);
      if (staged?.sha256 !== digest) throw Error("Staged release identity changed; check for updates again.");
      await atomicFile(resolved, INSTALL_RECORD, Buffer.from(JSON.stringify(installationRecord(skill, manifest, current), null, 2) + "\n"));
      await removeLocal(resolved, JOURNAL);
      await removeLocal(resolved, PENDING);
      return result("customizations_accepted", {
        version: manifest.version,
        sessionReloadRequired: true,
        stop: true,
        message: "Local customizations recorded against release " + manifest.version + ". " + NEW_SESSION_MESSAGE
      });
    }
    const skillText = current.get("SKILL.md")?.bytes.toString("utf8") || "";
    const localVersion = receipt?.releaseVersion || skillText.match(/^---[\s\S]*?\n\s+version:\s*["']?([0-9]+\.[0-9]+\.[0-9]+)/)?.[1];
    if (localVersion && compareVersions(localVersion, manifest.version) > 0) return result("server_older", { version: localVersion, message: "The installed skill is newer than the hosted release; no downgrade was applied." });
    const retiredConflicts = [];
    for (const [file, base] of Object.entries(receipt?.files || {})) {
      if (current.has(file)) continue;
      const local = await localFile(resolved, file);
      if (local && (base.customized || local.sha256 !== base.upstreamSha256)) retiredConflicts.push(file);
    }
    const exact = manifest.files.every((file) => current.get(file.path)?.sha256 === file.sha256);
    if ((exact || receipt?.releaseVersion === manifest.version) && !retiredConflicts.length) {
      if (mode === "check") return result(exact ? "current" : "current_customized", { version: manifest.version });
      if (exact) {
        const changedRelease = receipt && receipt.releaseVersion !== manifest.version;
        const nextReceipt2 = Buffer.from(JSON.stringify(installationRecord(skill, manifest, current), null, 2) + "\n");
        if (!receiptFile?.bytes.equals(nextReceipt2)) await atomicFile(resolved, INSTALL_RECORD, nextReceipt2);
        if (await localFile(resolved, PENDING, MAX_MANIFEST)) await removeLocal(resolved, PENDING);
        return result(changedRelease ? "updated" : receipt ? "current" : "initialized", {
          version: manifest.version,
          sessionReloadRequired: Boolean(changedRelease),
          stop: Boolean(changedRelease),
          ...changedRelease ? { message: NEW_SESSION_MESSAGE } : {}
        });
      }
      return result("current_customized", { version: manifest.version, message: "Latest release is recorded; local customizations are preserved." });
    }
    const conflicts = [...retiredConflicts, ...manifest.files.filter((file) => {
      const local = current.get(file.path), base = receipt?.files[file.path];
      if (!local) return Boolean(base);
      if (local.sha256 === file.sha256) return false;
      if (base) return base.customized || local.sha256 !== base.upstreamSha256;
      return !manifest.previousReleases.some((release) => release.files[file.path] === local.sha256);
    }).map((file) => file.path)];
    if (mode === "check") return result("update_available", { version: manifest.version, conflicts });
    const downloads = /* @__PURE__ */ new Map(), signal = AbortSignal.timeout(3e4);
    for (const file of manifest.files) {
      const cached = current.get(file.path);
      const bytes = cached?.sha256 === file.sha256 ? cached.bytes : await boundedDownload(fetchImpl, origin + file.path, file.bytes, signal);
      if (bytes.length !== file.bytes || hash(bytes) !== file.sha256) throw Error("Skill release checksum mismatch: " + file.path);
      downloads.set(file.path, bytes);
    }
    const stage = ".skill-updates/" + manifest.version + "-" + digest.slice(0, 16);
    for (const file of manifest.files) {
      const existing = await localFile(resolved, stage + "/files/" + file.path);
      if (existing && existing.sha256 !== file.sha256) throw Error("Staged release was customized; preserve it and move it aside before retrying.");
      if (!existing) await atomicFile(resolved, stage + "/files/" + file.path, downloads.get(file.path));
    }
    const oldManifest = await localFile(resolved, stage + "/manifest.json", MAX_MANIFEST);
    if (oldManifest && oldManifest.sha256 !== digest) throw Error("Staged release manifest was customized; preserve it before retrying.");
    if (!oldManifest) await atomicFile(resolved, stage + "/manifest.json", manifestBytes);
    await atomicFile(resolved, PENDING, Buffer.from(JSON.stringify({ skill, version: manifest.version, manifestSha256: digest, directory: stage }, null, 2) + "\n"));
    const latest = await snapshot(resolved, manifest.files);
    for (const file of manifest.files) if (latest.get(file.path)?.sha256 !== current.get(file.path)?.sha256 && !conflicts.includes(file.path)) conflicts.push(file.path);
    if (conflicts.length) return result("review_required", {
      version: manifest.version,
      conflicts,
      stagedDirectory: path.join(resolved, stage),
      message: "Update " + manifest.version + " is staged for review. Customized files were preserved: " + conflicts.join(", ") + ". Merge the reviewed files, then run update --accept-local."
    });
    const next = new Map(manifest.files.map((file) => [file.path, { sha256: file.sha256 }]));
    const nextReceipt = Buffer.from(JSON.stringify(installationRecord(skill, manifest, next), null, 2) + "\n");
    const changed = manifest.files.filter((file) => current.get(file.path)?.sha256 !== file.sha256);
    const journal = {
      schemaVersion: 1,
      skill,
      oldReceipt: receiptFile?.bytes.toString("base64") ?? null,
      newReceiptSha256: hash(nextReceipt),
      files: changed.map((file) => ({
        path: file.path,
        previous: current.get(file.path)?.bytes.toString("base64") ?? null,
        previousSha256: current.get(file.path)?.sha256 ?? null,
        nextSha256: file.sha256,
        mode: current.get(file.path)?.mode ?? 420
      }))
    };
    await atomicFile(resolved, JOURNAL, Buffer.from(JSON.stringify(journal)));
    try {
      for (const file of changed) {
        await beforeReplace?.(file.path);
        if ((await localFile(resolved, file.path))?.sha256 !== current.get(file.path)?.sha256) throw Error("Skill file changed before update: " + file.path);
        await atomicFile(resolved, file.path, downloads.get(file.path), current.get(file.path)?.mode ?? 420);
      }
      await atomicFile(resolved, INSTALL_RECORD, nextReceipt);
      await removeLocal(resolved, PENDING);
      await removeLocal(resolved, JOURNAL);
    } catch (error) {
      recoveryNeeded = true;
      await recoverTransaction(resolved, skill);
      recoveryNeeded = false;
      throw error;
    }
    return result("updated", {
      version: manifest.version,
      updatedFiles: changed.map((file) => file.path),
      sessionReloadRequired: true,
      stop: true,
      message: "Skill updated to " + manifest.version + ". " + NEW_SESSION_MESSAGE
    });
  } catch (error) {
    return result(recoveryNeeded ? "recovery_required" : "check_failed", {
      stop: recoveryNeeded,
      message: (recoveryNeeded ? "Skill update recovery needs review: " : "Could not update the skill; existing files were preserved: ") + error.message
    });
  } finally {
    await releaseLock?.();
  }
}
async function updateBeforeRun(skill, scriptUrl, { preview = false, fetchImpl = fetch, log = console.error } = {}) {
  if (preview) return result("offline_preview");
  const root = path.resolve(path.dirname(fileURLToPath(scriptUrl)), "..");
  const outcome = await checkSkillUpdates({ skill, root, automatic: true, fetchImpl });
  if (outcome.message) log("Skill updates: " + outcome.message);
  if (outcome.stop) process.exitCode = outcome.sessionReloadRequired ? 4 : 3;
  return outcome;
}
async function updaterMain(argv = process.argv.slice(2), scriptUrl = import.meta.url) {
  if (argv.includes("--help")) {
    console.log("Usage: node scripts/update.mjs --skill offense|purple [--check | --accept-local]\nChecks public release metadata. Updates only unchanged managed skill files; customized releases are staged for review. Exit 4 means start a new session; exit 3 means retry or recover; exit 2 means an update needs review.");
    return;
  }
  let skill, mode = "auto";
  while (argv.length) {
    const flag = argv.shift();
    if (flag === "--skill" && names.has(argv[0])) skill = argv.shift();
    else if (flag === "--check" && mode === "auto") mode = "check";
    else if (flag === "--accept-local" && mode === "auto") mode = "accept-local";
    else throw Error("Unknown or incomplete skill update option: " + flag);
  }
  if (!skill) throw Error("Provide --skill offense or --skill purple.");
  const root = path.resolve(path.dirname(fileURLToPath(scriptUrl)), "..");
  if (!await localFile(root, "SKILL.md") && (path.basename(fileURLToPath(scriptUrl)) !== "update.mjs" || path.basename(root) !== skill)) {
    throw Error("Run the updater from the installed skill\u2019s scripts directory.");
  }
  const outcome = await checkSkillUpdates({ skill, root, mode });
  console.log(JSON.stringify(outcome, null, 2));
  if (outcome.message) console.error(outcome.message);
  if (outcome.sessionReloadRequired) process.exitCode = 4;
  else if (outcome.stop) process.exitCode = 3;
  else if (["check_failed", "review_required", "runtime_required", "not_installed"].includes(outcome.status)) process.exitCode = 2;
}

// scripts/skill-updater-cli.mjs
if (process.argv[1] && path2.resolve(process.argv[1]) === fileURLToPath2(import.meta.url)) {
  updaterMain(process.argv.slice(2), import.meta.url).catch((error) => {
    console.error("Skill updates: " + error.message);
    process.exitCode = 2;
  });
}
export {
  checkSkillUpdates,
  updateBeforeRun,
  validateRelease
};
