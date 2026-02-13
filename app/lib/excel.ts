import type { ProjectData, Person, Task, TimelineEntry, ProjectMeta } from "~/types/project";
import { parseProjectText, serializeProject } from "~/lib/parser";
import { getStorage } from "~/lib/storage";
import { deleteSessionLock, transferSessionLock } from "~/lib/session-lock";
export { acquireSessionLock, releaseSessionLock, refreshSessionLock } from "~/lib/session-lock";

// Lazy load xlsx to avoid Vite SSR issues (used for READING only)
let xlsxModule: any = null;

async function getXLSX() {
  if (!xlsxModule) {
    const mod = await import("xlsx");
    // xlsx exports as default in ESM, but also as named exports
    xlsxModule = mod.default || mod;
  }
  return xlsxModule as any;
}

// Lazy load exceljs (used for WRITING to avoid XML corruption)
let exceljsModule: any = null;

async function getExcelJS(): Promise<any> {
  if (!exceljsModule) {
    const mod = await import("exceljs");
    exceljsModule = mod.default || mod;
  }
  return exceljsModule;
}

// Helper: add a plain data sheet to an exceljs workbook from an array of objects
function addDataSheet(
  workbook: any,
  sheetName: string,
  headers: string[],
  rows: Record<string, unknown>[],
) {
  const ws = workbook.addWorksheet(sheetName);
  // Add header row
  ws.addRow(headers);
  // Add data rows
  for (const row of rows) {
    ws.addRow(headers.map(h => row[h] ?? ""));
  }
  // Auto-size columns roughly
  ws.columns.forEach((col: any, i: number) => {
    col.width = Math.max(headers[i].length + 2, 12);
  });
  return ws;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "_").trim();
}

// --- TimelineUI Sheet Builder ---

