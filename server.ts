import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import FormData from "form-data";
import axios from "axios";

dotenv.config();

const app = express();
const PORT = 3000;

// Ensure local upload directory exists under working directory securely
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Support parsing of json and rich multi-part forms
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically with correct media streaming range support
app.use("/uploads", express.static(uploadDir));

// Serve or redirect /my-video.mp4 based on local file existence
app.get("/my-video.mp4", (req, res) => {
  const videoPath = path.join(process.cwd(), "my-video.mp4");
  if (fs.existsSync(videoPath)) {
    res.sendFile(videoPath);
  } else {
    // Elegant fallback to a reliable, copyright-free video stream so the client gets a beautiful playback immediately
    res.redirect("https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4");
  }
});

// Serve or redirect /my-logo.jpg based on local file existence
app.get("/my-logo.jpg", (req, res) => {
  const logoPath = path.join(process.cwd(), "my-logo.jpg");
  if (fs.existsSync(logoPath)) {
    res.sendFile(logoPath);
  } else {
    // Elegant fallback to a professional, high-quality female profile image for Nusrat Jahan
    res.redirect("https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200");
  }
});

// Serve manifest.json statically with correct content type
app.get("/manifest.json", (req, res) => {
  const manifestPath = path.join(process.cwd(), "manifest.json");
  if (fs.existsSync(manifestPath)) {
    res.setHeader("Content-Type", "application/manifest+json");
    res.sendFile(manifestPath);
  } else {
    res.status(404).json({ error: "manifest.json not found" });
  }
});

// Serve sw.js statically with correct mime-type and disabled-caching control
app.get("/sw.js", (req, res) => {
  const swPath = path.join(process.cwd(), "sw.js");
  if (fs.existsSync(swPath)) {
    res.setHeader("Content-Type", "application/javascript");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.sendFile(swPath);
  } else {
    res.status(404).json({ error: "sw.js not found" });
  }
});

// Config Multer for local disk storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || ".webm";
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});
const upload = multer({ storage });

// Telegram File Submission API
app.post("/api/upload", upload.single("file"), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No file received" });
    }

    const { userId, sender, fileType } = req.body;
    const clientUserId = userId || "UNKNOWN";
    const senderRole = sender || "client";
    const mediaType = fileType || "document";

    console.log(`[Upload API] Received file ${file.filename} as ${mediaType} from ${clientUserId} (${senderRole})`);

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    // Direct local stream link path (Fully independent & fully streamable)
    const streamUrl = `/uploads/${file.filename}`;

    // If Telegram Token is configured, dispatch the upload to Telegram Bot
    if (botToken && chatId) {
      console.log(`[Telegram] Sending ${file.filename} to Bot...`);
      
      // Determine correct Telegram API method
      let telegramMethod = "sendDocument";
      let fileFieldName = "document";

      if (mediaType === "audio" || mediaType === "voice") {
        telegramMethod = "sendVoice";
        fileFieldName = "voice";
      } else if (mediaType === "image") {
        telegramMethod = "sendPhoto";
        fileFieldName = "photo";
      } else if (mediaType === "video") {
        telegramMethod = "sendVideo";
        fileFieldName = "video";
      }

      // Create Robust Multipart request payload via form-data package streams
      const formData = new FormData();
      formData.append(fileFieldName, fs.createReadStream(file.path), {
        filename: file.originalname,
        contentType: file.mimetype,
      });
      formData.append("chat_id", chatId);
      formData.append(
        "caption",
        `📥 NEW INTERACTIVE FILE RECEIVED\n━━━━━━━━━━━━━━━━━━━━\n👤 User ID: ${clientUserId}\n🎭 Sent by: ${senderRole.toUpperCase()}\n📂 File Type: ${mediaType.toUpperCase()}\n📄 Name: ${file.originalname}\n🕒 Time: ${new Date().toLocaleString()}`
      );

      try {
        const telegramUrl = `https://api.telegram.org/bot${botToken}/${telegramMethod}`;
        const tgResponse = await axios.post(telegramUrl, formData, {
          headers: formData.getHeaders(),
        });

        if (tgResponse.data && tgResponse.data.ok) {
          console.log("[Telegram] Successfully delivered to Bot chat!");
        } else {
          console.error("[Telegram Error Response]:", tgResponse.data);
        }
      } catch (tgErr: any) {
        console.error("[Telegram Connection Error]:", tgErr?.response?.data || tgErr.message);
      }
    } else {
      console.warn("[Telegram Verification Option] TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are not set in the environment. File uploaded locally, skipping telegram routing.");
    }

    // Always respond with the local direct stream url
    return res.json({
      success: true,
      fileUrl: streamUrl,
      fileName: file.originalname,
      mimeType: file.mimetype,
    });
  } catch (error: any) {
    console.error("[Server Error Route]:", error);
    next(error);
  }
});

// Explicit error management middleware to capture Multer file limits or route errors as JSON instead of HTML layout
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("[Express Error Middleware Caught Handled]:", err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Express API routing error matching request",
  });
});

// Setup Vite Development Middleware or Production Client Assets static layer
async function bootServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("[Server Mode] Initializing Vite Middleware (Development Mode)");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("[Server Mode] Hosting Production client build static dist assets");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[System Running] Express fully functional on http://0.0.0.0:${PORT}`);
  });
}

bootServer();
