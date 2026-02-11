import * as fs from "node:fs";
import * as path from "node:path";
import type { Route } from "./+types/api.projects.upload";

const STORAGE_DIR = path.resolve(process.cwd(), "storage");

function ensureStorageDir() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

function getUniqueFileName(baseName: string): string {
  ensureStorageDir();
  const ext = path.extname(baseName);
  const nameWithoutExt = path.basename(baseName, ext);
  
  const filePath = path.join(STORAGE_DIR, baseName);
  
  // If file doesn't exist, return original name
  if (!fs.existsSync(filePath)) {
    return baseName;
  }
  
  // File exists, find a unique name
  let counter = 2;
  let candidate = `${nameWithoutExt} (${counter})${ext}`;
  
  while (fs.existsSync(path.join(STORAGE_DIR, candidate))) {
    counter++;
    candidate = `${nameWithoutExt} (${counter})${ext}`;
  }
  
  return candidate;
}

interface ValidationResult {
  valid: boolean;
  tabs: {
    name: string;
    status: "ok" | "warning" | "error" | "missing";
    message: string;
  }[];
  fileName: string;
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    const fileName = file.name;
    if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".xls")) {
      return Response.json({
        error: "Invalid file type. Please upload an Excel file (.xlsx or .xls)",
      }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Load xlsx dynamically
    const mod = await import("xlsx");
    const xlsx = mod.default || mod;

    // Parse the workbook
    const workbook = xlsx.read(buffer, { type: "buffer" });
    const sheetNames = workbook.SheetNames;

    const validation: ValidationResult = {
      valid: true,
      tabs: [],
      fileName: "",
    };

    // Validate Source sheet
    if (sheetNames.includes("Source")) {
      const sheet = workbook.Sheets["Source"];
      
      // Read the sheet as array format to check actual data
      const sourceRows = xlsx.utils.sheet_to_json<Record<string, string>>(sheet, { header: 1 });
      
      // Count rows that have any content (not just empty arrays)
      const contentRows = sourceRows.filter((row: any) => {
        if (Array.isArray(row)) {
          return row.some((cell: any) => cell && String(cell).trim().length > 0);
        }
        return false;
      });
      
      // If we have content rows (excluding header), it's valid
      if (contentRows.length > 0) {
        validation.tabs.push({ name: "Source", status: "ok", message: `Valid source content found (${contentRows.length} lines)` });
      } else if (sourceRows.length > 0) {
        validation.tabs.push({ name: "Source", status: "warning", message: "Source sheet exists but is empty" });
      } else {
        validation.tabs.push({ name: "Source", status: "warning", message: "Source sheet is empty" });
      }
    } else {
      validation.tabs.push({ name: "Source", status: "missing", message: "Source sheet not found - will be created empty" });
    }

    // Validate People sheet
    if (sheetNames.includes("People")) {
      const sheet = workbook.Sheets["People"];
      const rows = xlsx.utils.sheet_to_json<Record<string, string>>(sheet);
      if (rows.length > 0) {
        const hasName = rows.every((r: Record<string, string>) => r.Name);
        if (hasName) {
          validation.tabs.push({ name: "People", status: "ok", message: `${rows.length} team member(s) found` });
        } else {
          validation.tabs.push({ name: "People", status: "warning", message: "Some rows missing 'Name' column" });
        }
      } else {
        validation.tabs.push({ name: "People", status: "warning", message: "People sheet is empty" });
      }
    } else {
      validation.tabs.push({ name: "People", status: "missing", message: "People sheet not found - will be created empty" });
    }

    // Validate Tasks sheet
    if (sheetNames.includes("Tasks")) {
      const sheet = workbook.Sheets["Tasks"];
      const rows = xlsx.utils.sheet_to_json<Record<string, string>>(sheet);
      if (rows.length > 0) {
        const hasTitle = rows.every((r: Record<string, string>) => r.Title);
        if (hasTitle) {
          validation.tabs.push({ name: "Tasks", status: "ok", message: `${rows.length} task(s) found` });
        } else {
          validation.tabs.push({ name: "Tasks", status: "warning", message: "Some rows missing 'Title' column" });
        }
      } else {
        validation.tabs.push({ name: "Tasks", status: "warning", message: "Tasks sheet is empty" });
      }
    } else {
      validation.tabs.push({ name: "Tasks", status: "missing", message: "Tasks sheet not found - will be created empty" });
    }

    // Validate Timeline sheet
    if (sheetNames.includes("Timeline")) {
      const sheet = workbook.Sheets["Timeline"];
      const rows = xlsx.utils.sheet_to_json<Record<string, string>>(sheet);
      if (rows.length > 0) {
        const hasLabel = rows.every((r: Record<string, string>) => r.Label);
        if (hasLabel) {
          validation.tabs.push({ name: "Timeline", status: "ok", message: `${rows.length} timeline entry(ies) found` });
        } else {
          validation.tabs.push({ name: "Timeline", status: "warning", message: "Some rows missing 'Label' column" });
        }
      } else {
        validation.tabs.push({ name: "Timeline", status: "warning", message: "Timeline sheet is empty" });
      }
    } else {
      validation.tabs.push({ name: "Timeline", status: "missing", message: "Timeline sheet not found - will be created empty" });
    }

    // Validate SprintConfig sheet
    if (sheetNames.includes("SprintConfig")) {
      validation.tabs.push({ name: "SprintConfig", status: "ok", message: "Sprint configuration found" });
    } else {
      validation.tabs.push({ name: "SprintConfig", status: "missing", message: "SprintConfig sheet not found - defaults will be used" });
    }

    // Validate Metadata sheet (if present)
    if (sheetNames.includes("Metadata")) {
      validation.tabs.push({ name: "Metadata", status: "ok", message: "Project metadata found" });
    }

    // Check for unknown sheets
    const knownSheets = ["Source", "People", "Tasks", "Timeline", "SprintConfig", "Metadata", "Meta", "TimelineUI", "GanttChart"];
    const unknownSheets = sheetNames.filter((s: string) => !knownSheets.includes(s));
    if (unknownSheets.length > 0) {
      validation.tabs.push({
        name: "Other",
        status: "warning",
        message: `Unknown sheets found: ${unknownSheets.join(", ")} (will be ignored)`,
      });
    }

    // Check if any critical errors
    const hasError = validation.tabs.some(t => t.status === "error");
    validation.valid = !hasError;

    // Check if this is validation-only or save request
    const saveFile = formData.get("save") === "true";

    if (saveFile && validation.valid) {
      ensureStorageDir();
      
      // Get unique filename
      const uniqueFileName = getUniqueFileName(fileName);
      
      // If filename was changed, also update the project name in metadata
      if (uniqueFileName !== fileName) {
        // Read the workbook to update metadata
        const updatedWorkbook = xlsx.read(buffer, { type: "buffer" });
        
        // Get the project name from metadata and make it unique too
        let projectName = fileName.replace(/\.xlsx$/, "");
        const metaSheet = updatedWorkbook.Sheets["Metadata"];
        if (metaSheet) {
          const metaRows = xlsx.utils.sheet_to_json<Record<string, string>>(metaSheet);
          if (metaRows[0]?.Name) {
            projectName = metaRows[0].Name;
          }
        }
        
        // Make project name unique (same logic as filename)
        const baseProjectName = projectName;
        let counter = 2;
        let uniqueProjectName = `${baseProjectName} (${counter})`;
        
        // Check existing project names
        const existingFiles = fs.readdirSync(STORAGE_DIR).filter((f: string) => f.endsWith(".xlsx"));
        const existingNames = new Set<string>();
        
        for (const existingFile of existingFiles) {
          try {
            const existingPath = path.join(STORAGE_DIR, existingFile);
            const existingWorkbook = xlsx.readFile(existingPath);
            const existingMeta = existingWorkbook.Sheets["Metadata"];
            if (existingMeta) {
              const existingMetaRows = xlsx.utils.sheet_to_json<Record<string, string>>(existingMeta);
              if (existingMetaRows[0]?.Name) {
                existingNames.add(existingMetaRows[0].Name);
              }
            }
          } catch {
            // Ignore errors reading existing files
          }
        }
        
        // Find unique project name
        while (existingNames.has(uniqueProjectName)) {
          counter++;
          uniqueProjectName = `${baseProjectName} (${counter})`;
        }
        
        // Update metadata with unique project name
        const now = new Date().toISOString();
        const metaData = [{ Name: uniqueProjectName, CreatedAt: now, UpdatedAt: now }];
        const newMetaSheet = xlsx.utils.json_to_sheet(metaData);
        updatedWorkbook.Sheets["Metadata"] = newMetaSheet;
        
        // Write the updated workbook
        const updatedBuffer = xlsx.write(updatedWorkbook, { type: "buffer", bookType: "xlsx" });
        const filePath = path.join(STORAGE_DIR, uniqueFileName);
        fs.writeFileSync(filePath, updatedBuffer);
      } else {
        // No filename conflict, save as-is
        const filePath = path.join(STORAGE_DIR, uniqueFileName);
        fs.writeFileSync(filePath, buffer);
      }
      
      validation.fileName = uniqueFileName;
    }

    return Response.json({ validation });
  } catch (err) {
    return Response.json({
      error: err instanceof Error ? err.message : "Failed to process file",
    }, { status: 500 });
  }
}
