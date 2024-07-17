(function() {
  'use strict';

  let cityInput = document.querySelector("#city");
  let streetInput = document.querySelector("#street");
  let houseInput = document.querySelector("#house_num");
  let setAddressTimeout;
  
  //cityInput.addEventListener("change", () => saveAddress());
  //streetInput.addEventListener("change", () => saveAddress());
  //houseInput.addEventListener("change", () => saveAddress());

  function saveAddress() {
    console.log("saveAddress");
  }

  function setAddress(address) {
    if (setAddressTimeout) clearTimeout(setAddressTimeout);
    
    if (typeof address.city !== "undefined" && cityInput.value != address.city) {
      if (! cityInput.classList.contains("active")) {
        setAddressTimeout = setTimeout(() => { setAddress(address) }, 100);
        return;
      }
      console.log("setCity");
      cityInput.value = address.city;
      cityInput.dispatchEvent(new KeyboardEvent('keyup', {'key': ''}));
      cityInput.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      let cityItem = Array.from(document.querySelectorAll("#cityautocomplete-list div")).find(e => e.innerText == address.city);
      if (cityItem) cityItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }

    if (typeof address.street !== "undefined" && streetInput.value != address.street) {
      if (! cityInput.classList.contains("active")) {
        setAddressTimeout = setTimeout(() => { setAddress(address) }, 100);
        return;
      }
      console.log("setSreet");
      streetInput.value = address.street;
      streetInput.dispatchEvent(new KeyboardEvent('keyup', {'key': ''}));
      streetInput.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      let streetItem = Array.from(document.querySelectorAll("#streetautocomplete-list div")).find(e => e.innerText == address.street);
      if (streetItem) streetItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }

    if (typeof address.house !== "undefined" && streetInput.value != address.house) {
      if (! houseInput.classList.contains("active")) {
        setAddressTimeout = setTimeout(() => { setAddress(address) }, 100);
        return;
      }
      console.log("setHouse");
      houseInput.value = address.house;
      houseInput.dispatchEvent(new KeyboardEvent('keyup', {'key': ''}));
      houseInput.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      let houseItem = Array.from(document.querySelectorAll("#house_numautocomplete-list div")).find(e => e.innerText == address.house);
      if (houseItem) houseItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
  }
  setAddress({ city: "Обухів (Обухівський)", street: "Миру", house: "1" });
})();