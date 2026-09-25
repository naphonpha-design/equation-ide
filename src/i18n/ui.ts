import type { VariableRole } from "../lang/analyze";
import type { SolveFailure } from "../solver/solve";
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
  cannotRunWithErrors: string;
  encoding: string;
  saveAs: string;
  theme: string;
  language: string;
  lossyEncodingWarning: string;
  statusLine: (line: number, column: number) => string;
  variables: string;
  variablesUnavailable: string;
  balance: (unknowns: number, equations: number) => string;
  balanceHint: string;
  loops: (count: number) => string;
  loopLabel: string;
  filterVariables: string;
  columnName: string;
  columnRole: string;
  columnDefined: string;
  columnGuess: string;
  columnUses: string;
  role: (role: VariableRole) => string;
  roleIndependent: string;
  roleState: string;
  results: string;
  notRunYet: string;
  solved: string;
  solveFailedTitle: string;
  solveFailure: (failure: SolveFailure) => string;
  residual: (value: number) => string;
  residualHint: string;
  blocksSolved: (total: number, iterated: number) => string;
  outputTable: string;
  rawConsole: string;
  columnValue: string;
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
  cannotRunWithErrors: "แก้ข้อผิดพลาดในแท็บปัญหาก่อน แล้วจึงรันได้",
  encoding: "การเข้ารหัส",
  saveAs: "บันทึกเป็น",
  theme: "ธีม",
  language: "ภาษา",
  lossyEncodingWarning:
    "ไฟล์มีตัวอักษรที่ TIS-620 เก็บไม่ได้ จะถูกแทนด้วย ? — เลือก UTF-8 แทนถ้าไม่ต้องการ",
  statusLine: (line, column) => `บรรทัด ${line} คอลัมน์ ${column}`,
  variables: "ตัวแปร",
  variablesUnavailable: "แก้ข้อผิดพลาดด้านบนก่อน แล้วแผนผังตัวแปรจะแสดงขึ้นมา",
  balance: (unknowns, equations) =>
    `${unknowns} ตัวแปร / ${equations} สมการ`,
  balanceHint: "ระบบจะแก้ได้ต่อเมื่อจำนวนสมการเท่ากับจำนวนตัวแปรที่ยังไม่รู้ค่า",
  loops: (count) => `วงวน ${count} วง`,
  loopLabel: "วงวน",
  filterVariables: "กรองชื่อ",
  columnName: "ชื่อ",
  columnRole: "ชนิด",
  columnDefined: "บรรทัด",
  columnGuess: "ค่าเดา",
  columnUses: "ถูกใช้",
  role: (role) =>
    ({
      independent: "ตัวแปรอิสระ",
      state: "state",
      algebraic: "พีชคณิต",
      unknown: "ไม่ทราบ",
    })[role],
  roleIndependent: "ตัวแปรอิสระ",
  roleState: "state",
  results: "ผลลัพธ์",
  notRunYet: "ยังไม่ได้รัน — กด ▶ รัน หรือ Ctrl+Enter",
  solved: "แก้สำเร็จ",
  solveFailedTitle: "คำนวณไม่สำเร็จ",
  solveFailure: (failure) => {
    switch (failure.kind) {
      case "unsupported-ode":
        return "โมเดลนี้มีสมการอนุพันธ์ (INTEGRAL) ซึ่งจะรองรับใน M4 — ตอนนี้รันได้เฉพาะระบบพีชคณิต";
      case "unbalanced":
        return "จำนวนสมการกับตัวแปรไม่เท่ากัน ดูรายละเอียดที่แท็บปัญหา";
      case "block-failed":
        return `ลู่เข้าไม่ได้ที่ ${failure.variables.join(", ")} — ลองเปลี่ยนค่าเดา (#) ให้ใกล้คำตอบจริงขึ้น`;
      case "evaluation":
        return `คำนวณนิพจน์ไม่ได้${failure.variable ? ` ที่ '${failure.variable}'` : ""}: ${failure.message}`;
    }
  },
  residual: (value) => `เศษเหลือสูงสุด ${value.toExponential(2)}`,
  residualHint: "ค่ายิ่งใกล้ศูนย์ แปลว่าคำตอบยิ่งเข้ากับทุกสมการ",
  blocksSolved: (total, iterated) =>
    `${total} บล็อก (วนซ้ำ ${iterated})`,
  outputTable: "ตาราง",
  rawConsole: "ข้อความดิบ",
  columnValue: "ค่า",
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
  cannotRunWithErrors: "Fix the errors in the Problems tab first",
  encoding: "Encoding",
  saveAs: "Save as",
  theme: "Theme",
  language: "Language",
  lossyEncodingWarning:
    "This file has characters TIS-620 cannot store; they will be replaced with ?. Choose UTF-8 to keep them.",
  statusLine: (line, column) => `Line ${line}, column ${column}`,
  variables: "Variables",
  variablesUnavailable: "Fix the errors above and the variable map will appear",
  balance: (unknowns, equations) => `${unknowns} unknowns / ${equations} equations`,
  balanceHint:
    "The system is solvable only when there are as many equations as unknowns",
  loops: (count) => `${count} circular group${count === 1 ? "" : "s"}`,
  loopLabel: "Loop",
  filterVariables: "Filter names",
  columnName: "Name",
  columnRole: "Kind",
  columnDefined: "Line",
  columnGuess: "Guess",
  columnUses: "Uses",
  role: (role) =>
    ({
      independent: "independent",
      state: "state",
      algebraic: "algebraic",
      unknown: "unknown",
    })[role],
  roleIndependent: "Independent",
  roleState: "States",
  results: "Results",
  notRunYet: "Not run yet — press ▶ Run, or Ctrl+Enter",
  solved: "Solved",
  solveFailedTitle: "Could not solve",
  solveFailure: (failure) => {
    switch (failure.kind) {
      case "unsupported-ode":
        return "This model has derivative equations (INTEGRAL), which arrive in M4. Algebraic systems run today.";
      case "unbalanced":
        return "There are not as many equations as unknowns; see the Problems tab";
      case "block-failed":
        return `Did not converge on ${failure.variables.join(", ")} — try a starting guess (#) closer to the answer`;
      case "evaluation":
        return `Could not evaluate an expression${failure.variable ? ` at '${failure.variable}'` : ""}: ${failure.message}`;
    }
  },
  residual: (value) => `Largest residual ${value.toExponential(2)}`,
  residualHint: "The closer to zero, the better the answer satisfies every equation",
  blocksSolved: (total, iterated) => `${total} blocks (${iterated} iterated)`,
  outputTable: "Table",
  rawConsole: "Raw text",
  columnValue: "Value",
};

export const UI: Record<Locale, UiStrings> = { th: TH, en: EN };
