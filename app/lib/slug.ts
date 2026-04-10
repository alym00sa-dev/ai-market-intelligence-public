export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
}

export function fromSlug(slug: string, companyNames: string[]): string | undefined {
  return companyNames.find((c) => toSlug(c) === slug)
}
