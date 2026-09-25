import type { Locale } from "./messages";

export interface UiStrings {
  appName: string;
  tagline: string;
  files: string;
  newFile: string;
  openFile: string;
  saveFile: string;
  samples: string;
  rename: string;
  deleteFile: string;
  confirmDelete: (name: string) => string;
  untitled: string;
  problems: string;
  noProblems: string;
  errors: (count: number) => string;
  warnings: (count: number) => string;
  run: string;
  runNotReady: string;
  encoding: string;
  saveAs: string;
  theme: string;
  language: string;
  lossyEncodingWarning: string;
  statusLine: (line: number, column: number) => string;
  variables: string;
  variablesComingSoon: string;
}

const TH: UiStrings = {
  appName: "EQUATRAN IDE",
  tagline: "ตรวจไวยากรณ์ .eqs แบบชี้จุด",
  files: "ไฟล์",
  newFile: "ไฟล์ใหม่",
  openFile: "เปิดไฟล์",
  saveFile: "บันทึกลงเครื่อง",
  samples: "ตัวอย่าง",
  rename: "เปลี่ยนชื่อ",
  deleteFile: "ลบ",
  confirmDelete: (name) => `ลบ "${name}" ออกจากรายการ?`,
  untitled: "ยังไม่ได้ตั้งชื่อ",
  problems: "ปัญหา",
  noProblems: "ไม่พบปัญหา",
  errors: (count) => `${count} ข้อผิดพลาด`,
  warnings: (count) => `${count} คำเตือน`,
  run: "รัน",
  runNotReady: "การคำนวณยังไม่พร้อม — จะมาใน M3",
  encoding: "การเข้ารหัส",
  saveAs: "บันทึกเป็น",
  theme: "ธีม",
  language: "ภาษา",
  lossyEncodingWarning:
    "ไฟล์มีตัวอักษรที่ TIS-620 เก็บไม่ได้ จะถูกแทนด้วย ? — เลือก UTF-8 แทนถ้าไม่ต้องการ",
  statusLine: (line, column) => `บรรทัด ${line} คอลัมน์ ${column}`,
  variables: "ตัวแปร",
  variablesComingSoon: "แผนผังตัวแปรจะมาใน M2",
};

const EN: UiStrings = {
  appName: "EQUATRAN IDE",
  tagline: "Point-and-tell syntax checking for .eqs",
  files: "Files",
  newFile: "New file",
  openFile: "Open file",
  saveFile: "Save to disk",
  samples: "Samples",
  rename: "Rename",
  deleteFile: "Delete",
  confirmDelete: (name) => `Remove "${name}" from the list?`,
  untitled: "Untitled",
  problems: "Problems",
  noProblems: "No problems found",
  errors: (count) => `${count} error${count === 1 ? "" : "s"}`,
  warnings: (count) => `${count} warning${count === 1 ? "" : "s"}`,
  run: "Run",
  runNotReady: "Solving is not wired up yet — it arrives in M3",
  encoding: "Encoding",
  saveAs: "Save as",
  theme: "Theme",
  language: "Language",
  lossyEncodingWarning:
    "This file has characters TIS-620 cannot store; they will be replaced with ?. Choose UTF-8 to keep them.",
  statusLine: (line, column) => `Line ${line}, column ${column}`,
  variables: "Variables",
  variablesComingSoon: "The variable map arrives in M2",
};

export const UI: Record<Locale, UiStrings> = { th: TH, en: EN };
