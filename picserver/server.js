const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 9000;
const DATA_DIR = "/data";

// Serve static files at /pic/
app.use("/pic", express.static(DATA_DIR));

// Upload handler: POST /pic/:subFolder/
app.post("/pic/:subFolder/", (req, res) => {
  const subFolder = req.params.subFolder;
  const destDir = path.join(DATA_DIR, subFolder);

  fs.mkdirSync(destDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: destDir,
    filename: (_, file, cb) => {
      // Use the original filename from the form field
      // The filename comes as "subFolder/cardNo.jpg", extract just the file part
      const originalName = file.originalname;
      const fileName = path.basename(originalName);
      cb(null, fileName);
    },
  });

  const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

  upload.single("image")(req, res, (err) => {
    if (err) {
      console.error("Upload error:", err);
      return res.status(500).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const filePath = `${subFolder}/${req.file.filename}`;
    console.log(`Uploaded: ${filePath}`);
    res.status(200).json({ success: true, path: filePath });
  });
});

app.get("/health", (_, res) => {
  res.status(200).json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`PIC server listening on port ${PORT}`);
});
