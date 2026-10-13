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

  // Read index.html once and inject Umami analytics script if env vars are set
  const indexPath = path.resolve(distPath, "index.html");
  let indexHtml = fs.readFileSync(indexPath, "utf-8");

  const umamiUrl = process.env.UMAMI_URL;
  const umamiWebsiteId = process.env.UMAMI_WEBSITE_ID;
  if (umamiUrl && umamiWebsiteId) {
    const umamiScript = `<script defer src="${umamiUrl}/script.js" data-website-id="${umamiWebsiteId}"></script>`;
    indexHtml = indexHtml.replace("</head>", `    ${umamiScript}\n  </head>`);
  }

  // index: false so "/" falls through to the injected index.html below
  app.use(express.static(distPath, { index: false }));

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.type("html").send(indexHtml);
  });
}
