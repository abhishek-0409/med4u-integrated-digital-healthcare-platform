/**
 * DEMO medicine catalog.
 *
 * - Every price here is an ILLUSTRATIVE ESTIMATE in INR, not a verified retail price. Rows are
 *   stored with price source DEMO_ESTIMATE and brands flagged is_demo, so the app can say so.
 *   Replace this file (or load a verified catalog) before presenting prices as real.
 * - Brand / manufacturer attributions are for demo realism only and have not been verified
 *   against labels. Where unsure, manufacturer is null.
 * - Prescription flag rule: when in doubt, a product is marked prescription-required. Nothing
 *   scheduled as narcotic / psychotropic / Schedule X is included.
 * - `key` is the stable idempotency key (brands.catalog_key). Never change a key once seeded.
 */

export interface DemoMedicine {
  key: string;
  brand: string;
  generic: string;
  category: DemoCategory;
  manufacturer: string | null;
  strength: string | null;
  form: string;
  packSize: string;
  /** INR, max 2 decimals. */
  mrp: number;
  /** INR, max 2 decimals, never above mrp. */
  sellingPrice: number;
  requiresPrescription: boolean;
  /** Initial stock only; re-running the seed never resets stock of an existing product. */
  stock: number;
}

export const DEMO_CATEGORIES = [
  'Pain & Fever',
  'Allergy',
  'Digestive Health',
  'Oral Rehydration',
  'Vitamins & Supplements',
  'Skin Care',
  'Cough & Cold',
  'First Aid',
  'Medical Supplies',
  'Chronic Care',
] as const;

export type DemoCategory = (typeof DEMO_CATEGORIES)[number];

/** One neutral, non-advisory sentence per category. No dosage, no indications for a patient. */
export const CATEGORY_NOTES: Record<DemoCategory, string> = {
  'Pain & Fever': 'Pain and fever relief product.',
  Allergy: 'Allergy relief product.',
  'Digestive Health': 'Digestive health product.',
  'Oral Rehydration': 'Oral rehydration product.',
  'Vitamins & Supplements': 'Dietary or vitamin supplement.',
  'Skin Care': 'Skin care product.',
  'Cough & Cold': 'Cough and cold product.',
  'First Aid': 'First-aid product.',
  'Medical Supplies': 'Home medical supply or device.',
  'Chronic Care': 'Medicine used for long-term conditions, supplied only against a prescription.',
};

type Row = [
  key: string,
  brand: string,
  generic: string,
  category: DemoCategory,
  manufacturer: string | null,
  strength: string | null,
  form: string,
  packSize: string,
  mrp: number,
  sellingPrice: number,
  requiresPrescription: boolean,
  stock: number,
];

