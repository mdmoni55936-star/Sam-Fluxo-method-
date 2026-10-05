const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3000;
const uploadDir = path.join(__dirname, "uploads");
const outputDir = path.join(__dirname, "outputs");
fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 500 * 1024 * 1024 }
});

app.use(express.static(path.join(__dirname, "public")));

app.post("/api/optimize", upload.single("video"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No video uploaded." });

  const id = crypto.randomUUID();
  const input = req.file.path;
  const output = path.join(outputDir, `${id}.mp4`);

  // H.264 + AAC, broadly compatible. CRF 18 preserves high quality.
  // Fast-start makes the MP4 friendlier for web delivery.
  const args = [
    "-y", "-i", input,
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    output
  ];

  const ff = spawn("ffmpeg", args);
  let stderr = "";

  ff.stderr.on("data", d => { stderr += d.toString(); });

  ff.on("close", code => {
    fs.rm(input, { force: true }, () => {});
    if (code !== 0) {
      console.error(stderr);
      return res.status(500).json({ error: "FFmpeg processing failed." });
    }
    res.json({ download: `/download/${id}.mp4` });
  });
});

app.get("/download/:file", (req, res) => {
  const name = path.basename(req.params.file);
  const file = path.join(outputDir, name);
  if (!fs.existsSync(file)) return res.status(404).send("File not found.");
  res.download(file, name);
});

app.listen(PORT, () => {
  console.log(`Running on http://localhost:${PORT}`);
});
