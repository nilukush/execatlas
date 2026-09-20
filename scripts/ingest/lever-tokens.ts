// Verified 2026-09-20 via site:jobs.lever.co discovery searches, probed
// politely against api.lever.co (HTTP 200 with postings). Ten boards:
// spotify and ro as large ongoing pools, pigment/yuno/panopto/finn for
// Europe, qwello.eu for Munich, sambatv and fullscript for US remote,
// netomi for Remote - India. Company names derive from the token.
// Re-verify when adding or pruning boards.
export const LEVER_TOKENS: string[] = [
  'finn',
  'fullscript',
  'netomi',
  'panopto',
  'pigment',
  'qwello.eu',
  'ro',
  'sambatv',
  'spotify',
  'yuno',
];

// tokens whose brand styling differs from naive token capitalization
export const LEVER_COMPANY_NAMES: Record<string, string> = {
  finn: "FINN",
  sambatv: "Samba TV",
};
