const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 10000;

const publicDir = path.join(__dirname, "public");
const uploadsDir = path.join(__dirname, "uploads");
const outputsDir = path.join(__dirname, "outputs");

for (const dir of [uploadsDir, outputsDir]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

app.use(express.static(publicDir));

const upload = multer({
  dest: uploadsDir,
  limits: {
    fileSize: 150 * 1024 * 1024
  }
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "online"
  });
});

app.post("/api/optimize", upload.single("video"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: "No video file received."
    });
  }

  const input = req.file.path;
  const id = crypto.randomBytes(12).toString("hex");
  const output = path.join(outputsDir, `${id}.mp4`);

  /*
   * Quality-preserving settings:
   * - Does NOT force 1080p
   * - Keeps the original resolution
   * - CRF 18 = high quality
   * - ultrafast + 1 thread = lower RAM usage
   */
  const args = [
    "-y",
    "-i", input,

    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-crf", "18",
    "-threads", "1",

    "-c:a", "aac",
    "-b:a", "192k",

    "-movflags", "+faststart",

    output
  ];

  const ffmpeg = spawn("ffmpeg", args);

  let errorOutput = "";

  ffmpeg.stderr.on("data", (data) => {
    // Prevent huge FFmpeg logs from consuming RAM
    if (errorOutput.length < 20000) {
      errorOutput += data.toString();
    }
  });

  ffmpeg.on("error", (err) => {
    try {
      fs.unlinkSync(input);
    } catch {}

    return res.status(500).json({
      success: false,
      error: "FFmpeg could not start.",
      details: err.message
    });
  });

  ffmpeg.on("close", (code) => {
    try {
      fs.unlinkSync(input);
    } catch {}

    if (code !== 0 || !fs.existsSync(output)) {
      try {
        if (fs.existsSync(output)) {
          fs.unlinkSync(output);
        }
      } catch {}

      return res.status(500).json({
        success: false,
       
