import * as fs from "node:fs";
import * as path from "node:path";
import type { Route } from "./+types/api.projects.$fileName.download";

const STORAGE_DIR = path.resolve(process.cwd(), "storage");

export async function loader({ params }: Route.LoaderArgs) {
  const fileName = params.fileName;
  if (!fileName) {
    return new Response("Missing fileName", { status: 400 });
  }

  const filePath = path.join(STORAGE_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    return new Response("File not found", { status: 404 });
  }

  const fileBuffer = fs.readFileSync(filePath);
  
  return new Response(fileBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(fileBuffer.length),
    },
  });
}
