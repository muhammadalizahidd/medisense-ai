import type { Discipline, Region, Support } from "./catalogue";

/** A clinician offered for a quick booking, with their next real free times. */
export type QuickClinicianDto = {
  id: string;
  name: string;
  discipline: Discipline;
  region: Region;
  support: Support;
  slots: string[];
};

/** An existing patient who already has a clinician, offered for booking. */
export type QuickPatientDto = {
  id: string;
  name: string;
  mrn: string | null;
  suburb: string;
  phone: string | null;
};

export type QuickBookOptionsDto = { clinicians: QuickClinicianDto[]; patients: QuickPatientDto[] };

export type QuickBookResult = { ref: string; mrn: string; clientId: string; summary: string };
