export function isFieldCopilotAuthEnabled(value: string | undefined) {
  return value?.trim().toLowerCase() !== "false";
}
