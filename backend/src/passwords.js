import bcrypt from "bcrypt";

const bcryptRounds = 12;
export const bcryptHashPattern = /^\$2[ab]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export function hashPassword(password) {
  return bcrypt.hash(password, bcryptRounds);
}

export async function passwordMatches(password, stored) {
  if (!bcryptHashPattern.test(stored) || Buffer.byteLength(password, "utf8") > 72) return false;
  return bcrypt.compare(password, stored);
}
