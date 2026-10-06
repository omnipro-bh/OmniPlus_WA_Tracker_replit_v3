import type { CalcOperation } from "@/lib/calc";

export interface Booking {
  id: number;
  departmentId: number;
  staffId: number;
  slotDate: string;
  endDate?: string | null;
  startTime: string;
  endTime: string;
  endDayStartTime?: string | null;
  endDayEndTime?: string | null;
  customerPhone: string;
  customerName: string | null;
  status: string;
  bookingLabel: string | null;
  createdAt: string;
  updatedAt?: string;
  departmentName?: string | null;
  staffName?: string | null;
  customFieldValues?: { fieldId: number; value: string }[];
  // legacy chatbot columns (used by the export, kept for compatibility)
  customField1Label?: string | null;
  customField1Value?: string | null;
  customField2Label?: string | null;
  customField2Value?: string | null;
}

export interface CustomField {
  id: number;
  name: string;
  fieldType: "text" | "number" | "date" | "boolean" | "select" | "calculation";
  isRequired: boolean;
  displayOrder: number;
  options: string[] | null;
  calcOperation: CalcOperation | null;
  calcFieldAId: number | null;
  calcFieldBId: number | null;
}