// prettier-ignore
const rows: Row[] = [
  // ── Pain & Fever ──
  ['dolo-650-tab-15', 'Dolo 650 Tablet', 'Paracetamol', 'Pain & Fever', 'Micro Labs', '650 mg', 'tablet', 'Strip of 15 tablets', 33.0, 31.35, false, 420],
  ['dolo-500-tab-15', 'Dolo 500 Tablet', 'Paracetamol', 'Pain & Fever', 'Micro Labs', '500 mg', 'tablet', 'Strip of 15 tablets', 28.0, 28.0, false, 260],
  ['crocin-500-tab-15', 'Crocin 500 Tablet', 'Paracetamol', 'Pain & Fever', 'Haleon', '500 mg', 'tablet', 'Strip of 15 tablets', 22.0, 22.0, false, 310],
  ['calpol-650-tab-15', 'Calpol 650 Tablet', 'Paracetamol', 'Pain & Fever', null, '650 mg', 'tablet', 'Strip of 15 tablets', 31.0, 29.45, false, 180],
  ['paracetamol-500-ip-tab-10', 'Paracetamol Tablets IP 500 mg', 'Paracetamol', 'Pain & Fever', null, '500 mg', 'tablet', 'Strip of 10 tablets', 15.0, 11.25, false, 520],
  ['dolo-250-susp-60', 'Dolo 250 Suspension', 'Paracetamol', 'Pain & Fever', 'Micro Labs', '250 mg/5 ml', 'suspension', 'Bottle of 60 ml', 36.0, 34.2, false, 95],
  ['disprin-350-tab-10', 'Disprin Tablet', 'Aspirin', 'Pain & Fever', 'Reckitt', '350 mg', 'tablet', 'Strip of 10 dispersible tablets', 17.0, 17.0, false, 140],
  ['volini-gel-30', 'Volini Gel', 'Diclofenac', 'Pain & Fever', 'Sun Pharma', '1% w/w', 'gel', 'Tube of 30 g', 99.0, 94.05, false, 75],
  ['moov-oint-50', 'Moov Pain Relief Ointment', 'Menthol + Methyl Salicylate', 'Pain & Fever', 'Reckitt', null, 'ointment', 'Tube of 50 g', 145.0, 137.75, false, 60],
  ['amrutanjan-balm-9', 'Amrutanjan Pain Balm', 'Menthol + Camphor', 'Pain & Fever', 'Amrutanjan Health Care', null, 'balm', 'Bottle of 9 ml', 38.0, 38.0, false, 8],
  // ── Allergy ──
  ['okacet-10-tab-10', 'Okacet Tablet', 'Cetirizine', 'Allergy', 'Cipla', '10 mg', 'tablet', 'Strip of 10 tablets', 24.0, 21.6, false, 230],
  ['alerid-10-tab-10', 'Alerid Tablet', 'Cetirizine', 'Allergy', 'Cipla', '10 mg', 'tablet', 'Strip of 10 tablets', 26.0, 24.7, false, 150],
  ['cetirizine-ip-10-tab-10', 'Cetirizine Tablets IP 10 mg', 'Cetirizine', 'Allergy', null, '10 mg', 'tablet', 'Strip of 10 tablets', 14.0, 10.5, false, 340],
  ['okacet-syrup-60', 'Okacet Syrup', 'Cetirizine', 'Allergy', 'Cipla', '5 mg/5 ml', 'syrup', 'Bottle of 60 ml', 52.0, 49.4, false, 70],
  ['cetirizine-oral-sol-ip-60', 'Cetirizine Oral Solution IP', 'Cetirizine', 'Allergy', null, '5 mg/5 ml', 'oral solution', 'Bottle of 60 ml', 38.0, 32.3, false, 0],
  ['saline-nasal-spray-15', 'Saline Nasal Spray', 'Sodium Chloride', 'Allergy', null, '0.65% w/v', 'nasal spray', 'Bottle of 15 ml', 85.0, 80.75, false, 55],
  ['levocet-5-tab-10', 'Levocet 5 Tablet', 'Levocetirizine', 'Allergy', null, '5 mg', 'tablet', 'Strip of 10 tablets', 62.0, 55.8, true, 120],
  ['montair-lc-tab-10', 'Montair-LC Tablet', 'Montelukast + Levocetirizine', 'Allergy', 'Cipla', '10 mg + 5 mg', 'tablet', 'Strip of 10 tablets', 215.0, 193.5, true, 90],
  ['allegra-120-tab-10', 'Allegra 120 Tablet', 'Fexofenadine', 'Allergy', 'Sanofi India', '120 mg', 'tablet', 'Strip of 10 tablets', 205.0, 194.75, true, 64],
  ['avil-25-tab-15', 'Avil 25 Tablet', 'Pheniramine', 'Allergy', 'Sanofi India', '25 mg', 'tablet', 'Strip of 15 tablets', 11.0, 11.0, true, 200],
  // ── Digestive Health ──
  ['digene-gel-mint-200', 'Digene Gel Mint', 'Magaldrate + Simethicone', 'Digestive Health', 'Abbott India', null, 'gel', 'Bottle of 200 ml', 140.0, 133.0, false, 85],
  ['digene-tab-15', 'Digene Tablet', 'Aluminium Hydroxide + Magnesium Hydroxide + Simethicone', 'Digestive Health', 'Abbott India', null, 'chewable tablet', 'Strip of 15 tablets', 26.0, 26.0, false, 300],
  ['eno-lemon-sachet-6', 'ENO Fruit Salt Lemon', 'Sodium Bicarbonate + Citric Acid', 'Digestive Health', 'Haleon', null, 'powder', 'Pack of 6 sachets (5 g each)', 60.0, 57.0, false, 210],
  ['pudin-hara-pearls-10', 'Pudin Hara Pearls', 'Mentha Oil', 'Digestive Health', 'Dabur', null, 'capsule', 'Strip of 10 capsules', 22.0, 22.0, false, 160],
  ['hajmola-regular-120', 'Hajmola Regular', 'Digestive herbal blend', 'Digestive Health', 'Dabur', null, 'tablet', 'Bottle of 120 tablets', 70.0, 66.5, false, 130],
  ['sat-isabgol-100', 'Sat Isabgol', 'Psyllium Husk', 'Digestive Health', 'Dabur', null, 'powder', 'Pack of 100 g', 170.0, 153.0, false, 6],
  ['gelusil-mps-tab-10', 'Gelusil MPS Tablet', 'Aluminium Hydroxide + Magnesium Hydroxide + Simethicone', 'Digestive Health', null, null, 'chewable tablet', 'Strip of 10 tablets', 24.0, 22.8, false, 175],
  ['pan-40-tab-15', 'Pan 40 Tablet', 'Pantoprazole', 'Digestive Health', 'Alkem', '40 mg', 'tablet', 'Strip of 15 tablets', 165.0, 148.5, true, 240],
  ['domstal-10-tab-10', 'Domstal Tablet', 'Domperidone', 'Digestive Health', 'Torrent', '10 mg', 'tablet', 'Strip of 10 tablets', 28.0, 26.6, true, 110],
  ['omez-20-cap-15', 'Omez 20 Capsule', 'Omeprazole', 'Digestive Health', "Dr. Reddy's", '20 mg', 'capsule', 'Strip of 15 capsules', 78.0, 70.2, true, 0],
  // ── Oral Rehydration ──
  ['electral-orange-218', 'Electral Powder Orange', 'Oral Rehydration Salts', 'Oral Rehydration', 'FDC', '21.8 g sachet', 'powder', 'Pack of 1 sachet', 24.0, 22.8, false, 380],
  ['electral-lemon-218', 'Electral Powder Lemon', 'Oral Rehydration Salts', 'Oral Rehydration', 'FDC', '21.8 g sachet', 'powder', 'Pack of 1 sachet', 24.0, 24.0, false, 220],
  ['who-ors-ip-218', 'ORS Powder IP (WHO formula)', 'Oral Rehydration Salts', 'Oral Rehydration', null, '21 g sachet', 'powder', 'Pack of 1 sachet', 18.0, 14.4, false, 450],
  ['orsl-orange-200', 'ORSL Orange Ready-to-Drink', 'Oral Rehydration Salts', 'Oral Rehydration', 'Kenvue', null, 'liquid', 'Pack of 200 ml', 45.0, 45.0, false, 140],
  ['orsl-apple-200', 'ORSL Apple Ready-to-Drink', 'Oral Rehydration Salts', 'Oral Rehydration', 'Kenvue', null, 'liquid', 'Pack of 200 ml', 45.0, 42.75, false, 4],
  ['enerzal-orange-200', 'Enerzal Orange Powder', 'Glucose + Electrolytes', 'Oral Rehydration', 'FDC', null, 'powder', 'Pack of 200 g', 118.0, 106.2, false, 90],
  // ── Vitamins & Supplements ──
  ['becosules-cap-20', 'Becosules Capsule', 'Vitamin B-Complex + Vitamin C', 'Vitamins & Supplements', 'Pfizer', null, 'capsule', 'Strip of 20 capsules', 52.0, 49.4, false, 260],
  ['shelcal-500-tab-15', 'Shelcal 500 Tablet', 'Calcium + Vitamin D3', 'Vitamins & Supplements', 'Torrent', '500 mg + 250 IU', 'tablet', 'Strip of 15 tablets', 126.0, 113.4, false, 190],
  ['limcee-500-chew-15', 'Limcee Chewable Tablet', 'Vitamin C', 'Vitamins & Supplements', 'Abbott India', '500 mg', 'chewable tablet', 'Strip of 15 tablets', 26.0, 26.0, false, 410],
  ['revital-h-cap-30', 'Revital H Capsule', 'Multivitamin + Multimineral', 'Vitamins & Supplements', 'Sun Pharma', null, 'capsule', 'Bottle of 30 capsules', 330.0, 297.0, false, 120],
  ['supradyn-daily-tab-15', 'Supradyn Daily Tablet', 'Multivitamin + Multimineral', 'Vitamins & Supplements', 'Bayer', null, 'tablet', 'Strip of 15 tablets', 62.0, 62.0, false, 150],
  ['zincovit-tab-15', 'Zincovit Tablet', 'Multivitamin + Zinc', 'Vitamins & Supplements', 'Apex Laboratories', null, 'tablet', 'Strip of 15 tablets', 105.0, 94.5, false, 280],
  ['evion-400-cap-10', 'Evion 400 Capsule', 'Vitamin E', 'Vitamins & Supplements', 'Merck', '400 mg', 'capsule', 'Strip of 10 capsules', 38.0, 36.1, false, 200],
  ['neurobion-forte-tab-30', 'Neurobion Forte Tablet', 'Vitamin B1 + B6 + B12', 'Vitamins & Supplements', 'Procter & Gamble Health', null, 'tablet', 'Strip of 30 tablets', 41.0, 41.0, false, 170],
  ['protinex-original-250', 'Protinex Original Powder', 'Protein Supplement', 'Vitamins & Supplements', 'Danone', null, 'powder', 'Jar of 250 g', 360.0, 324.0, false, 45],
  ['ensure-vanilla-400', 'Ensure Vanilla Powder', 'Nutritional Supplement', 'Vitamins & Supplements', 'Abbott India', null, 'powder', 'Tin of 400 g', 790.0, 711.0, false, 30],
  ['dabur-chyawanprash-500', 'Dabur Chyawanprash', 'Herbal Supplement', 'Vitamins & Supplements', 'Dabur', null, 'paste', 'Jar of 500 g', 285.0, 256.5, false, 85],
  ['liv52-tab-100', 'Liv.52 Tablet', 'Herbal Liver Supplement', 'Vitamins & Supplements', 'Himalaya', null, 'tablet', 'Bottle of 100 tablets', 190.0, 190.0, false, 0],
  // ── First Aid ──
  ['betadine-oint-20', 'Betadine Ointment', 'Povidone Iodine', 'First Aid', 'Win-Medicare', '5% w/w', 'ointment', 'Tube of 20 g', 85.0, 80.75, false, 150],
  // ── Skin Care ──
  ['boroline-cream-20', 'Boroline Antiseptic Cream', 'Boric Acid + Zinc Oxide', 'Skin Care', 'G.D. Pharmaceuticals', null, 'cream', 'Tube of 20 g', 38.0, 38.0, false, 240],
  ['lacto-calamine-120', 'Lacto Calamine Lotion', 'Calamine', 'Skin Care', 'Piramal', null, 'lotion', 'Bottle of 120 ml', 175.0, 157.5, false, 110],
  ['cetaphil-cleanser-125', 'Cetaphil Gentle Skin Cleanser', 'Cleansing Lotion', 'Skin Care', 'Galderma', null, 'lotion', 'Bottle of 125 ml', 395.0, 355.5, false, 65],
  ['cetaphil-moist-lotion-100', 'Cetaphil Moisturising Lotion', 'Moisturiser', 'Skin Care', 'Galderma', null, 'lotion', 'Bottle of 100 ml', 410.0, 410.0, false, 50],
  ['vaseline-jelly-85', 'Vaseline Petroleum Jelly', 'White Petrolatum', 'Skin Care', 'Hindustan Unilever', null, 'jelly', 'Jar of 85 g', 90.0, 85.5, false, 190],
  ['himalaya-nourishing-cream-50', 'Himalaya Nourishing Skin Cream', 'Moisturiser', 'Skin Care', 'Himalaya', null, 'cream', 'Tube of 50 ml', 115.0, 103.5, false, 120],
  ['himalaya-neem-facewash-100', 'Himalaya Purifying Neem Face Wash', 'Face Wash', 'Skin Care', 'Himalaya', null, 'face wash', 'Tube of 100 ml', 175.0, 157.5, false, 135],
  ['aloe-vera-gel-150', 'Aloe Vera Gel', 'Aloe Barbadensis Leaf Extract', 'Skin Care', null, null, 'gel', 'Tube of 150 ml', 120.0, 99.0, false, 100],
  ['candid-dusting-powder-30', 'Candid Dusting Powder', 'Clotrimazole', 'Skin Care', 'Glenmark', '1% w/w', 'powder', 'Bottle of 30 g', 98.0, 93.1, true, 95],
  ['soframycin-cream-20', 'Soframycin Skin Cream', 'Framycetin', 'Skin Care', 'Sanofi India', '1% w/w', 'cream', 'Tube of 20 g', 62.0, 62.0, true, 130],
  // ── Cough & Cold ──
  ['vicks-vaporub-10', 'Vicks VapoRub', 'Menthol + Camphor + Eucalyptus Oil', 'Cough & Cold', 'Procter & Gamble', null, 'balm', 'Jar of 10 ml', 52.0, 52.0, false, 330],
  ['vicks-vaporub-25', 'Vicks VapoRub', 'Menthol + Camphor + Eucalyptus Oil', 'Cough & Cold', 'Procter & Gamble', null, 'balm', 'Jar of 25 ml', 125.0, 118.75, false, 210],
  ['vicks-inhaler-0.5', 'Vicks Inhaler', 'Menthol + Camphor Inhalation', 'Cough & Cold', 'Procter & Gamble', null, 'inhaler', 'Pack of 1 inhaler', 75.0, 71.25, false, 145],
  ['vicks-cough-drops-menthol-10', 'Vicks Cough Drops Menthol', 'Menthol', 'Cough & Cold', 'Procter & Gamble', null, 'lozenge', 'Pack of 10 lozenges', 15.0, 15.0, false, 400],
  ['strepsils-orange-8', 'Strepsils Orange Lozenges', 'Amylmetacresol + Dichlorobenzyl Alcohol', 'Cough & Cold', 'Reckitt', null, 'lozenge', 'Strip of 8 lozenges', 42.0, 39.9, false, 250],
  ['strepsils-honey-lemon-8', 'Strepsils Honey & Lemon Lozenges', 'Amylmetacresol + Dichlorobenzyl Alcohol', 'Cough & Cold', 'Reckitt', null, 'lozenge', 'Strip of 8 lozenges', 42.0, 42.0, false, 180],
  ['koflet-h-lozenge-12', 'Koflet-H Herbal Lozenges', 'Herbal Extracts', 'Cough & Cold', 'Himalaya', null, 'lozenge', 'Pack of 12 lozenges', 30.0, 28.5, false, 220],
  ['honitus-syrup-100', 'Honitus Cough Syrup', 'Herbal Extracts', 'Cough & Cold', 'Dabur', null, 'syrup', 'Bottle of 100 ml', 110.0, 104.5, false, 95],
  ['sitopaladi-churna-60', 'Sitopaladi Churna', 'Herbal Powder', 'Cough & Cold', 'Dabur', null, 'powder', 'Pack of 60 g', 105.0, 94.5, false, 70],
  ['ascoril-ls-syrup-100', 'Ascoril LS Syrup', 'Ambroxol + Levosalbutamol + Guaifenesin', 'Cough & Cold', 'Glenmark', null, 'syrup', 'Bottle of 100 ml', 128.0, 115.2, true, 85],
  // ── First Aid ──
  ['dettol-liquid-250', 'Dettol Antiseptic Liquid', 'Chloroxylenol', 'First Aid', 'Reckitt', '4.8% w/v', 'solution', 'Bottle of 250 ml', 130.0, 123.5, false, 260],
  ['savlon-liquid-200', 'Savlon Antiseptic Liquid', 'Chlorhexidine + Cetrimide', 'First Aid', 'ITC', null, 'solution', 'Bottle of 200 ml', 115.0, 109.25, false, 175],
  ['betadine-solution-100', 'Betadine Solution', 'Povidone Iodine', 'First Aid', 'Win-Medicare', '5% w/v', 'solution', 'Bottle of 100 ml', 105.0, 99.75, false, 140],
  ['band-aid-washproof-20', 'Band-Aid Washproof Strips', 'Adhesive Bandage', 'First Aid', 'Kenvue', null, 'adhesive strips', 'Pack of 20 strips', 60.0, 54.0, false, 300],
  ['hansaplast-classic-20', 'Hansaplast Classic Plasters', 'Adhesive Bandage', 'First Aid', 'Beiersdorf', null, 'adhesive strips', 'Pack of 20 strips', 55.0, 55.0, false, 220],
  ['burnol-cream-20', 'Burnol Cream', 'Aminacrine + Cetrimide', 'First Aid', 'Dr. Morepen', null, 'cream', 'Tube of 20 g', 75.0, 71.25, false, 120],
  ['sterile-gauze-10x10-10', 'Sterile Gauze Pads 10 cm x 10 cm', 'Sterile Gauze', 'First Aid', null, null, 'gauze pad', 'Pack of 10 pads', 55.0, 46.75, false, 160],
  ['cotton-wool-100', 'Absorbent Cotton Wool IP', 'Absorbent Cotton', 'First Aid', null, null, 'cotton wool', 'Pack of 100 g', 60.0, 51.0, false, 140],
  ['micropore-tape-1.25', 'Micropore Surgical Tape 1.25 cm', 'Surgical Tape', 'First Aid', '3M', null, 'tape', 'Roll of 9.1 m', 95.0, 90.25, false, 90],
  ['crepe-bandage-10cm', 'Crepe Bandage 10 cm x 4 m', 'Elastic Bandage', 'First Aid', 'Tynor', null, 'bandage', 'Pack of 1 bandage', 110.0, 99.0, false, 85],
  ['hydrogen-peroxide-6-100', 'Hydrogen Peroxide Solution IP', 'Hydrogen Peroxide', 'First Aid', null, '6% w/v', 'solution', 'Bottle of 100 ml', 32.0, 28.8, false, 110],
  // ── Medical Supplies ──
  ['omron-hem-7120', 'Omron HEM-7120 Blood Pressure Monitor', 'Automatic BP Monitor', 'Medical Supplies', 'Omron', null, 'device', 'Pack of 1 monitor', 2299.0, 2069.0, false, 24],
  ['omron-nec101', 'Omron NE-C101 Compressor Nebulizer', 'Compressor Nebulizer', 'Medical Supplies', 'Omron', null, 'device', 'Pack of 1 nebulizer', 2599.0, 2339.1, false, 12],
  ['dr-morepen-thermometer', 'Dr Morepen Digital Thermometer', 'Digital Thermometer', 'Medical Supplies', 'Dr. Morepen', null, 'device', 'Pack of 1 thermometer', 250.0, 199.0, false, 140],
  ['dr-morepen-oximeter', 'Dr Morepen Pulse Oximeter', 'Fingertip Pulse Oximeter', 'Medical Supplies', 'Dr. Morepen', null, 'device', 'Pack of 1 oximeter', 1500.0, 1199.0, false, 38],
  ['accu-chek-active-meter', 'Accu-Chek Active Glucometer', 'Blood Glucose Meter', 'Medical Supplies', 'Roche', null, 'device', 'Pack of 1 meter', 999.0, 949.05, false, 20],
  ['accu-chek-active-strips-50', 'Accu-Chek Active Test Strips', 'Blood Glucose Test Strips', 'Medical Supplies', 'Roche', null, 'test strips', 'Box of 50 strips', 1050.0, 997.5, false, 3],
  ['face-mask-3ply-50', 'Surgical Face Masks 3-Ply', 'Disposable Face Mask', 'Medical Supplies', null, null, 'mask', 'Box of 50 masks', 150.0, 99.0, false, 260],
  ['exam-gloves-100', 'Disposable Examination Gloves', 'Nitrile Gloves', 'Medical Supplies', null, null, 'gloves', 'Box of 100 gloves', 450.0, 382.5, false, 75],
  ['tynor-hot-water-bag', 'Hot Water Bag', 'Rubber Hot Water Bag', 'Medical Supplies', 'Tynor', null, 'bag', 'Pack of 1 bag', 280.0, 252.0, false, 0],
  ['tynor-knee-support', 'Knee Support', 'Elastic Knee Support', 'Medical Supplies', 'Tynor', null, 'support', 'Pack of 1 support', 420.0, 378.0, false, 40],
  // ── Chronic Care ──
  ['glycomet-500-tab-20', 'Glycomet 500 Tablet', 'Metformin', 'Chronic Care', 'USV', '500 mg', 'tablet', 'Strip of 20 tablets', 36.0, 33.3, true, 300],
  ['amlokind-5-tab-15', 'Amlokind 5 Tablet', 'Amlodipine', 'Chronic Care', 'Mankind', '5 mg', 'tablet', 'Strip of 15 tablets', 34.0, 30.6, true, 280],
  ['telma-40-tab-15', 'Telma 40 Tablet', 'Telmisartan', 'Chronic Care', 'Glenmark', '40 mg', 'tablet', 'Strip of 15 tablets', 215.0, 193.5, true, 140],
  ['atorva-10-tab-15', 'Atorva 10 Tablet', 'Atorvastatin', 'Chronic Care', 'Zydus', '10 mg', 'tablet', 'Strip of 15 tablets', 120.0, 108.0, true, 160],
  ['rosuvas-10-tab-15', 'Rosuvas 10 Tablet', 'Rosuvastatin', 'Chronic Care', 'Sun Pharma', '10 mg', 'tablet', 'Strip of 15 tablets', 205.0, 184.5, true, 110],
  ['thyronorm-50-tab-120', 'Thyronorm 50 mcg Tablet', 'Levothyroxine', 'Chronic Care', 'Abbott India', '50 mcg', 'tablet', 'Bottle of 120 tablets', 240.0, 228.0, true, 55],
  ['ecosprin-75-tab-14', 'Ecosprin 75 Tablet', 'Aspirin Low Strength', 'Chronic Care', 'USV', '75 mg', 'tablet', 'Strip of 14 tablets', 8.0, 7.6, true, 500],
  ['losar-50-tab-15', 'Losar 50 Tablet', 'Losartan', 'Chronic Care', 'Unichem', '50 mg', 'tablet', 'Strip of 15 tablets', 98.0, 88.2, true, 125],
  ['concor-5-tab-10', 'Concor 5 Tablet', 'Bisoprolol', 'Chronic Care', 'Merck', '5 mg', 'tablet', 'Strip of 10 tablets', 150.0, 135.0, true, 5],
  ['asthalin-inhaler-200', 'Asthalin Inhaler', 'Salbutamol', 'Chronic Care', 'Cipla', '100 mcg/actuation', 'inhaler', 'Inhaler of 200 metered doses', 160.0, 152.0, true, 70],
];

