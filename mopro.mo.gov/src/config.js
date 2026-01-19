module.exports = {
  baseUrl: "https://mopro.mo.gov/license/s/license-search",
  professions: ["Veterinarian", "Veterinary Technician"],
  searchDelay: 1000,      // ms wait after search
  profileDelay: 1500,      // ms wait after opening profile
  headless: false,        // show browser for debugging
  batchSize: 50,          // for pagination if needed
};
