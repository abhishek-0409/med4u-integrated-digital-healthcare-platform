import { ClinicalPrescription } from "../types/clinical-prescription";

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const label = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** HTML sent only to the platform PDF renderer; all text is escaped and comes from the authorized API response. */
export function prescriptionPdfHtml(rx: ClinicalPrescription): string {
  const medicines = rx.medicines.map((m) => `
    <section class="medicine">
      <h2>${escapeHtml(m.name)} <span>${escapeHtml(m.strength)} · ${escapeHtml(label(m.dosageForm))}</span></h2>
      ${m.genericName ? `<p class="muted">${escapeHtml(m.genericName)}</p>` : ""}
      <div class="grid">
        <p><b>Dosage</b><br>${escapeHtml(m.dose)}</p><p><b>Route</b><br>${escapeHtml(label(m.route))}</p>
        <p><b>Frequency</b><br>${escapeHtml(m.frequency)}</p><p><b>Duration</b><br>${escapeHtml(m.durationValue)} ${escapeHtml(m.durationUnit)}</p>
        <p><b>Quantity</b><br>${escapeHtml(m.quantity)} ${escapeHtml(m.quantityUnit ?? "")}</p>
        ${m.timing.length ? `<p><b>Timing</b><br>${escapeHtml(m.timing.map(label).join(", "))}</p>` : ""}
        ${m.foodRelation !== "not_applicable" ? `<p><b>Food</b><br>${escapeHtml(label(m.foodRelation))}</p>` : ""}
      </div>${m.instructions ? `<p><b>Instructions:</b> ${escapeHtml(m.instructions)}</p>` : ""}
    </section>`).join("");
  const tests = rx.recommendedTests?.length ? rx.recommendedTests.map((test) => `
    <section class="medicine">
      <h2>${escapeHtml(test.name)}</h2>
      ${test.preparationInstructions ? `<p><b>Preparation:</b> ${escapeHtml(test.preparationInstructions)}</p>` : ""}
      ${test.clinicalInstructions ? `<p><b>Doctor's note:</b> ${escapeHtml(test.clinicalInstructions)}</p>` : ""}
    </section>`).join("") : "<p>None recommended.</p>";
  const doctor = rx.doctor;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 18mm 16mm; } * { box-sizing: border-box; }
    body { color:#173b32; font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; line-height:1.45; }
    header { border-bottom:3px solid #2f806b; padding-bottom:12px; margin-bottom:18px; }
    .brand { color:#26735f; font-size:11px; letter-spacing:2px; font-weight:700; }
    h1 { font-size:22px; margin:5px 0; } h2 { font-size:15px; margin:0 0 7px; }
    h2 span,.muted { color:#62756e; font-size:11px; font-weight:400; }
    .grid { display:grid; grid-template-columns:repeat(3,1fr); gap:4px 10px; }
    p { margin:4px 0; } .meta { display:grid; grid-template-columns:1fr 1fr; gap:8px; background:#f1f7f4; padding:12px; border-radius:8px; margin:12px 0; }
    .medicine { border:1px solid #d9e5df; border-radius:8px; padding:12px; margin:12px 0; break-inside:avoid; }
    .diagnosis { padding:10px 0; } .section-title { color:#26735f; font-weight:700; margin-top:16px; }
    .foot { margin-top:24px; padding-top:8px; border-top:1px solid #d9e5df; color:#718079; font-size:10px; }
  </style></head><body>
    <header><div class="brand">MED4U</div><h1>Prescription</h1><div>${escapeHtml(rx.reference)} · Issued ${escapeHtml(new Date(rx.issuedAt).toLocaleDateString())}</div></header>
    <div class="meta"><div><b>Patient</b><br>${escapeHtml(rx.patient.name)}${rx.patient.age != null ? ` · ${escapeHtml(rx.patient.age)} years` : ""}${rx.patient.gender ? ` · ${escapeHtml(label(rx.patient.gender))}` : ""}</div>
      <div><b>Doctor</b><br>${escapeHtml(doctor.name)}<br>${escapeHtml(doctor.specialization)}${doctor.clinicName ? `<br>${escapeHtml(doctor.clinicName)}` : ""}
      ${doctor.registrationVerified && doctor.registrationNumber ? `<br>Registration: ${escapeHtml(doctor.registrationNumber)}${doctor.registrationCouncil ? ` · ${escapeHtml(doctor.registrationCouncil)}` : ""}` : ""}</div>
      <div><b>Consultation date</b><br>${escapeHtml(rx.consultation.date)}</div><div><b>Prescription ID</b><br>${escapeHtml(rx.reference)}</div></div>
    <div class="diagnosis"><div class="section-title">Diagnosis / clinical assessment</div><div>${escapeHtml(rx.diagnosis ?? "Not provided")}</div></div>
    <div class="section-title">Medicines</div>${medicines}
    <div class="section-title">Recommended tests</div>${tests}
    ${rx.additionalInstructions ? `<div class="section-title">Additional instructions</div><p>${escapeHtml(rx.additionalInstructions)}</p>` : ""}
    ${rx.warnings ? `<div class="section-title">Warnings and patient-specific instructions</div><p>${escapeHtml(rx.warnings)}</p>` : ""}
    ${rx.followUpDate ? `<div class="section-title">Follow-up</div><p>${escapeHtml(rx.followUpDate)}</p>` : ""}
    <div class="foot">This document reflects the prescription issued in Med4U. It contains no digital signature.</div>
  </body></html>`;
}
