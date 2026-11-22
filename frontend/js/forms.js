function text(input, key) {
  return input && typeof input[key] === "string" ? input[key].trim() : "";
}

function validEmail(email) {
  var parts = email.split("@");
  if (email.length > 254 || parts.length !== 2 || parts[0].length > 64 ||
      parts[0].startsWith(".") || parts[0].endsWith(".") || parts[0].includes("..")) return false;
  return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(parts[0]) &&
    parts[1].split(".").every(function (label) { return label.length <= 63; }) &&
    /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/.test(parts[1]);
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

function subscriber(input) {
  var values = { email: text(input, "email").toLowerCase() };
  var errors = {};
  if (!validEmail(values.email)) {
    errors.email = "Enter a valid email address (up to 254 characters).";
  }
  return { values: values, errors: errors };
}

// Shared by the signup form and POST /api/v1/account/register. The password is
// returned alongside the stored values so the server can hash it; it is never
// part of the saved record.
function registration(input) {
  var values = {
    name: text(input, "name"),
    email: text(input, "email").toLowerCase(),
    phone: text(input, "phone"),
    password: input && typeof input.password === "string" ? input.password : ""
  };
  var errors = {};
  if (values.name.length < 2 || values.name.length > 100 || /[\x00-\x1f\x7f]/.test(values.name)) {
    errors.name = "Enter your name (2–100 characters).";
  }
  if (!validEmail(values.email)) {
    errors.email = "Enter a valid email address (up to 254 characters).";
  }
  if (values.phone && !/^\+?[0-9][0-9 ()-]{6,19}$/.test(values.phone)) {
    errors.phone = "Enter a phone number, or leave it blank.";
  }
  if (values.password.length < 8 || values.password.length > 128) {
    errors.password = "Use a password between 8 and 128 characters.";
  } else if (values.password.toLowerCase().indexOf(values.email.split("@")[0]) === 0 &&
      values.email.split("@")[0].length >= 8) {
    errors.password = "Choose a password that is not your email address.";
  }
  return { values: values, errors: errors };
}

function credentials(input) {
  var values = {
    email: text(input, "email").toLowerCase(),
    password: input && typeof input.password === "string" ? input.password : ""
  };
  var errors = {};
  if (!validEmail(values.email)) {
    errors.email = "Enter the email address on your account.";
  }
  if (values.password.length === 0 || values.password.length > 128) {
    errors.password = "Enter your password.";
  }
  return { values: values, errors: errors };
}

export { contact, subscriber, registration, credentials, validEmail };
