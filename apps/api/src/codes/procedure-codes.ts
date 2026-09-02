/**
 * Optometry CPT and HCPCS starter sets, used to seed a practice's editable code
 * catalog. These are the codes a general optometric practice bills routinely;
 * a practice adds what it needs and retires what it never uses, so this list is
 * a starting point rather than a fee schedule.
 */

export type ProcedureEntry = {
  code: string;
  description: string;
  category: string;
};

export const CPT_OPTOMETRY: ProcedureEntry[] = [
  // Ophthalmological services
  { code: '92002', description: 'Ophthalmological exam, new patient, intermediate', category: 'Eye exam' },
  { code: '92004', description: 'Ophthalmological exam, new patient, comprehensive', category: 'Eye exam' },
  { code: '92012', description: 'Ophthalmological exam, established patient, intermediate', category: 'Eye exam' },
  { code: '92014', description: 'Ophthalmological exam, established patient, comprehensive', category: 'Eye exam' },
  { code: '92015', description: 'Determination of refractive state', category: 'Eye exam' },

  // Evaluation and management
  { code: '99202', description: 'Office visit, new patient, straightforward', category: 'E/M' },
  { code: '99203', description: 'Office visit, new patient, low complexity', category: 'E/M' },
  { code: '99204', description: 'Office visit, new patient, moderate complexity', category: 'E/M' },
  { code: '99205', description: 'Office visit, new patient, high complexity', category: 'E/M' },
  { code: '99212', description: 'Office visit, established patient, straightforward', category: 'E/M' },
  { code: '99213', description: 'Office visit, established patient, low complexity', category: 'E/M' },
  { code: '99214', description: 'Office visit, established patient, moderate complexity', category: 'E/M' },
  { code: '99215', description: 'Office visit, established patient, high complexity', category: 'E/M' },

  // Diagnostic testing
  { code: '92020', description: 'Gonioscopy', category: 'Diagnostic testing' },
  { code: '92025', description: 'Corneal topography', category: 'Diagnostic testing' },
  { code: '92060', description: 'Sensorimotor exam with multiple measurements', category: 'Diagnostic testing' },
  { code: '92065', description: 'Orthoptic training', category: 'Diagnostic testing' },
  { code: '92081', description: 'Visual field exam, limited', category: 'Visual field' },
  { code: '92082', description: 'Visual field exam, intermediate', category: 'Visual field' },
  { code: '92083', description: 'Visual field exam, extended', category: 'Visual field' },
  { code: '92132', description: 'Anterior segment OCT', category: 'Imaging' },
  { code: '92133', description: 'Posterior segment OCT, optic nerve', category: 'Imaging' },
  { code: '92134', description: 'Posterior segment OCT, retina', category: 'Imaging' },
  { code: '92136', description: 'Ophthalmic biometry', category: 'Imaging' },
  { code: '92201', description: 'Extended ophthalmoscopy with retinal drawing, peripheral', category: 'Imaging' },
  { code: '92202', description: 'Extended ophthalmoscopy with drawing, optic nerve or macula', category: 'Imaging' },
  { code: '92227', description: 'Remote retinal imaging for disease detection', category: 'Imaging' },
  { code: '92228', description: 'Remote retinal imaging for disease management', category: 'Imaging' },
  { code: '92229', description: 'Retinal imaging with automated point-of-care analysis', category: 'Imaging' },
  { code: '92235', description: 'Fluorescein angiography', category: 'Imaging' },
  { code: '92250', description: 'Fundus photography with interpretation and report', category: 'Imaging' },
  { code: '92270', description: 'Electro-oculography', category: 'Diagnostic testing' },
  { code: '92283', description: 'Color vision exam, extended', category: 'Diagnostic testing' },
  { code: '92284', description: 'Dark adaptation exam', category: 'Diagnostic testing' },
  { code: '92285', description: 'External ocular photography', category: 'Imaging' },
  { code: '92286', description: 'Anterior segment imaging with interpretation', category: 'Imaging' },
  { code: '76514', description: 'Corneal pachymetry', category: 'Diagnostic testing' },
  { code: '99172', description: 'Visual function screening', category: 'Screening' },
  { code: '99173', description: 'Visual acuity screening', category: 'Screening' },

  // Contact lens services
  { code: '92071', description: 'Contact lens fitting for ocular surface disease', category: 'Contact lens' },
  { code: '92072', description: 'Contact lens fitting for keratoconus', category: 'Contact lens' },
  { code: '92310', description: 'Contact lens fitting, both eyes, except aphakia', category: 'Contact lens' },
  { code: '92311', description: 'Contact lens fitting, aphakia, one eye', category: 'Contact lens' },
  { code: '92312', description: 'Contact lens fitting, aphakia, both eyes', category: 'Contact lens' },
  { code: '92313', description: 'Contact lens fitting, corneoscleral lens', category: 'Contact lens' },
  { code: '92325', description: 'Modification of contact lens', category: 'Contact lens' },
  { code: '92326', description: 'Replacement of contact lens', category: 'Contact lens' },

  // Spectacle services
  { code: '92340', description: 'Fitting of spectacles, monofocal', category: 'Spectacles' },
  { code: '92341', description: 'Fitting of spectacles, bifocal', category: 'Spectacles' },
  { code: '92342', description: 'Fitting of spectacles, multifocal other than bifocal', category: 'Spectacles' },
  { code: '92352', description: 'Fitting of spectacle prosthesis, monofocal', category: 'Spectacles' },
  { code: '92354', description: 'Fitting of low vision telescopic aid, monofocal', category: 'Spectacles' },
  { code: '92358', description: 'Prosthesis service, temporary spectacle', category: 'Spectacles' },

  // Minor procedures
  { code: '65205', description: 'Removal of superficial conjunctival foreign body', category: 'Procedures' },
  { code: '65210', description: 'Removal of embedded conjunctival foreign body', category: 'Procedures' },
  { code: '65222', description: 'Removal of corneal foreign body with slit lamp', category: 'Procedures' },
  { code: '68761', description: 'Closure of lacrimal punctum by plug', category: 'Procedures' },
  { code: '92499', description: 'Unlisted ophthalmological service or procedure', category: 'Procedures' },
];