export const DEMO_MEDICINES: DemoMedicine[] = rows.map(
  ([
    key,
    brand,
    generic,
    category,
    manufacturer,
    strength,
    form,
    packSize,
    mrp,
    sellingPrice,
    requiresPrescription,
    stock,
  ]) => ({
    key,
    brand,
    generic,
    category,
    manufacturer,
    strength,
    form,
    packSize,
    mrp,
    sellingPrice,
    requiresPrescription,
    stock,
  }),
);

const NON_DRUG_FORMS = new Set([
  'device',
  'test strips',
  'mask',
  'gloves',
  'bag',
  'support',
  'gauze pad',
  'cotton wool',
  'adhesive strips',
  'tape',
  'bandage',
]);

/** Neutral catalog description: what the product is, never what to take or how much. */
export function describeDemoMedicine(m: DemoMedicine): string {
  const detail = m.strength ? `${m.generic} ${m.strength}` : m.generic;
  const parts = [
    CATEGORY_NOTES[m.category],
    NON_DRUG_FORMS.has(m.form) ? `Type: ${detail}.` : `Contains: ${detail}.`,
  ];
  if (m.requiresPrescription) parts.push('Prescription required.');
  parts.push('Read the label and consult a doctor or pharmacist before use.');
  return parts.join(' ');
}
