export function recordReference(record) {
  return record?.id ?? record?._id;
}

export function selectPublicFields(record, fields) {
  return Object.fromEntries(fields.map(field => [
    field, field === "id" ? recordReference(record) : record[field]
  ]));
}
