/**
 * Creates a FormData object with a file appended
 * @param file - The file to append to FormData
 * @param fieldName - The field name for the file (default: "file")
 * @returns FormData instance with the file appended
 */
export function createFileFormData(file: File, fieldName: string = "file"): FormData {
  const formData = new FormData();
  formData.append(fieldName, file);
  return formData;
}

