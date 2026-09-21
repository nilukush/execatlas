import { workableSeedQueries } from "../../src/lib/roles";

export { GREENHOUSE_TOKENS } from "./greenhouse-tokens";
export { LEVER_TOKENS } from "./lever-tokens";
export { ASHBY_TOKENS, ASHBY_COMPANY_NAMES } from "./ashby-tokens";
export { LEVER_COMPANY_NAMES } from "./lever-tokens";

/**
 * Workable's public search understands region names, so we query broadly at
 * the region level and filter to countries afterward.
 */
export const WORKABLE_LOCATIONS = [
  "Middle East",
  "Southeast Asia",
  "Europe",
  "India",
  "United States",
  "Canada",
  "Mexico",
  "North Africa",
  "United Arab Emirates",
  "Saudi Arabia",
  "Qatar",
  "Singapore",
];

export const WORKABLE_QUERIES = workableSeedQueries();

export const ARBEITNOW_PAGES = 10;

// Jobicy tag searches: the API accepts a tag filter the plain feed lacks,
// so seed queries reach leadership roles beyond the newest slice
export const JOBICY_TAGS = [
  "head of engineering",
  "director of engineering",
  "vp of engineering",
  "chief technology officer",
];

export const JOBICY_COUNT = 100;
