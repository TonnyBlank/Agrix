type DigitOptions = {
  maxLength?: number;
};

type DecimalOptions = {
  maxDecimals?: number;
  allowNegative?: boolean;
};

export function sanitizeDigits(value: string, options?: DigitOptions) {
  const digits = value.replace(/\D+/g, "");
  if (options?.maxLength === undefined) return digits;
  return digits.slice(0, options.maxLength);
}

export function sanitizePhoneInput(value: string, options?: DigitOptions) {
  const trimmedStart = value.trimStart();
  const digits = sanitizeDigits(trimmedStart, { maxLength: options?.maxLength ?? 12 });

  if (trimmedStart.startsWith("+")) {
    return digits ? `+${digits}` : "+";
  }

  return digits;
}

export function sanitizeDecimalInput(value: string, options?: DecimalOptions) {
  const allowNegative = options?.allowNegative ?? false;
  const maxDecimals = options?.maxDecimals ?? 2;
  let sanitized = "";
  let hasDecimal = false;

  for (const char of value) {
    if (char >= "0" && char <= "9") {
      sanitized += char;
      continue;
    }

    if (char === "." && !hasDecimal) {
      sanitized = sanitized || "0";
      sanitized += ".";
      hasDecimal = true;
      continue;
    }

    if (char === "-" && allowNegative && !sanitized) {
      sanitized = "-";
    }
  }

  if (!hasDecimal) return sanitized;

  const isNegative = sanitized.startsWith("-");
  const unsigned = isNegative ? sanitized.slice(1) : sanitized;
  const [wholePart, decimalPart = ""] = unsigned.split(".");
  const clampedDecimals = decimalPart.slice(0, Math.max(0, maxDecimals));
  const rebuilt = `${wholePart}.${clampedDecimals}`;

  return isNegative ? `-${rebuilt}` : rebuilt;
}

export function sanitizeCoordinateInput(value: string) {
  return sanitizeDecimalInput(value, { allowNegative: true, maxDecimals: 6 });
}

export function normalizeKenyanPhone(value: string) {
  const digits = sanitizeDigits(value, { maxLength: 12 });

  if (!digits) return "";
  if (digits.startsWith("254") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `+254${digits.slice(1)}`;
  if ((digits.startsWith("7") || digits.startsWith("1")) && digits.length === 9) return `+254${digits}`;

  return value.trim();
}

export function isValidKenyanPhone(value: string) {
  return /^\+254[17]\d{8}$/.test(normalizeKenyanPhone(value));
}
