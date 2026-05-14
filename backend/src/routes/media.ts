import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { generatedMediaRoot } from "../services/media-store.js";

export const mediaRouter = Router();

mediaRouter.get("/:filename", async (req, res) => {
  const filename = typeof req.params.filename === "string" ? req.params.filename : "";
  const safeName = path.basename(filename);
  if (!safeName || safeName !== filename) {
    res.status(404).json({ error: "media_not_found" });
    return;
  }

  const filePath = path.join(generatedMediaRoot(), safeName);
  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      res.status(404).json({ error: "media_not_found" });
      return;
    }
    res.setHeader("Content-Type", contentTypeForFile(safeName));
    res.setHeader("Cache-Control", "private, max-age=3600");
    createReadStream(filePath).pipe(res);
  } catch {
    res.status(404).json({ error: "media_not_found" });
  }
});

function contentTypeForFile(filename: string) {
  const extension = path.extname(filename).toLowerCase();
  switch (extension) {
    case ".mp4":
      return "video/mp4";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}
