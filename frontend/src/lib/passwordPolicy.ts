export const PASSWORD_POLICY_SUMMARY =
  "Use at least 8 characters with an uppercase letter, lowercase letter, number, and special character.";

const passwordChecks = [
  {
    id: "length",
    message: "At least 8 characters",
    matches: (password: string) => password.length >= 8,
  },
  {
    id: "uppercase",
    message: "At least 1 uppercase letter",
    matches: (password: string) => /[A-Z]/.test(password),
  },
  {
    id: "lowercase",
    message: "At least 1 lowercase letter",
    matches: (password: string) => /[a-z]/.test(password),
  },
  {
    id: "number",
    message: "At least 1 number",
    matches: (password: string) => /\d/.test(password),
  },
  {
    id: "special",
    message: "At least 1 special character",
    matches: (password: string) => /[!@#$%^&*()_+\-=[\]{};'\\:"|<>?,./`~]/.test(password),
  },
] as const;

export function getPasswordRequirements(password: string) {
  return passwordChecks.map(({ id, message, matches }) => ({
    id,
    message,
    met: matches(password),
  }));
}

export function isPasswordValid(password: string) {
  return getPasswordRequirements(password).every((requirement) => requirement.met);
}

export function getPasswordValidationMessage(password: string) {
  if (isPasswordValid(password)) return null;
  return PASSWORD_POLICY_SUMMARY;
}