function buildTimelineUIRows(data: ProjectData): Record<string, string | number>[] {
  const rows: Record<string, string | number>[] = [];

  // Sprint config summary
  if (data.sprintConfig) {
    rows.push({
      Label: "[Sprint Config]",
      Description: "",
      "Progress %": "",
      "Planned Start": data.sprintConfig.startDate || "",
      "Planned End": "",
      "Actual Start": "",
      "Actual End": "",
      "Variance (days)": "",
      Status: `Duration: ${data.sprintConfig.duration}wk` +
        (data.sprintConfig.activeSprint ? ` | Active: ${data.sprintConfig.activeSprint}` : ""),
    });
  }

  // One row per timeline entry
  for (const e of data.timeline) {
    let variance: number | "" = "";
    let status = "";
    if (e.endDate && e.actualEndDate) {
      const diff = Math.round(
        (new Date(e.actualEndDate).getTime() - new Date(e.endDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      variance = diff;
      status = diff > 0 ? `${diff}d behind` : diff < 0 ? `${Math.abs(diff)}d ahead` : "On time";
    }

    rows.push({
      Label: e.label,
      Description: e.description || "",
      "Progress %": e.percentage ?? 0,
      "Planned Start": e.startDate || "",
      "Planned End": e.endDate || "",
      "Actual Start": e.actualStartDate || "",
      "Actual End": e.actualEndDate || "",
      "Variance (days)": variance,
      Status: status,
    });
  }

  return rows;
}

// --- Add Gantt Chart on its own sheet ---

function addGanttChartSheet(workbook: any, data: ProjectData): void {
  const entries = data.timeline;
  if (entries.length === 0) return;

  // Gather all dates to determine range
  const allDates: Date[] = [];
  for (const e of entries) {
    if (e.startDate) allDates.push(new Date(e.startDate));
    if (e.endDate) allDates.push(new Date(e.endDate));
    if (e.actualStartDate) allDates.push(new Date(e.actualStartDate));
    if (e.actualEndDate) allDates.push(new Date(e.actualEndDate));
  }
  if (allDates.length < 2) return;

  const ws = workbook.addWorksheet("GanttChart");

  // --- Color palette ---
  const PRIMARY = "FF2563EB";
  const PRIMARY_LIGHT = "FFDBEAFE";
  const PRIMARY_BAR = "FF93C5FD";
  const GREEN = "FF16A34A";
  const GREEN_BAR = "FF22C55E";
  const GREEN_BAR_LIGHT = "FF86EFAC";
  const RED = "FFDC2626";
  const RED_BAR = "FFEF4444";
  const RED_BAR_LIGHT = "FFFCA5A5";
  const BORDER_COLOR = "FFE2E8F0";
  const TEXT_MUTED = "FF64748B";
  const WEEKEND_BG = "FFF8FAFC";
  const TODAY_BG = "FFEFF6FF";
  const TODAY_BORDER = "FF93C5FD";
  const HEADER_BG = "FFF1F5F9";

  const solidFill = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });
  const thinBorder = (argb: string) => ({ style: "thin" as const, color: { argb } });

  const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
  const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
  minDate.setDate(minDate.getDate() - 1);
  maxDate.setDate(maxDate.getDate() + 1);

  // Generate all days
  const days: Date[] = [];
  const dayCursor = new Date(minDate);
  while (dayCursor <= maxDate) {
    days.push(new Date(dayCursor));
    dayCursor.setDate(dayCursor.getDate() + 1);
  }
  const totalDays = days.length;

  const LABEL_COL = 1;
  const DAY_START_COL = 2;
  const SUMMARY_COL = DAY_START_COL + totalDays;

  // Column widths
  ws.getColumn(LABEL_COL).width = 16;
  for (let d = 0; d < totalDays; d++) {
    ws.getColumn(DAY_START_COL + d).width = 4;
  }
  ws.getColumn(SUMMARY_COL).width = 14;

  const getDayIndex = (dateStr: string): number => {
    const d = new Date(dateStr);
    return Math.round((d.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIndex = Math.round((today.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));

  // --- Row 1: Legend ---
  let currentRow = 1;
  const legendRow = ws.getRow(currentRow);
  legendRow.height = 20;
  const legendCell = legendRow.getCell(LABEL_COL);
  legendCell.value = "GANTT CHART";
  legendCell.font = { bold: true, size: 11, color: { argb: PRIMARY } };
  legendCell.alignment = { vertical: "middle" };

  const leg1Col = DAY_START_COL;
  legendRow.getCell(leg1Col).fill = solidFill(PRIMARY_BAR);
  legendRow.getCell(leg1Col + 1).value = "Planned";
  legendRow.getCell(leg1Col + 1).font = { size: 8, color: { argb: TEXT_MUTED } };
  const leg2Col = leg1Col + 4;
  legendRow.getCell(leg2Col).fill = solidFill(GREEN_BAR_LIGHT);
  legendRow.getCell(leg2Col + 1).value = "Remaining";
  legendRow.getCell(leg2Col + 1).font = { size: 8, color: { argb: TEXT_MUTED } };
  const leg3Col = leg2Col + 4;
  legendRow.getCell(leg3Col).fill = solidFill(GREEN_BAR);
  legendRow.getCell(leg3Col + 1).value = "Done";
  legendRow.getCell(leg3Col + 1).font = { size: 8, color: { argb: TEXT_MUTED } };
  const leg4Col = leg3Col + 4;
  legendRow.getCell(leg4Col).fill = solidFill(RED_BAR);
  legendRow.getCell(leg4Col + 1).value = "Behind";
  legendRow.getCell(leg4Col + 1).font = { size: 8, color: { argb: TEXT_MUTED } };

  currentRow++;

  // --- Row 2: Month header (merged cells per month) ---
  const monthRow = ws.getRow(currentRow);
  monthRow.height = 16;
  let monthStart = 0;
  let currentMonth = "";
  for (let d = 0; d <= totalDays; d++) {
    const monthLabel = d < totalDays
      ? days[d].toLocaleDateString("en-US", { month: "short", year: "numeric" })
      : "";
    if (monthLabel !== currentMonth || d === totalDays) {
      if (currentMonth && d > monthStart) {
        const startCol = DAY_START_COL + monthStart;
        const endCol = DAY_START_COL + d - 1;
        if (endCol > startCol) {
          ws.mergeCells(currentRow, startCol, currentRow, endCol);
        }
        const mCell = monthRow.getCell(startCol);
        mCell.value = currentMonth;
        mCell.font = { bold: true, size: 8, color: { argb: TEXT_MUTED } };
        mCell.alignment = { horizontal: "center", vertical: "middle" };
        mCell.fill = solidFill(HEADER_BG);
        // Fill remaining cells in merge with same fill
        for (let c = startCol; c <= endCol; c++) {
          monthRow.getCell(c).fill = solidFill(HEADER_BG);
        }
      }
      monthStart = d;
      currentMonth = monthLabel;
    }
  }
  currentRow++;

  // --- Row 3: Day-of-week header (M, T, W, T, F, S, S) ---
  const dowRow = ws.getRow(currentRow);
  dowRow.height = 14;
  const dayNames = ["S", "M", "T", "W", "T", "F", "S"];
  for (let d = 0; d < totalDays; d++) {
    const col = DAY_START_COL + d;
    const cell = dowRow.getCell(col);
    const isWeekend = days[d].getDay() === 0 || days[d].getDay() === 6;
    const isToday = d === todayIndex;
    cell.value = dayNames[days[d].getDay()];
    cell.font = { size: 7, color: { argb: isToday ? PRIMARY : TEXT_MUTED } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    if (isToday) {
      cell.fill = solidFill(TODAY_BG);
      cell.font = { size: 7, bold: true, color: { argb: PRIMARY } };
    } else if (isWeekend) {
      cell.fill = solidFill(WEEKEND_BG);
    } else {
      cell.fill = solidFill(HEADER_BG);
    }
  }
  currentRow++;

  // --- Row 4: Day number header (1, 2, 3, ...) ---
  const dayNumRow = ws.getRow(currentRow);
  dayNumRow.height = 16;
  for (let d = 0; d < totalDays; d++) {
    const col = DAY_START_COL + d;
    const cell = dayNumRow.getCell(col);
    const isWeekend = days[d].getDay() === 0 || days[d].getDay() === 6;
    const isToday = d === todayIndex;
    cell.value = days[d].getDate();
    cell.font = { size: 8, bold: isToday, color: { argb: isToday ? PRIMARY : isWeekend ? "FFB0B0B0" : "FF1E293B" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { bottom: thinBorder(BORDER_COLOR) };
    if (isToday) {
      cell.fill = solidFill(TODAY_BG);
      cell.border = { bottom: thinBorder(TODAY_BORDER), left: thinBorder(TODAY_BORDER), right: thinBorder(TODAY_BORDER) };
    } else if (isWeekend) {
      cell.fill = solidFill(WEEKEND_BG);
    }
  }
  // Summary header
  dayNumRow.getCell(SUMMARY_COL).value = "Progress";
  dayNumRow.getCell(SUMMARY_COL).font = { bold: true, size: 8, color: { argb: TEXT_MUTED } };
  dayNumRow.getCell(SUMMARY_COL).alignment = { horizontal: "center", vertical: "middle" };
  dayNumRow.getCell(SUMMARY_COL).border = { bottom: thinBorder(BORDER_COLOR) };

  currentRow++;

  // --- Gantt rows (two rows per entry: planned on top, actual on bottom) ---
  for (const entry of entries) {
    const plannedRow = ws.getRow(currentRow);
    const actualRow = ws.getRow(currentRow + 1);
    plannedRow.height = 16;
    actualRow.height = 16;

    // Label spans both rows
    ws.mergeCells(currentRow, LABEL_COL, currentRow + 1, LABEL_COL);
    const labelCell = plannedRow.getCell(LABEL_COL);
    labelCell.value = entry.label;
    labelCell.font = { bold: true, size: 9 };
    labelCell.alignment = { vertical: "middle" };

    // Day cell backgrounds (weekend shading + today highlight + grid lines)
    for (let d = 0; d < totalDays; d++) {
      const col = DAY_START_COL + d;
      const isWeekend = days[d].getDay() === 0 || days[d].getDay() === 6;
      const isToday = d === todayIndex;
      const cellBorder = {
        left: thinBorder(isToday ? TODAY_BORDER : BORDER_COLOR),
        bottom: thinBorder(BORDER_COLOR),
      };
      if (isToday) {
        plannedRow.getCell(col).fill = solidFill(TODAY_BG);
        actualRow.getCell(col).fill = solidFill(TODAY_BG);
        plannedRow.getCell(col).border = cellBorder;
        actualRow.getCell(col).border = { left: thinBorder(TODAY_BORDER), bottom: thinBorder(BORDER_COLOR) };
      } else if (isWeekend) {
        plannedRow.getCell(col).fill = solidFill(WEEKEND_BG);
        actualRow.getCell(col).fill = solidFill(WEEKEND_BG);
        plannedRow.getCell(col).border = cellBorder;
        actualRow.getCell(col).border = { left: thinBorder(BORDER_COLOR), bottom: thinBorder(BORDER_COLOR) };
      } else {
        plannedRow.getCell(col).border = cellBorder;
        actualRow.getCell(col).border = { left: thinBorder(BORDER_COLOR), bottom: thinBorder(BORDER_COLOR) };
      }
    }

    // Planned bar (top row)
    if (entry.startDate && entry.endDate) {
      const startIdx = getDayIndex(entry.startDate);
      const endIdx = getDayIndex(entry.endDate);
      for (let d = startIdx; d <= endIdx && d < totalDays; d++) {
        if (d >= 0) plannedRow.getCell(DAY_START_COL + d).fill = solidFill(PRIMARY_BAR);
      }
    }

    // Actual bar (bottom row)
    if (entry.actualStartDate && entry.actualEndDate) {
      let barColorDone = PRIMARY;
      let barColorRemaining = PRIMARY_LIGHT;
      if (entry.endDate) {
        const variance = Math.round(
          (new Date(entry.actualEndDate).getTime() - new Date(entry.endDate).getTime()) / (1000 * 60 * 60 * 24)
        );
        if (variance > 0) { barColorDone = RED_BAR; barColorRemaining = RED_BAR_LIGHT; }
        else { barColorDone = GREEN_BAR; barColorRemaining = GREEN_BAR_LIGHT; }
      }
      const startIdx = getDayIndex(entry.actualStartDate);
      const endIdx = getDayIndex(entry.actualEndDate);
      const barLen = endIdx - startIdx + 1;
      const progress = entry.percentage ?? 0;
      const doneCols = Math.round(barLen * (progress / 100));
      for (let d = startIdx; d <= endIdx && d < totalDays; d++) {
        if (d >= 0) actualRow.getCell(DAY_START_COL + d).fill = solidFill(barColorRemaining);
      }
      for (let d = startIdx; d < startIdx + doneCols && d < totalDays; d++) {
        if (d >= 0) actualRow.getCell(DAY_START_COL + d).fill = solidFill(barColorDone);
      }
    } else if (entry.startDate && entry.endDate && (entry.percentage ?? 0) > 0) {
      const startIdx = getDayIndex(entry.startDate);
      const endIdx = getDayIndex(entry.endDate);
      const barLen = endIdx - startIdx + 1;
      const progressCols = Math.round(barLen * ((entry.percentage ?? 0) / 100));
      for (let d = startIdx; d < startIdx + progressCols && d < totalDays; d++) {
        if (d >= 0) actualRow.getCell(DAY_START_COL + d).fill = solidFill(PRIMARY);
      }
    }

    // Summary column spans both rows
    ws.mergeCells(currentRow, SUMMARY_COL, currentRow + 1, SUMMARY_COL);
    const progress = entry.percentage ?? 0;
    let summaryText = `${progress}%`;
    let summaryColor = PRIMARY;
    if (entry.endDate && entry.actualEndDate) {
      const variance = Math.round(
        (new Date(entry.actualEndDate).getTime() - new Date(entry.endDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (variance > 0) { summaryText += ` +${variance}d`; summaryColor = RED; }
      else if (variance < 0) { summaryText += ` ${variance}d`; summaryColor = GREEN; }
      else { summaryText += " on time"; summaryColor = GREEN; }
    }
    const summaryCell = plannedRow.getCell(SUMMARY_COL);
    summaryCell.value = summaryText;
    summaryCell.font = { bold: true, size: 9, color: { argb: summaryColor } };
    summaryCell.alignment = { horizontal: "center", vertical: "middle" };
    summaryCell.border = { bottom: thinBorder(BORDER_COLOR) };

    currentRow += 2;
  }

  // Freeze panes: freeze label column + header rows
  ws.views = [{ state: "frozen" as const, xSplit: 1, ySplit: currentRow - entries.length * 2 - 1 + 1 }];
}

// --- Add styled TimelineUI sheet (data table only) ---

function addStyledTimelineUISheet(workbook: any, data: ProjectData): void {
  const tableRows = buildTimelineUIRows(data);
  if (tableRows.length === 0) return;

  const ws = workbook.addWorksheet("TimelineUI");

  // --- Color palette ---
  const PRIMARY = "FF2563EB";
  const PRIMARY_LIGHT = "FFDBEAFE";
  const MUTED_BG = "FFF1F5F9";
  const GREEN = "FF16A34A";
  const GREEN_BG = "FFDCFCE7";
  const RED = "FFDC2626";
  const RED_BG = "FFFEE2E2";
  const HEADER_FG = "FFFFFFFF";
  const BORDER_COLOR = "FFE2E8F0";
  const TEXT_MUTED = "FF64748B";
  const WHITE = "FFFFFFFF";

  const thinBorder = { style: "thin" as const, color: { argb: BORDER_COLOR } };
  const allBorders = {
    top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder,
  };
  const solidFill = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });

  const headers = ["Label", "Description", "Progress %", "Planned Start", "Planned End", "Actual Start", "Actual End", "Variance (days)", "Status"];
  const colWidths = [18, 38, 12, 14, 14, 14, 14, 16, 22];

  // Set column widths
  for (let i = 0; i < headers.length; i++) {
    ws.getColumn(i + 1).width = colWidths[i];
  }

  // Header row
  const headerRow = ws.getRow(1);
  headerRow.height = 28;
  for (let i = 0; i < headers.length; i++) {
    const cell = headerRow.getCell(i + 1);
    cell.value = headers[i];
    cell.font = { bold: true, color: { argb: HEADER_FG }, size: 11 };
    cell.fill = solidFill(PRIMARY);
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = allBorders;
  }

  // Data rows
  for (let i = 0; i < tableRows.length; i++) {
    const rowData = tableRows[i];
    const r = 2 + i;
    const row = ws.getRow(r);

    for (let j = 0; j < headers.length; j++) {
      row.getCell(j + 1).value = rowData[headers[j]] ?? "";
    }

    const labelValue = String(rowData.Label || "");
    const isConfigRow = labelValue === "[Sprint Config]";
    const stripeBg = (i % 2 === 0) ? MUTED_BG : WHITE;

    for (let j = 0; j < headers.length; j++) {
      const cell = row.getCell(j + 1);
      cell.border = allBorders;
      cell.alignment = { vertical: "middle" };
      if (isConfigRow) {
        cell.fill = solidFill(PRIMARY_LIGHT);
        cell.font = { italic: true, color: { argb: TEXT_MUTED }, size: 10 };
      } else {
        cell.fill = solidFill(stripeBg);
        cell.font = { size: 10 };
      }
    }

    if (isConfigRow) {
      row.getCell(1).font = { bold: true, italic: true, color: { argb: PRIMARY }, size: 10 };
      row.height = 22;
      continue;
    }

    row.getCell(1).font = { bold: true, size: 10 };

    // Progress %
    const progressCell = row.getCell(3);
    const progressVal = typeof rowData["Progress %"] === "number" ? rowData["Progress %"] : 0;
    if (progressVal === 100) {
      progressCell.fill = solidFill(GREEN_BG);
      progressCell.font = { bold: true, color: { argb: GREEN }, size: 10 };
    } else if (progressVal > 0) {
      progressCell.fill = solidFill(PRIMARY_LIGHT);
      progressCell.font = { bold: true, color: { argb: PRIMARY }, size: 10 };
    }
    progressCell.alignment = { vertical: "middle", horizontal: "center" };

    // Variance
    const varianceCell = row.getCell(8);
    const varianceVal = typeof rowData["Variance (days)"] === "number" ? rowData["Variance (days)"] : null;
    if (varianceVal !== null) {
      if (varianceVal > 0) {
        varianceCell.fill = solidFill(RED_BG);
        varianceCell.font = { bold: true, color: { argb: RED }, size: 10 };
      } else if (varianceVal < 0) {
        varianceCell.fill = solidFill(GREEN_BG);
        varianceCell.font = { bold: true, color: { argb: GREEN }, size: 10 };
      }
      varianceCell.alignment = { vertical: "middle", horizontal: "center" };
    }

    // Status
    const statusCell = row.getCell(9);
    const statusVal = String(rowData.Status || "").toLowerCase();
    if (statusVal.includes("behind")) {
      statusCell.fill = solidFill(RED_BG);
      statusCell.font = { bold: true, color: { argb: RED }, size: 10 };
    } else if (statusVal.includes("ahead") || statusVal === "on time") {
      statusCell.fill = solidFill(GREEN_BG);
      statusCell.font = { bold: true, color: { argb: GREEN }, size: 10 };
    }
    statusCell.alignment = { vertical: "middle", horizontal: "center" };

    // Date columns
    for (let c = 4; c <= 7; c++) {
      const dateCell = row.getCell(c);
      dateCell.alignment = { vertical: "middle", horizontal: "center" };
      dateCell.font = { size: 10, color: { argb: TEXT_MUTED } };
    }

    row.height = 22;
  }
}

// --- Project Listing ---

export async function listProjects(): Promise<ProjectMeta[]> {
  const storage = getStorage();
  const allFiles = await storage.list();
  const files = allFiles.filter((f: string) => f.endsWith(".xlsx"));
  const xlsx = await getXLSX();
  const results: ProjectMeta[] = [];
  for (const fileName of files) {
    const name = fileName.replace(/\.xlsx$/, "");
    try {
      const buffer = await storage.read(fileName);
      const workbook = xlsx.read(buffer, { type: "buffer" });
      const metaSheet = workbook.Sheets["Metadata"];
      if (metaSheet) {
        // @ts-expect-error - xlsx is dynamically loaded but properly typed at runtime
        const data = xlsx.utils.sheet_to_json<Record<string, string>>(metaSheet);
        const meta = data[0];
        results.push({
          name: meta?.Name || name,
          fileName,
          createdAt: meta?.CreatedAt || new Date().toISOString(),
          updatedAt: meta?.UpdatedAt || new Date().toISOString(),
        });
        continue;
      }
    } catch {
      // fallback
    }
    results.push({
      name,
      fileName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  return results;
}

// --- Read Project ---

export async function readProject(fileName: string): Promise<{ meta: ProjectMeta; data: ProjectData; canonicalText: string } | null> {
  const storage = getStorage();
  if (!(await storage.exists(fileName))) {
    return null;
  }

  try {
    const xlsx = await getXLSX();
    const buffer = await storage.read(fileName);
    const workbook = xlsx.read(buffer, { type: "buffer" });
    const name = fileName.replace(/\.xlsx$/, "");

    // Read metadata
    let meta: ProjectMeta = {
      name,
      fileName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const metaSheet = workbook.Sheets["Metadata"];
    if (metaSheet) {
      // @ts-expect-error - xlsx is dynamically loaded but properly typed at runtime
      const metaRows = xlsx.utils.sheet_to_json<Record<string, string>>(metaSheet);
      if (metaRows[0]) {
        meta.name = metaRows[0].Name || name;
        meta.createdAt = metaRows[0].CreatedAt || meta.createdAt;
        meta.updatedAt = metaRows[0].UpdatedAt || meta.updatedAt;
      }
    }

    // Read Source sheet (canonical text)
    let canonicalText = "";
    const sourceSheet = workbook.Sheets["Source"];
    if (sourceSheet) {
      // @ts-expect-error - xlsx is dynamically loaded but properly typed at runtime
      const sourceRows = xlsx.utils.sheet_to_json<Record<string, string>>(sourceSheet, { header: 1 });
      canonicalText = sourceRows.map((row: unknown) => (row as string[])[0] || "").join("\n");
    }

    // Read structured data from sheets
    const data: ProjectData = { title: meta.name, people: [], timeline: [], tasks: [] };

    // People sheet
    const peopleSheet = workbook.Sheets["People"];
    if (peopleSheet) {
      // @ts-expect-error - xlsx is dynamically loaded but properly typed at runtime
      const rows = xlsx.utils.sheet_to_json<Record<string, string>>(peopleSheet);
      data.people = rows.map((row: Record<string, string>) => ({
        name: row.Name || "",
        responsibilities: (row.Responsibilities || "").split(",").map((r: string) => r.trim()).filter(Boolean),
      }));
    }

    // Tasks sheet
    const tasksSheet = workbook.Sheets["Tasks"];
    if (tasksSheet) {
      // @ts-expect-error - xlsx is dynamically loaded but properly typed at runtime
      const rows = xlsx.utils.sheet_to_json<Record<string, string>>(tasksSheet);
      data.tasks = rows.map((row: Record<string, string>) => ({
        title: row.Title || "",
        assignee: row.Assignee || null,
        status: (row.Status as Task["status"]) || "todo",
        dependencies: [],
        sprint: row.Sprint || undefined,
        remarks: row.Remarks || undefined,
      }));
    }

    // Timeline sheet
    const timelineSheet = workbook.Sheets["Timeline"];
    if (timelineSheet) {
      // @ts-expect-error - xlsx is dynamically loaded but properly typed at runtime
      const rows = xlsx.utils.sheet_to_json<Record<string, string>>(timelineSheet);
      data.timeline = rows.map((row: Record<string, string>) => ({
        label: row.Label || "",
        description: row.Description || "",
        percentage: row.Percentage ? parseInt(row.Percentage, 10) : undefined,
        startDate: row.StartDate || undefined,
        endDate: row.EndDate || undefined,
        actualStartDate: row.ActualStartDate || undefined,
        actualEndDate: row.ActualEndDate || undefined,
      }));
    }

    // NorthStars sheet (per-person-per-sprint goals)
    const northStarsSheet = workbook.Sheets["NorthStars"];
    if (northStarsSheet) {
      // @ts-expect-error - xlsx is dynamically loaded but properly typed at runtime
      const nsRows = xlsx.utils.sheet_to_json<Record<string, string>>(northStarsSheet);
      for (const nsRow of nsRows) {
        const entry = data.timeline.find(t => t.label === nsRow.Sprint);
        if (entry) {
          if (!entry.northStars) entry.northStars = [];
          entry.northStars.push({ person: nsRow.Person || "", goal: nsRow.Goal || "" });
        }
      }
    }

    // Sprint Config sheet
    const sprintSheet = workbook.Sheets["SprintConfig"];
    if (sprintSheet) {
      // @ts-expect-error - xlsx is dynamically loaded but properly typed at runtime
      const rows = xlsx.utils.sheet_to_json<Record<string, string>>(sprintSheet);
      if (rows[0]) {
        data.sprintConfig = {
          duration: rows[0].Duration ? parseInt(rows[0].Duration, 10) : 2,
          startDate: rows[0].StartDate || undefined,
        };
      }
    }

    // Info sheet (markdown stored line-by-line like Source)
    const infoSheet = workbook.Sheets["Info"];
    if (infoSheet) {
      // @ts-expect-error - xlsx is dynamically loaded but properly typed at runtime
      const infoRows = xlsx.utils.sheet_to_json<Record<string, string>>(infoSheet, { header: 1 });
      data.info = infoRows.map((row: unknown) => (row as string[])[0] || "").join("\n");
    }

    // If no canonical text but we have structured data, serialize it
    if (!canonicalText.trim() && (data.people.length || data.tasks.length || data.timeline.length)) {
      canonicalText = serializeProject(data);
    }

    // If we have canonical text, always parse it as source of truth
    // This ensures remarks and other fields are properly extracted from markdown format
    if (canonicalText.trim()) {
      const parsed = parseProjectText(canonicalText);
      data.title = parsed.title || data.title;
      data.people = parsed.people;
      data.tasks = parsed.tasks;
      data.timeline = parsed.timeline;
      data.sprintConfig = parsed.sprintConfig;
      data.currentSprint = parsed.currentSprint;
    }

    return { meta, data, canonicalText };
  } catch (err) {
    console.error(`Failed to read project ${fileName}:`, err);
    return null;
  }
}

// --- Write Project (full) ---

export async function writeProject(
  fileName: string,
  data: ProjectData,
  canonicalText: string,
  projectName?: string
): Promise<ProjectMeta> {
  const storage = getStorage();
  const ExcelJS = await getExcelJS();

  const now = new Date().toISOString();
  let createdAt = now;

  // Preserve createdAt if file exists (read with SheetJS)
  if (await storage.exists(fileName)) {
    try {
      const xlsx = await getXLSX();
      const existingBuffer = await storage.read(fileName);
      const existing = xlsx.read(existingBuffer, { type: "buffer" });
      const metaSheet = existing.Sheets["Metadata"];
      if (metaSheet) {
        // @ts-expect-error - xlsx is dynamically loaded but properly typed at runtime
        const rows = xlsx.utils.sheet_to_json<Record<string, string>>(metaSheet);
        if (rows[0]?.CreatedAt) createdAt = rows[0].CreatedAt;
      }
    } catch {
      // ignore
    }
  }

  const name = projectName || data.title || fileName.replace(/\.xlsx$/, "");
  const workbook = new ExcelJS.Workbook();

  // Metadata sheet
  addDataSheet(workbook, "Metadata",
    ["Name", "CreatedAt", "UpdatedAt"],
    [{ Name: name, CreatedAt: createdAt, UpdatedAt: now }],
  );

  // Source sheet (canonical text — one line per row)
  const sourceWs = workbook.addWorksheet("Source");
  const sourceLines = canonicalText.split("\n");
  for (const line of sourceLines) {
    sourceWs.addRow([line]);
  }
  sourceWs.getColumn(1).width = 120;

  // People sheet
  addDataSheet(workbook, "People",
    ["Name", "Responsibilities"],
    data.people.map((p) => ({
      Name: p.name,
      Responsibilities: p.responsibilities.join(", "),
    })),
  );

  // Tasks sheet
  addDataSheet(workbook, "Tasks",
    ["Title", "Assignee", "Status", "Sprint", "Remarks"],
    data.tasks.map((t) => ({
      Title: t.title,
      Assignee: t.assignee || "",
      Status: t.status,
      Sprint: t.sprint || "",
      Remarks: t.remarks || "",
    })),
  );

  // Timeline sheet
  addDataSheet(workbook, "Timeline",
    ["Label", "Description", "Percentage", "StartDate", "EndDate", "ActualStartDate", "ActualEndDate"],
    data.timeline.map((e) => ({
      Label: e.label,
      Description: e.description,
      Percentage: e.percentage ?? "",
      StartDate: e.startDate || "",
      EndDate: e.endDate || "",
      ActualStartDate: e.actualStartDate || "",
      ActualEndDate: e.actualEndDate || "",
    })),
  );

  // NorthStars sheet (per-person-per-sprint goals)
  const northStarRows: Record<string, string>[] = [];
  for (const e of data.timeline) {
    if (e.northStars) {
      for (const ns of e.northStars) {
        northStarRows.push({ Sprint: e.label, Person: ns.person, Goal: ns.goal });
      }
    }
  }
  if (northStarRows.length > 0) {
    addDataSheet(workbook, "NorthStars", ["Sprint", "Person", "Goal"], northStarRows);
  }

  // Sprint Config sheet
  if (data.sprintConfig) {
    addDataSheet(workbook, "SprintConfig",
      ["Duration", "StartDate"],
      [{ Duration: data.sprintConfig.duration, StartDate: data.sprintConfig.startDate || "" }],
    );
  }

  // Info sheet (markdown stored line-by-line like Source)
  if (data.info !== undefined) {
    const infoWs = workbook.addWorksheet("Info");
    const infoLines = (data.info || "").split("\n");
    for (const line of infoLines) {
      infoWs.addRow([line]);
    }
    infoWs.getColumn(1).width = 120;
  }

  // GanttChart sheet (cell-based Gantt visualization)
  addGanttChartSheet(workbook, data);

  // TimelineUI sheet (styled data table)
  addStyledTimelineUISheet(workbook, data);

  // Ensure .xlsx extension
  const actualFileName = fileName.endsWith('.xlsx') ? fileName : fileName.replace(/\.\w+$/, '.xlsx');
  const buffer = await workbook.xlsx.writeBuffer();
  await storage.write(actualFileName, Buffer.from(buffer));

  return { name, fileName: actualFileName, createdAt, updatedAt: now };
}

// --- Update specific sheets only ---

export async function updateProjectSheets(
  fileName: string,
  changes: {
    source?: string;
    people?: Person[];
    tasks?: Task[];
    timeline?: TimelineEntry[];
    info?: string;
    projectName?: string;
    sprintConfig?: import("~/types/project").SprintConfig;
  }
): Promise<ProjectMeta | null> {
  const storage = getStorage();
  if (!(await storage.exists(fileName))) return null;

  try {
    // --- Read existing data with SheetJS ---
    const xlsx = await getXLSX();
    const existingBuffer = await storage.read(fileName);
    const existing = xlsx.read(existingBuffer, { type: "buffer" });
    const now = new Date().toISOString();

    // Read metadata
    let meta: ProjectMeta = {
      name: fileName.replace(/\.xlsx$/, ""),
      fileName,
      createdAt: now,
      updatedAt: now,
    };
    const existingMeta = existing.Sheets["Metadata"];
    if (existingMeta) {
      // @ts-expect-error - xlsx is dynamically loaded but properly typed at runtime
      const rows = xlsx.utils.sheet_to_json<Record<string, string>>(existingMeta);
      if (rows[0]) {
        meta.name = changes.projectName || rows[0].Name || meta.name;
        meta.createdAt = rows[0].CreatedAt || meta.createdAt;
      }
    }

    // Read existing source text
    let canonicalText = "";
    const sourceSheet = existing.Sheets["Source"];
    if (sourceSheet) {
      // @ts-expect-error - xlsx is dynamically loaded but properly typed at runtime
      const sourceRows = xlsx.utils.sheet_to_json<Record<string, string>>(sourceSheet, { header: 1 });
      canonicalText = sourceRows.map((row: unknown) => (row as string[])[0] || "").join("\n");
    }

    // Read existing people
    let people: Person[] = [];
    const peopleSheet = existing.Sheets["People"];
    if (peopleSheet) {
      // @ts-expect-error - xlsx is dynamically loaded but properly typed at runtime
      const rows = xlsx.utils.sheet_to_json<Record<string, string>>(peopleSheet);
      people = rows.map((r: Record<string, string>) => ({
        name: r.Name || "",
        responsibilities: (r.Responsibilities || "").split(",").map((s: string) => s.trim()).filter(Boolean),
      }));
    }

    // Read existing tasks
    let tasks: Task[] = [];
    const tasksSheet = existing.Sheets["Tasks"];
    if (tasksSheet) {
      // @ts-expect-error - xlsx is dynamically loaded but properly typed at runtime
      const rows = xlsx.utils.sheet_to_json<Record<string, string>>(tasksSheet);
      tasks = rows.map((r: Record<string, string>) => ({
        title: r.Title || "",
        assignee: r.Assignee || null,
        status: (r.Status as Task["status"]) || "todo",
        dependencies: [],
        sprint: r.Sprint || undefined,
        remarks: r.Remarks || undefined,
      }));
    }

    // Read existing timeline
    let timeline: TimelineEntry[] = [];
    const timelineSheet = existing.Sheets["Timeline"];
    if (timelineSheet) {
      // @ts-expect-error - xlsx is dynamically loaded but properly typed at runtime
      const rows = xlsx.utils.sheet_to_json<Record<string, string>>(timelineSheet);
      timeline = rows.map((r: Record<string, string>) => ({
        label: r.Label || "",
        description: r.Description || "",
        percentage: r.Percentage ? parseInt(r.Percentage, 10) : undefined,
        startDate: r.StartDate || undefined,
        endDate: r.EndDate || undefined,
        actualStartDate: r.ActualStartDate || undefined,
        actualEndDate: r.ActualEndDate || undefined,
      }));
    }

    // Read existing NorthStars
    const existingNSSheet = existing.Sheets["NorthStars"];
    if (existingNSSheet) {
      // @ts-expect-error - xlsx is dynamically loaded but properly typed at runtime
      const nsRows = xlsx.utils.sheet_to_json<Record<string, string>>(existingNSSheet);
      for (const nsRow of nsRows) {
        const entry = timeline.find(t => t.label === nsRow.Sprint);
        if (entry) {
          if (!entry.northStars) entry.northStars = [];
          entry.northStars.push({ person: nsRow.Person || "", goal: nsRow.Goal || "" });
        }
      }
    }

    // Read existing sprint config
    let sprintConfig: import("~/types/project").SprintConfig | undefined;
    const scSheet = existing.Sheets["SprintConfig"];
    if (scSheet) {
      // @ts-expect-error - xlsx is dynamically loaded but properly typed at runtime
      const rows = xlsx.utils.sheet_to_json<Record<string, string>>(scSheet);
      if (rows[0]) {
        sprintConfig = {
          duration: rows[0].Duration ? parseInt(rows[0].Duration, 10) : 2,
          startDate: rows[0].StartDate || undefined,
        };
      }
    }

    // Read existing info
    let info: string | undefined;
    const existingInfoSheet = existing.Sheets["Info"];
    if (existingInfoSheet) {
      // @ts-expect-error - xlsx is dynamically loaded but properly typed at runtime
      const infoRows = xlsx.utils.sheet_to_json<Record<string, string>>(existingInfoSheet, { header: 1 });
      info = infoRows.map((row: unknown) => (row as string[])[0] || "").join("\n");
    }

    // --- Apply changes ---
    if (changes.source !== undefined) canonicalText = changes.source;
    if (changes.people !== undefined) people = changes.people;
    if (changes.tasks !== undefined) tasks = changes.tasks;
    if (changes.timeline !== undefined) timeline = changes.timeline;
    if (changes.sprintConfig !== undefined) sprintConfig = changes.sprintConfig;
    if (changes.info !== undefined) info = changes.info;

    // --- Write fresh file with exceljs ---
    const data: ProjectData = {
      title: meta.name,
      people,
      tasks,
      timeline,
      info,
      sprintConfig,
    };

    await writeProject(fileName, data, canonicalText, meta.name);

    meta.updatedAt = now;
    return meta;
  } catch (err) {
    console.error(`Failed to update project ${fileName}:`, err);
    return null;
  }
}

// --- Create New Project ---

export async function createProject(name: string): Promise<ProjectMeta> {
  const storage = getStorage();
  const safeName = sanitizeFileName(name);
  let fileName = `${safeName}.xlsx`;

  // Avoid name collision
  let counter = 1;
  while (await storage.exists(fileName)) {
    fileName = `${safeName} (${counter}).xlsx`;
    counter++;
  }

  const emptyData: ProjectData = { title: name, people: [], timeline: [], tasks: [] };
  return writeProject(fileName, emptyData, "", name);
}

// --- Delete Project ---

export async function deleteProject(fileName: string): Promise<boolean> {
  const storage = getStorage();
  const removed = await storage.remove(fileName);
  if (removed) {
    deleteSessionLock(fileName);
  }
  return removed;
}

// --- Rename Project ---

export async function renameProject(oldFileName: string, newName: string): Promise<ProjectMeta | null> {
  const storage = getStorage();
  if (!(await storage.exists(oldFileName))) return null;

  const safeName = sanitizeFileName(newName);
  let newFileName = `${safeName}.xlsx`;

  // Avoid name collision (unless it's the same file)
  if (newFileName !== oldFileName) {
    let counter = 1;
    while (await storage.exists(newFileName)) {
      newFileName = `${safeName} (${counter}).xlsx`;
      counter++;
    }
    await storage.rename(oldFileName, newFileName);
  }

  // Update metadata inside the file
  const result = await updateProjectSheets(newFileName, { projectName: newName });

  // Transfer session lock
  if (oldFileName !== newFileName) {
    transferSessionLock(oldFileName, newFileName);
  }

  return result;
}
