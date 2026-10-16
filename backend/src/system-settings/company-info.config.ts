// Shape + defaults for the system_settings row backing the Settings page's
// "Company" section (Prompt 20). Purely descriptive — nothing in the backend
// currently reads this to change behavior, it just gives the org a place to
// record who they are. Same file-per-domain split as lead-scoring.config.ts.

export const COMPANY_SETTINGS_KEY = 'company';

export interface BusinessHours {
  /** IANA zone, e.g. "Asia/Kolkata" — advisory only; nothing parses it. */
  timezone: string;
  /** "HH:mm", 24-hour. */
  opensAt: string;
  closesAt: string;
  /** 0 (Sunday) - 6 (Saturday), the days the business is open. */
  daysOpen: number[];
}

export interface CompanyInfo {
  name: string;
  logoUrl: string;
  contactEmail: string;
  contactPhone: string;
  businessHours: BusinessHours;
}

export const DEFAULT_COMPANY_INFO: CompanyInfo = {
  name: '',
  logoUrl: '',
  contactEmail: '',
  contactPhone: '',
  businessHours: {
    timezone: 'Asia/Kolkata',
    opensAt: '09:00',
    closesAt: '18:00',
    daysOpen: [1, 2, 3, 4, 5],
  },
};
