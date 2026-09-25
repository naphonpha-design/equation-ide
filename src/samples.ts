import cstr from "../samples/lec6-cstr.eqs?raw";
import packedBed from "../samples/fixed-bed-isothermal.eqs?raw";

export interface SampleModel {
  name: string;
  title: { th: string; en: string };
  source: string;
}

export const SAMPLES: SampleModel[] = [
  {
    name: "lec6-cstr.eqs",
    title: {
      th: "CSTR แบบ adiabatic (ระบบสมการพีชคณิต)",
      en: "Adiabatic CSTR (algebraic system)",
    },
    source: cstr,
  },
  {
    name: "fixed-bed-isothermal.eqs",
    title: {
      th: "เบดนิ่ง isothermal (ODE + Ergun)",
      en: "Isothermal fixed bed (ODE + Ergun)",
    },
    source: packedBed,
  },
];
