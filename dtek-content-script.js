(function() {
  'use strict';

  function setCity() {
    console.log("setCity");
    const cityInput = document.querySelector("#city");
    if (cityInput?.classList.contains("active")) {
      cityInput.value = "Обухів (Обухівський)";
      cityInput.dispatchEvent(new KeyboardEvent('keyup', {'key': ''}));
      cityInput.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      document.querySelectorAll("#cityautocomplete-list div").forEach(e => {
        if (e.innerText == "Обухів (Обухівський)") e.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      setSreet();
    }
    else setTimeout(() => { setCity() }, 200);
  }
  function setSreet() {
    console.log("setSreet");
    const streetInput = document.querySelector("#street");
    if (streetInput?.classList.contains("active")) {
      streetInput.value = "Миру";
      streetInput.dispatchEvent(new KeyboardEvent('keyup', {'key': ''}));
      streetInput.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      document.querySelectorAll("#streetautocomplete-list div").forEach(e => {
        if (e.innerText == "Миру") e.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      setHouse();
    }
    else setTimeout(() => { setSreet() }, 200);
  }
  function setHouse() {
    console.log("setHouse");
    const houseInput = document.querySelector("#house_num");
    if (houseInput?.classList.contains("active")) {
      houseInput.value = "1";
      houseInput.dispatchEvent(new KeyboardEvent('keyup', {'key': ''}));
      houseInput.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      document.querySelectorAll("#house_numautocomplete-list div").forEach(e => {
        if (e.innerText == "1") e.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }
    else setTimeout(() => { setHouse() }, 200);
  }
  setCity();
})();