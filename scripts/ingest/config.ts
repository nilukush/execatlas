import { workableSeedQueries } from "../../src/lib/roles";

export { GREENHOUSE_TOKENS } from "./greenhouse-tokens";

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

export const ARBEITNOW_PAGES = 4;

export const JOBICY_COUNT = 100;
