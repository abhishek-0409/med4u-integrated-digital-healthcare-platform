/** INR with grouping; paise are shown only when present: ₹1,200 / ₹31.35. */
export const formatCurrency = (amount: number): string => {
  const hasPaise = Math.round(amount * 100) % 100 !== 0;
  return `₹${amount.toLocaleString("en-IN", {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
};

/** Sums rupee amounts through integer paise so totals never pick up float error. */
export const sumRupees = (amounts: number[]): number =>
  amounts.reduce((paise, amount) => paise + Math.round(amount * 100), 0) / 100;

export const NOT_PROVIDED = "Not provided";

/** A fee the source did not supply is "Not provided", never ₹0. */
export const formatFee = (fee: number | null | undefined): string =>
  fee == null ? NOT_PROVIDED : formatCurrency(fee);

/** "12 yrs" / "1 yr", or "Not provided". */
export const formatExperience = (years: number | null | undefined, long = false): string => {
  if (years == null) return NOT_PROVIDED;
  const unit = long ? (years === 1 ? "year" : "years") : years === 1 ? "yr" : "yrs";
  return `${years} ${unit}`;
};

export const getGreeting = (name: string): string => {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
  return `${greeting}, ${name}`;
};

export const maskPhone = (phone: string): string => {
  if (phone.length < 6) {
    return phone;
  }
  return `${phone.slice(0, 3)}****${phone.slice(-3)}`;
};

/** '+919876543210' -> '+91 98765 43210'; anything else is returned unchanged. */
export const formatIndianPhone = (phone: string): string => phone.replace(/^\+91(\d{5})(\d{5})$/, "+91 $1 $2");

const INDIAN_MOBILE = /^[6-9]\d{9}$/;

/** Returns the backend's E.164 format (+91XXXXXXXXXX) for a 10-digit Indian mobile number, or null. */
export const toIndianE164 = (digits: string): string | null =>
  INDIAN_MOBILE.test(digits) ? `+91${digits}` : null;

// ── Clinic-local dates and times ────────────────────────────────────────────
// The backend publishes appointment slots as wall-clock IST dates ('YYYY-MM-DD') and times
// ('HH:MM'). They are displayed as-is, never converted through the device timezone.

const IST_OFFSET_MS = 330 * 60_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Today's calendar date in the clinic's timezone, regardless of the device timezone. */
export const todayInClinic = (): string =>
  new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);

/** 'YYYY-MM-DD' shifted by whole days. */
export const addClinicDays = (date: string, days: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const parseDate = (date: string): Date => new Date(`${date}T00:00:00Z`);

export const clinicWeekday = (date: string): string => WEEKDAYS[parseDate(date).getUTCDay()];

export const clinicDayOfMonth = (date: string): number => parseDate(date).getUTCDate();

/** 'Tue, 29 Sep 2026' */
export const formatClinicDate = (date: string): string => {
  const d = parseDate(date);
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

/** '14:30' -> '2:30 PM' */
export const formatClinicTime = (time: string): string => {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
};

/** Whole years between a 'YYYY-MM-DD' birth date and now, or null when unknown/invalid. */
export const ageFromDob = (dob: string | null | undefined): number | null => {
  if (!dob) {
    return null;
  }
  const birth = parseDate(dob);
  if (Number.isNaN(birth.getTime())) {
    return null;
  }
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const hadBirthday =
    now.getUTCMonth() > birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() >= birth.getUTCDate());
  if (!hadBirthday) {
    age -= 1;
  }
  return age >= 0 ? age : null;
};

/** True when `value` is a real calendar date ('YYYY-MM-DD') that is not in the future. */
export const isValidPastDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const d = parseDate(value);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value && d.getTime() <= Date.now();
};
