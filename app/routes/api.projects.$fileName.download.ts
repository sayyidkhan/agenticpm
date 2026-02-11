import type { Route } from "./+types/api.projects.$fileName.download";
import { getStorage } from "~/lib/storage";

export async function loader({ params }: Route.LoaderArgs) {
  const fileName = params.fileName;
  if (!fileName) {
    return new Response("Missing fileName", { status: 400 });
  }

  const storage = getStorage();
  if (!(await storage.exists(fileName))) {
    return new Response("File not found", { status: 404 });
  }

  const fileBuffer = await storage.read(fileName);
  
  return new Response(new Uint8Array(fileBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(fileBuffer.length),
    },
  });
}
