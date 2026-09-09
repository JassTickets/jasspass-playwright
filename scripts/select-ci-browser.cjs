const { randomInt } = require('node:crypto');
const { appendFileSync } = require('node:fs');

const suite = process.argv[2];
const projects = { e2e: null, seating: 'seating-integration', kickback: 'kickback' };
if (!Object.hasOwn(projects, suite)) {
  throw new Error(`Unknown CI suite: ${suite}`);
}
if (!process.env.GITHUB_ENV) {
  throw new Error('GITHUB_ENV is required to persist the selected browser.');
}

// Choose once per job so installation, tests and retries use the same engine.
const browsers = ['chromium', 'firefox', 'webkit'];
const browser = browsers[randomInt(browsers.length)];
const project = projects[suite] ?? browser;
appendFileSync(
  process.env.GITHUB_ENV,
  `PLAYWRIGHT_BROWSER=${browser}\nPLAYWRIGHT_PROJECT=${project}\n`
);
console.log(`[browser] Suite: ${suite}; engine: ${browser}; project: ${project}`);
const reproduction = `PLAYWRIGHT_BROWSER=${browser} npx playwright test --project=${project}`;
console.log(`[browser] Reproduce against Testlab: ${reproduction}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `Suite **${suite}** selected **${browser}**.\n\nReproduce: \`${reproduction}\`\n`
  );
}
