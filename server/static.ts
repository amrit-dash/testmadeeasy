import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath, { index: false, maxAge: "1y" }));

  // fall through to index.html if the file doesn't exist
  app.use((_req, res) => {
    try {
      let indexHtml = fs.readFileSync(path.resolve(distPath, "index.html"), "utf-8");

      const envVars = {
        VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
        VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY,
      };

      const script = `<script>window.ENV = ${JSON.stringify(envVars)};</script>`;
      indexHtml = indexHtml.replace("</head>", `${script}\n</head>`);

      res.set("Content-Type", "text/html");
      res.set("Cache-Control", "no-cache, no-store, must-revalidate");
      res.send(indexHtml);
    } catch (err) {
      console.error("Error serving index.html:", err);
      res.status(500).send("Internal Server Error");
    }
  });
}
