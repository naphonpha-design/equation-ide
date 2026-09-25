import type { Diagnostic, DiagnosticCode } from "../lang/diagnostics";

export type Locale = "th" | "en";

export interface RenderedDiagnostic {
  /** What is wrong. */
  message: string;
  /** How to fix it, when there is concrete advice to give. */
  fix?: string;
}

type Args = Readonly<Record<string, string | number>>;
type Template = (args: Args) => RenderedDiagnostic;

const TOKEN_NAMES: Record<Locale, Record<string, string>> = {
  th: { "<eof>": "จบไฟล์", "<eol>": "จบบรรทัด" },
  en: { "<eof>": "end of file", "<eol>": "end of line" },
};

function describeToken(text: unknown, locale: Locale): string {
  const value = String(text ?? "");
  return TOKEN_NAMES[locale][value] ?? `'${value}'`;
}

function didYouMean(args: Args, locale: Locale): string | undefined {
  if (args.suggestion === undefined) return undefined;
  return locale === "th"
    ? `คุณหมายถึง '${args.suggestion}' ใช่ไหม?`
    : `Did you mean '${args.suggestion}'?`;
}

const THAI: Record<DiagnosticCode, Template> = {
  E001: (a) => ({
    message: `ตัวอักษร '${a.text}' ใช้ในภาษา EQUATRAN ไม่ได้`,
    fix: "ลบทิ้ง หรือถ้าตั้งใจเขียนคอมเมนต์ ให้ขึ้นต้นด้วย //",
  }),
  E002: () => ({
    message: "เลขวิทยาศาสตร์ไม่สมบูรณ์ — หลัง E ต้องมีตัวเลข",
    fix: "เขียนให้ครบ เช่น 5.0E-3 หรือ 1E12",
  }),
  E100: (a) => ({
    message: `เจอ ${describeToken(a.text, "th")} ในตำแหน่งที่ไม่ควรมี`,
    fix: "ตรวจว่าขาดตัวดำเนินการ ( + - * / ) หรือขาดเครื่องหมาย , คั่นหรือเปล่า",
  }),
  E101: (a) => ({
    message: `ต้องมี '${a.expected}' ตรงนี้ แต่เจอ ${describeToken(a.text, "th")}`,
    fix: `เติม '${a.expected}' เข้าไป`,
  }),
  E103: () => ({
    message: "วงเล็บ ( เปิดไว้แต่ไม่ได้ปิด",
    fix: "เติม ) ให้ครบ",
  }),
  E104: (a) => ({
    message: `ต้องมี '${a.expected ?? "]"}' ปิดวงเล็บเหลี่ยม`,
    fix: "รูปแบบคือ [ค่าต่ำสุด,ค่าสูงสุด] เช่น [40,400]",
  }),
  E105: () => ({
    message: "สมการเดียวมีเครื่องหมาย = มากกว่าหนึ่งตัว",
    fix: "แยกเป็นคนละบรรทัด หรือคั่นด้วย ;",
  }),
  E106: (a) => ({
    message: `อ่านคำสั่งนี้ไม่ออก — คาดว่าจะเจอ '=' แต่เจอ ${describeToken(a.text, "th")}`,
    fix: "สมการต้องอยู่ในรูป ชื่อ = นิพจน์ หรือ นิพจน์ = นิพจน์",
  }),
  E107: (a) => ({
    message: `ต้องเป็นชื่อตัวแปร แต่เจอ ${describeToken(a.text, "th")}`,
  }),
  E108: (a) => ({
    message: `ต้องเป็นตัวเลข แต่เจอ ${describeToken(a.text, "th")}`,
  }),
  E109: (a) => ({
    message: `ตัวดำเนินการ '${a.text}' ไม่มีค่าตามหลัง`,
    fix: "เติมตัวเลขหรือชื่อตัวแปรต่อท้าย",
  }),
  E110: (a) => ({
    message: `คำสั่ง RESET ผิดรูปแบบ — เจอ ${describeToken(a.text, "th")}`,
    fix: "รูปแบบคือ RESET ตัวแปร # ค่าเดา [ต่ำสุด,สูงสุด] BY ชื่อสมการ",
  }),
  E111: (a) => ({
    message: `คำสั่ง INTEGRAL ผิดรูปแบบ — เจอ ${describeToken(a.text, "th")}`,
    fix: "รูปแบบคือ INTEGRAL ตัวแปร[เริ่ม,จบ] step ขนาด by วิธี",
  }),
  E112: (a) => ({
    message: `ต้องเป็นรายชื่อตัวแปรคั่นด้วย , แต่เจอ ${describeToken(a.text, "th")}`,
  }),
  E113: (a) => ({
    message: `เจอ '${a.text}' เกินมา ไม่มีวงเล็บเปิดคู่กัน`,
    fix: "ลบทิ้ง หรือเติมวงเล็บเปิดให้ครบ",
  }),
  E200: (a) => ({
    message: `ตัวแปร '${a.name}' ถูกใช้ แต่ไม่มีสมการไหนกำหนดค่าให้`,
    fix: didYouMean(a, "th") ?? "เพิ่มสมการกำหนดค่า เช่น " + a.name + "=...",
  }),
  E201: (a) => ({
    message: `ไม่รู้จักฟังก์ชัน '${a.name}'`,
    fix: didYouMean(a, "th") ?? "ตรวจชื่อฟังก์ชันอีกครั้ง",
  }),
  E202: (a) => ({
    message: `ฟังก์ชัน ${a.name} ต้องการ ${a.expected} อาร์กิวเมนต์ แต่ได้ ${a.actual}`,
  }),
  E203: (a) => ({
    message: `BY ชี้ไปที่ '${a.name}' แต่ไม่มีสมการไหนตั้งชื่อนี้`,
    fix: didYouMean(a, "th") ?? "ตั้งชื่อสมการด้วยรูปแบบ ชื่อ: สมการ",
  }),
  E204: (a) => ({
    message: `ชื่อสมการ '${a.name}' ซ้ำกับบรรทัด ${a.line}`,
    fix: "เปลี่ยนให้ไม่ซ้ำ",
  }),
  E205: (a) => ({
    message: `'${a.name}' ถูกกำหนดค่าไว้แล้วที่บรรทัด ${a.line}`,
    fix: "ถ้าตั้งใจใช้ค่าใหม่ ให้ลบหรือคอมเมนต์อันเก่าออก",
  }),
  E206: (a) => ({
    message: `'${a.name}' กำหนดค่าไว้ แต่ไม่มีสมการไหนใช้`,
    fix: "ลบออก หรือเติมใน OUTPUT ถ้าต้องการดูค่า",
  }),
  E207: (a) => ({
    message: `'${a.name}' ไม่มีอยู่ในโมเดล`,
    fix: didYouMean(a, "th") ?? "ตรวจการสะกดอีกครั้ง",
  }),
  E208: () => ({
    message: "มีสมการอนุพันธ์ ( ' ) แต่ไม่มีคำสั่ง INTEGRAL",
    fix: "เพิ่มคำสั่ง INTEGRAL เช่น INTEGRAL W[0,50] step 0.1 by RKV",
  }),
  E209: (a) => ({
    message: `มีคำสั่ง INTEGRAL มากกว่าหนึ่งอัน (อันแรกอยู่บรรทัด ${a.line})`,
    fix: "เหลือไว้อันเดียว",
  }),
  E210: (a) => ({
    message: `กำหนดค่าเริ่มต้นให้ '${a.name}' แต่ไม่มีสมการไหนใช้ตัวแปรนี้`,
  }),
  E211: (a) => ({
    message: `'${a.name}' อ้างถึงตัวเองในสมการเดียวกัน`,
    fix: "ถ้าตั้งใจให้วนซ้ำ ควรแยกเป็นสมการ implicit และใส่ค่าเดาด้วย #",
  }),
  E212: (a) => ({
    message: `อาจเกิดการหารด้วยศูนย์ที่ '${a.name}'`,
    fix: "ป้องกันด้วย MAX(ตัวส่วน,1E-12)",
  }),
};

