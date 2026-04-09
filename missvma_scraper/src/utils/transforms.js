/**
 * utils/transforms.js
 *
 * Data transformation helpers:
 *  - camelCase key normalisation
 *  - object flattening for CSV export
 *  - primary field mapping to internal schema
 */

/**
 * Convert snake_case / PascalCase / kebab-case / space-separated string to camelCase.
 * Preserves already-camelCase strings.
 *
 * @param {string} str
 * @returns {string}
 */
function toCamelCase(str) {
  if (!str || typeof str !== 'string') return str;

  // Replace non-alphanumeric separators with a space, then camelCase
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^(.)/, (c) => c.toLowerCase());
}

/**
 * Recursively reformat all keys in an object/array to camelCase.
 * Preserves data types and nesting.
 *
 * @param {*} obj
 * @returns {*}
 */
function formatKeyNamesToCamelCase(obj) {
  if (Array.isArray(obj)) {
    return obj.map(formatKeyNamesToCamelCase);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [toCamelCase(k), formatKeyNamesToCamelCase(v)])
    );
  }
  return obj;
}

/**
 * Flatten a nested object for CSV output.
 * Arrays of primitives → comma-joined string.
 * Arrays of objects → JSON.stringify (stored in one cell, parseable later).
 * Nested objects → dot-notation keys.
 *
 * @param {object} obj
 * @param {string} prefix
 * @returns {object}
 */
function flattenObject(obj, prefix = '') {
  const result = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value === null || value === undefined) {
      result[fullKey] = '';
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        result[fullKey] = '';
      } else if (typeof value[0] === 'object' && value[0] !== null) {
        // Array of objects → stringify for single CSV cell
        result[fullKey] = JSON.stringify(value);
      } else {
        // Array of primitives → join
        result[fullKey] = value.join(', ');
      }
    } else if (typeof value === 'object') {
      const nested = flattenObject(value, fullKey);
      Object.assign(result, nested);
    } else {
      result[fullKey] = value;
    }
  }

  return result;
}

/**
 * Map raw MemberClicks directory listing fields to the internal schema.
 * Unmapped fields are preserved in camelCase under their original name.
 *
 * Primary contact fields (Section 2.1.1 of guidelines):
 *
 *   fullName, firstName, lastName
 *   companyEmail / profileEmail
 *   companyPhone / profilePhone
 *   companyLocation / profileLocation
 *   companyWebsiteUrl / profileWebsiteUrl
 *   sourceUrl, currentPageUrl, scrapedAt
 *
 * MVMA-specific mapped fields (prefixed appropriately):
 *   companyName  ← Organization / Clinic
 *   companyType  ← Business Type
 *   profileTitle ← (not present on MVMA but reserved)
 *   profileSpecies   ← Species Seen
 *   profileSkills    ← Skills / Special Interests
 *   profileDiscounts ← Discounts / Special Programs
 *   profileDegrees   ← Degrees / Certifications
 *   profilePracticeOffers ← Practice Offers
 *
 * @param {object} raw      - raw parsed fields (camelCase keys already applied)
 * @param {string} sourceUrl
 * @param {string} currentPageUrl
 * @returns {object}
 */
function mapToSchema(raw, sourceUrl, currentPageUrl) {
  const now = new Date().toISOString();

  // Helper: grab first truthy value from a list of candidate keys
  const pick = (...keys) => {
    for (const k of keys) {
      if (raw[k] !== undefined && raw[k] !== null && raw[k] !== '') return raw[k];
    }
    return undefined;
  };

  const mapped = {
    // ── Primary contact fields ──────────────────────────────────────────────
    fullName:  pick('fullName', 'name', 'displayName'),
    firstName: pick('firstName', 'first', 'fname'),
    lastName:  pick('lastName',  'last',  'lname'),

    companyName:       pick('companyName', 'organization', 'clinic', 'practice', 'businessName'),
    companyEmail:      pick('companyEmail', 'email', 'emailAddress'),
    companyPhone:      pick('companyPhone', 'phone', 'phoneNumber', 'businessPhone'),
    companyLocation:   pick('companyLocation', 'location', 'address', 'city', 'cityState'),
    companyWebsiteUrl: pick('companyWebsiteUrl', 'website', 'websiteUrl', 'url', 'businessWebsite'),
    companyType:       pick('companyType', 'businessType', 'practiceType'),

    // ── Profile-level fields ────────────────────────────────────────────────
    profileSpecies:       pick('profileSpecies', 'species', 'speciesSeen', 'animals'),
    profileSkills:        pick('profileSkills', 'skills', 'specialInterests', 'skillsSpecialInterests'),
    profileDiscounts:     pick('profileDiscounts', 'discounts', 'specialPrograms', 'discountsSpecialPrograms'),
    profileDegrees:       pick('profileDegrees', 'degrees', 'certifications', 'degreesCertifications'),
    profilePracticeOffers: pick('profilePracticeOffers', 'practiceOffers', 'servicesOffered'),

    // ── Metadata ────────────────────────────────────────────────────────────
    sourceUrl,
    currentPageUrl,
    scrapedAt: now,
  };

  // Remove undefined primary fields (keep null/'' to signal "field present but empty")
  const cleanMapped = Object.fromEntries(
    Object.entries(mapped).filter(([, v]) => v !== undefined)
  );

  // Collect remaining raw fields not already captured
  const handledRaw = new Set([
    'fullName','name','displayName','firstName','first','fname','lastName','last','lname',
    'companyName','organization','clinic','practice','businessName',
    'companyEmail','email','emailAddress',
    'companyPhone','phone','phoneNumber','businessPhone',
    'companyLocation','location','address','city','cityState',
    'companyWebsiteUrl','website','websiteUrl','url','businessWebsite',
    'companyType','businessType','practiceType',
    'profileSpecies','species','speciesSeen','animals',
    'profileSkills','skills','specialInterests','skillsSpecialInterests',
    'profileDiscounts','discounts','specialPrograms','discountsSpecialPrograms',
    'profileDegrees','degrees','certifications','degreesCertifications',
    'profilePracticeOffers','practiceOffers','servicesOffered',
  ]);

  const extra = Object.fromEntries(
    Object.entries(raw).filter(([k]) => !handledRaw.has(k))
  );

  return { ...cleanMapped, ...extra };
}

module.exports = { toCamelCase, formatKeyNamesToCamelCase, flattenObject, mapToSchema };
