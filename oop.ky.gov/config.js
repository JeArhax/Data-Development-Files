module.exports = {
  baseUrl: "https://oop.ky.gov/lic_search.aspx",
  
  // Use empty string "" for "All" statuses
  statuses: [""], // "All" status - gets everything
  
  // Board checkbox to check (Veterinary Medicine)
  boardCheckbox: "#ContentPlaceHolder2_chkBoards_24",
  
  // Delays (in milliseconds)
  delays: {
    afterCheck: 1500,
    afterStatusSelect: 1000,
    afterTyping: 800,
    afterSearch: 3000,
    afterScroll: 1000,
    betweenSeeds: 1200,
  },
  
  // Selectors
  selectors: {
    boardCheckbox: "#ContentPlaceHolder2_chkBoards_24",
    status: "#ContentPlaceHolder2_DStatus",
    lastNameInput: "#ContentPlaceHolder2_TLname",
    searchButton: "#ContentPlaceHolder2_BSrch",
    dataContainer: "#ContentPlaceHolder2_LData",
    scrollToBottom: "#ContentPlaceHolder2_ui_btnPageBottom",
    resultsTable: ".tablestyle13",
  },
};