const ENGLISH: Record<DiagnosticCode, Template> = {
  E001: (a) => ({
    message: `'${a.text}' is not a character EQUATRAN understands`,
    fix: "Remove it, or start the line with // if it was meant as a comment",
  }),
  E002: () => ({
    message: "Incomplete scientific notation — E must be followed by digits",
    fix: "Write it in full, such as 5.0E-3 or 1E12",
  }),
  E100: (a) => ({
    message: `Unexpected ${describeToken(a.text, "en")}`,
    fix: "Check for a missing operator ( + - * / ) or a missing comma",
  }),
  E101: (a) => ({
    message: `Expected '${a.expected}' here, found ${describeToken(a.text, "en")}`,
    fix: `Add '${a.expected}'`,
  }),
  E103: () => ({ message: "'(' is never closed", fix: "Add the matching ')'" }),
  E104: (a) => ({
    message: `Expected '${a.expected ?? "]"}' to close the bracket`,
    fix: "The form is [lower,upper], for example [40,400]",
  }),
  E105: () => ({
    message: "This equation has more than one '='",
    fix: "Split it across lines, or separate with ;",
  }),
  E106: (a) => ({
    message: `Cannot read this statement — expected '=', found ${describeToken(a.text, "en")}`,
    fix: "An equation is name = expression, or expression = expression",
  }),
  E107: (a) => ({
    message: `Expected a variable name, found ${describeToken(a.text, "en")}`,
  }),
  E108: (a) => ({
    message: `Expected a number, found ${describeToken(a.text, "en")}`,
  }),
  E109: (a) => ({
    message: `Operator '${a.text}' has nothing after it`,
    fix: "Add a number or a variable name",
  }),
  E110: (a) => ({
    message: `Malformed RESET — found ${describeToken(a.text, "en")}`,
    fix: "The form is RESET var # guess [lower,upper] BY equationLabel",
  }),
  E111: (a) => ({
    message: `Malformed INTEGRAL — found ${describeToken(a.text, "en")}`,
    fix: "The form is INTEGRAL var[from,to] step size by method",
  }),
  E112: (a) => ({
    message: `Expected a comma-separated list of names, found ${describeToken(a.text, "en")}`,
  }),
  E113: (a) => ({
    message: `Stray '${a.text}' with no matching opening bracket`,
    fix: "Remove it, or add the opening bracket",
  }),
  E200: (a) => ({
    message: `'${a.name}' is used but no equation gives it a value`,
    fix: didYouMean(a, "en") ?? `Add an equation such as ${a.name}=...`,
  }),
  E201: (a) => ({
    message: `Unknown function '${a.name}'`,
    fix: didYouMean(a, "en") ?? "Check the function name",
  }),
  E202: (a) => ({
    message: `${a.name} takes ${a.expected} argument(s), got ${a.actual}`,
  }),
  E203: (a) => ({
    message: `BY refers to '${a.name}', but no equation has that label`,
    fix: didYouMean(a, "en") ?? "Label an equation with `name: equation`",
  }),
  E204: (a) => ({
    message: `Duplicate equation label '${a.name}', first used on line ${a.line}`,
    fix: "Rename one of them",
  }),
  E205: (a) => ({
    message: `'${a.name}' already has a value from line ${a.line}`,
    fix: "Remove or comment out the earlier one if this is deliberate",
  }),
  E206: (a) => ({
    message: `'${a.name}' is defined but never used`,
    fix: "Remove it, or add it to OUTPUT if you want to see its value",
  }),
  E207: (a) => ({
    message: `'${a.name}' does not exist in this model`,
    fix: didYouMean(a, "en") ?? "Check the spelling",
  }),
  E208: () => ({
    message: "There are derivative equations ( ' ) but no INTEGRAL statement",
    fix: "Add one, such as INTEGRAL W[0,50] step 0.1 by RKV",
  }),
  E209: (a) => ({
    message: `More than one INTEGRAL statement (the first is on line ${a.line})`,
    fix: "Keep only one",
  }),
  E210: (a) => ({
    message: `'${a.name}' is given an initial value but no equation uses it`,
  }),
  E211: (a) => ({
    message: `'${a.name}' refers to itself in its own equation`,
    fix: "For a deliberate loop, write it as an implicit equation and give a guess with #",
  }),
  E212: (a) => ({
    message: `Possible division by zero at '${a.name}'`,
    fix: "Guard it with MAX(denominator,1E-12)",
  }),
};

const CATALOG: Record<Locale, Record<DiagnosticCode, Template>> = {
  th: THAI,
  en: ENGLISH,
};

export function renderDiagnostic(
  item: Diagnostic,
  locale: Locale,
): RenderedDiagnostic {
  return CATALOG[locale][item.code](item.args);
}