export const HCPCS_OPTOMETRY: ProcedureEntry[] = [
  { code: 'S0620', description: 'Routine ophthalmological exam with refraction, new patient', category: 'Eye exam' },
  { code: 'S0621', description: 'Routine ophthalmological exam with refraction, established patient', category: 'Eye exam' },
  { code: 'S0592', description: 'Comprehensive contact lens evaluation', category: 'Contact lens' },

  { code: 'V2020', description: 'Frames, purchases', category: 'Frames' },
  { code: 'V2025', description: 'Deluxe frame', category: 'Frames' },

  { code: 'V2100', description: 'Single vision lens, sphere, plano to plus or minus 4.00', category: 'Single vision' },
  { code: 'V2103', description: 'Single vision lens, sphere 4.25 to 7.00 / cylinder 0.12 to 2.00', category: 'Single vision' },
  { code: 'V2104', description: 'Single vision lens, sphere 4.25 to 7.00 / cylinder 2.12 to 4.00', category: 'Single vision' },
  { code: 'V2199', description: 'Single vision lens, not otherwise classified', category: 'Single vision' },

  { code: 'V2200', description: 'Bifocal lens, sphere plano to plus or minus 4.00', category: 'Bifocal' },
  { code: 'V2203', description: 'Bifocal lens, sphere 4.25 to 7.00 / cylinder 0.12 to 2.00', category: 'Bifocal' },
  { code: 'V2299', description: 'Bifocal lens, not otherwise classified', category: 'Bifocal' },

  { code: 'V2300', description: 'Trifocal lens, sphere plano to plus or minus 4.00', category: 'Trifocal' },
  { code: 'V2399', description: 'Trifocal lens, not otherwise classified', category: 'Trifocal' },

  { code: 'V2500', description: 'Contact lens, PMMA, spherical, per lens', category: 'Contact lens' },
  { code: 'V2510', description: 'Contact lens, gas permeable, spherical, per lens', category: 'Contact lens' },
  { code: 'V2520', description: 'Contact lens, hydrophilic, spherical, per lens', category: 'Contact lens' },
  { code: 'V2521', description: 'Contact lens, hydrophilic, toric, per lens', category: 'Contact lens' },
  { code: 'V2522', description: 'Contact lens, hydrophilic, bifocal, per lens', category: 'Contact lens' },
  { code: 'V2523', description: 'Contact lens, hydrophilic, extended wear, per lens', category: 'Contact lens' },
  { code: 'V2531', description: 'Contact lens, gas permeable, scleral, per lens', category: 'Contact lens' },
  { code: 'V2599', description: 'Contact lens, other type', category: 'Contact lens' },

  { code: 'V2702', description: 'Deluxe lens feature', category: 'Lens add-ons' },
  { code: 'V2710', description: 'Slab-off prism, glass or plastic, per lens', category: 'Lens add-ons' },
  { code: 'V2715', description: 'Prism, per lens', category: 'Lens add-ons' },
  { code: 'V2718', description: 'Press-on lens, Fresnel prism, per lens', category: 'Lens add-ons' },
  { code: 'V2744', description: 'Tint, photochromic, per lens', category: 'Lens add-ons' },
  { code: 'V2745', description: 'Tint, any color, solid or gradient, per lens', category: 'Lens add-ons' },
  { code: 'V2750', description: 'Anti-reflective coating, per lens', category: 'Lens add-ons' },
  { code: 'V2755', description: 'UV lens, per lens', category: 'Lens add-ons' },
  { code: 'V2760', description: 'Scratch resistant coating, per lens', category: 'Lens add-ons' },
  { code: 'V2761', description: 'Mirror coating, per lens', category: 'Lens add-ons' },
  { code: 'V2762', description: 'Polarization, per lens', category: 'Lens add-ons' },
  { code: 'V2781', description: 'Progressive lens, per lens', category: 'Lens add-ons' },
  { code: 'V2784', description: 'Lens, polycarbonate or equal, per lens', category: 'Lens add-ons' },
  { code: 'V2785', description: 'Processing, preserving and transporting corneal tissue', category: 'Other' },
  { code: 'V2797', description: 'Vision supply or accessory, not otherwise specified', category: 'Other' },
  { code: 'V2799', description: 'Vision item or service, miscellaneous', category: 'Other' },
];
