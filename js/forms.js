(function (root, factory) {
  var forms = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = forms;
  } else {
    root.TruckBhaiForms = forms;
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  function text(input, key) {
    return input && typeof input[key] === "string" ? input[key].trim() : "";
  }

  function validEmail(email) {
    return email.length <= 254 && /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/.test(email);
  }

  function contact(input) {
    var values = { name: text(input, "name"), email: text(input, "email"), message: text(input, "message") };
    var errors = {};
    if (values.name.length < 2 || values.name.length > 100 || /[\x00-\x1f\x7f]/.test(values.name)) {
      errors.name = "Enter your name (2–100 characters).";
    }
    if (!validEmail(values.email)) {
      errors.email = "Enter a valid email address (up to 254 characters).";
    }
    if (values.message.length < 10 || values.message.length > 5000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(values.message)) {
      errors.message = "Enter a message between 10 and 5,000 characters.";
    }
    return { values: values, errors: errors };
  }

  return { contact: contact };
});
