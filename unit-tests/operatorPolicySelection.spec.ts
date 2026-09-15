import { expect, test } from '@playwright/test';
import { addOperatorWithAllPolicies } from '../jasspass-tests/helpers/organizerHelpers';

test.use({ browserName: 'firefox' });

test('all-policy helper waits for the catalog and verifies the saved wildcard grant', async ({ page }) => {
  let savedPolicies: string[] = [];
  await page.route('http://policy.test/**', async route => {
    const request = route.request();
    if (request.method() === 'POST') {
      savedPolicies = request.postDataJSON().Policies;
      await route.fulfill({ status: 200, json: {} });
    } else if (request.url().endsWith('/operators')) {
      await route.fulfill({ json: [{ Email: 'staff@example.com', OperatorDetails: [{ EventId: 'event1', ManualPolicies: savedPolicies }] }] });
    } else {
      await route.fulfill({ contentType: 'text/html', body: `
        <aside><button>Event</button><button style="border-left:2px solid rgb(255,225,103)">Staff</button></aside>
        <input aria-label="Email address">
        <button id="add">Add Event Staff</button>
        <div id="choices"></div>
        <script>
          document.getElementById('add').onclick = () => {
            document.getElementById('choices').innerHTML = '<button id="all" disabled>Select All Policies</button><label><input type="checkbox">Read Ticket</label><label><input type="checkbox">Scan Ticket</label><label><input type="checkbox">Future API Policy</label><button id="save" disabled>Save Policies</button>';
            setTimeout(() => document.getElementById('all').disabled = false, 100);
            document.getElementById('all').onclick = () => {
              document.querySelectorAll('input[type=checkbox]').forEach(x => x.checked = true);
              document.getElementById('all').textContent = 'Unselect All Policies';
              document.getElementById('save').disabled = false;
            };
            document.getElementById('save').onclick = () => fetch('/api/protected/events/event1/operators', {method:'POST', headers:{'Content-Type':'application/json'},body:JSON.stringify({Policies:['*']})});
          };
        </script>` });
    }
  });
  // Browser route interception does not cover APIRequestContext requests.
  // Stub that boundary while checking the exact persisted-read endpoint.
  page.request.get = async url => {
    expect(url).toBe('/api/protected/events/event1/operators');
    return {
      ok: () => true,
      json: async () => [{ Email: 'staff@example.com', OperatorDetails: [{ EventId: 'event1', ManualPolicies: savedPolicies }] }],
    } as Awaited<ReturnType<typeof page.request.get>>;
  };
  await page.goto('http://policy.test/portal/organizer/company/org1/event/event1');
  await addOperatorWithAllPolicies(page, 'staff@example.com');
  expect(savedPolicies).toEqual(['*']);
  await expect(page.getByRole('checkbox', { name: 'Future API Policy' })).toBeChecked();
});
