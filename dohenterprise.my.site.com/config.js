module.exports = {
  baseUrl: "https://dohenterprise.my.site.com/ver/s/",
  profession: "VETERINARY EXAMINERS",
  licenseTypes: ["VETERINARIAN"],
  statuses: ["0"],
  
  // Delays (in milliseconds)
  delays: {
    betweenSearches: 500,
    afterSearch: 2000,
    typing: 20,
  },
  
  // Selectors
  selectors: {
    profession: "#Proffession",
    licenseType: "#LicenseType",
    status: "#Status",
    lastName: "#LastName",
    searchButton: "a.slds-button.slds-button_brand",
    searchAgainButton: "a.slds-button.slds-button_brand",
    resultsTable: "table.slds-table.slds-table--bordered tr",
  },
};
