import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../lib/env.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function generatedMediaRoot() {
  return path.isAbsolute(env.GENERATED_MEDIA_DIR)
    ? env.GENERATED_MEDIA_DIR
    : path.resolve(projectRoot, env.GENERATED_MEDIA_DIR);
}

export async function saveGeneratedMedia(input: {
  bytes: Uint8Array | Buffer;
  extension: string;
  prefix: string;
}) {
  const root = generatedMediaRoot();
  await mkdir(root, { recursive: true });
  const extension = input.extension.replace(/^\./, "") || "bin";
  const filename = `${input.prefix}-${Date.now()}-${randomUUID()}.${extension}`;
  const filePath = path.join(root, filename);
  await writeFile(filePath, input.bytes);
  const publicBase = env.GENERATED_MEDIA_PUBLIC_PATH.replace(/\/+$/g, "");
  return {
    filename,
    path: filePath,
    url: `${publicBase}/${encodeURIComponent(filename)}`,
  };
}
