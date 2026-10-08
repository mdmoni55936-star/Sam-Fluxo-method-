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
  limits: {
    fileSize: 150 * 1024 * 1024
  }
});

app.use(express.static(path.join(__dirname, "public")));

app.post("/api/optimize", upload.single("video"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: "No video uploaded."
    });
  }

  const id = crypto.randomUUID();

  const input = req.file.path;
  const output = path.join(outputDir, `${id}.mp4`);

  // Low-memory FFmpeg settings for Render Free
  const args = [
    "-y",
    "-i", input,

    // Keep processing lighter by limiting output resolution
    "-vf",
    "scale=w=1920:h=1080:force_original_aspect_ratio=decrease",

    "-c:v", "libx264",

    // Very fast = lower CPU/RAM pressure
    "-preset", "ultrafast",

    // Higher CRF = smaller file and lighter processing
    "-crf", "28",

    "-pix_fmt", "yuv420p",

    "-c:a", "aac",
    "-b:a", "128k",

    "-movflags", "+faststart",

    // Use only one FFmpeg thread
    "-threads", "1",

    output
  ];

  console.log("Starting FFmpeg...");
  console.log("Input:", input);
  console.log("Output:", output);

  let ff;

  try {
    ff = spawn("ffmpeg", args);
  } catch (err) {
    fs.rm(input, { force: true }, () => {});

    return res.status(500).json({
      error: "Could not start FFmpeg.",
      details: err.message
    });
  }

  let stderr = "";

  ff.stderr.on("data", (data) => {
    // Don't keep unlimited FFmpeg logs in RAM
    const text = data.toString();

    if (stderr.length < 10000) {
      stderr += text;
    }
  });

  ff.on("error", (err) => {
    console.error("FFmpeg process error:", err);

    fs.rm(input, { force: true }, () => {});
    fs.rm(output, { force: true }, () => {});

    if (!res.headersSent) {
      res.status(500).json({
        error: "FFmpeg could not run.",
        details: err.message
      });
    }
  });

  ff.on("close", (code) => {
    // Delete uploaded source video
    fs.rm(input, { force: true }, () => {});

    if (code !== 0) {
      console.error("FFmpeg failed with code:", code);
      console.error(stderr);

      fs.rm(output, { force: true }, () => {});

      if (!res.headersSent) {
        return res.status(500).json({
          error: "FFmpeg processing failed.",
          details: stderr.slice(-3000)
        });
      }

      return;
    }

    console.log("FFmpeg finished successfully.");

    if (!fs.existsSync(output)) {
      return res.status(500).json({
        error: "Output video was not created."
      });
    }

    return res.json({
      success: true,
      download: `/download/${id}.mp4`
    });
  });
});

app.get("/download/:file", (req, res) => {
  const name = path.basename(req.params.file);
  const file = path.join(outputDir, name);

  if (!fs.existsSync(file)) {
    return res.status(404).json({
      error: "File not found."
    });
  }

  res.download(file, name);
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok"
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
