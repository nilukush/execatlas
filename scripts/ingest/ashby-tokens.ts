// Verified 2026-09-21 against api.ashbyhq.com/posting-api/job-board/{token}
// (HTTP 200 with jobs). Fourteen boards, region-spread: openai and cursor and
// lovable as large ongoing pools, clickup and zapier and quora for Americas,
// alan and qonto and photoroom for Europe, oyster remote-global, docker and
// posthog and airbyte and linear and ashby for mixed remote pools.
// Re-verify when adding or pruning boards.
export const ASHBY_TOKENS: string[] = [
  'airbyte',
  'ashby',
  'clickup',
  'cursor',
  'docker',
  'linear',
  'lovable',
  'openai',
  'oyster',
  'photoroom',
  'posthog',
  'qonto',
  'quora',
  'zapier',
];

// tokens whose brand styling differs from naive token capitalization
export const ASHBY_COMPANY_NAMES: Record<string, string> = {
  clickup: "ClickUp",
  openai: "OpenAI",
  posthog: "PostHog",
};
