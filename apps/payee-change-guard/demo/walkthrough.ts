import type { DemoScript } from '@x10/shared/demo';

const ALEX = 'demo-admin-alex';
const SAM = 'demo-clerk-sam';
const PRIYA = 'demo-clerk-priya';
const JORDAN = 'demo-controller-jordan';
const LINDQVIST = '[data-testid="boat"][data-supplier="Lindqvist Industrial Parts GmbH"]';

export const script: DemoScript = {
  title: 'Payee Change Guard: every supplier bank-detail change called back and approved by a second person',
  persona: ALEX,
  scenes: [
    {
      id: 'hook',
      say: [
        'Supplier bank-detail fraud starts with one email asking a clerk to change where a supplier gets paid.',
        'Here every change rises through a lock flight: request, call-back, second approval, then release.',
      ],
      async run(h) {
        await h.goto('/', ALEX);
        await h.pause(3000);
        await h.hover(h.page.locator(LINDQVIST));
        await h.pause(2000);
      },
    },
    {
      id: 'canal',
      say: ['Each boat is a change request in the chamber of the gate it has reached; pennants are red flags, and this one flies four.'],
      async run(h) {
        await h.spotlight(h.page.locator(LINDQVIST), 3000);
      },
    },
    {
      id: 'lens',
      say: ['Switch the lens to flags and every hull is painted by how many flags it carries.'],
      async run(h) {
        await h.click(h.page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name: /Flags/ }));
        await h.pause(3000);
      },
    },
    {
      id: 'today',
      say: [
        'Today ranks what needs attention: the four-flag change, one account shared by two suppliers, and a call-back still waiting.',
        'Choosing an item flies me to the boat behind it.',
      ],
      async run(h) {
        await h.spotlight(h.page.getByRole('complementary', { name: 'Today' }), 2500);
        await h.click(h.page.getByRole('button', { name: /Lindqvist Industrial Parts GmbH change flies 4 red flags/ }));
        await h.pause(2500);
      },
    },
    {
      id: 'freeze',
      say: ['A domestic payment run is due tomorrow, so the second key is frozen, and the sign says exactly when it opens.'],
      async run(h) {
        await h.page.keyboard.press('Escape');
        await h.spotlight(h.page.getByTestId('freeze-plaque'), 3500);
      },
    },
    {
      id: 'view-as',
      say: ['View as a clerk, and only the call-backs waiting on me stay lit.'],
      async run(h) {
        await h.click(h.page.getByRole('radiogroup', { name: 'View as' }).getByRole('radio', { name: 'Clerk' }));
        await h.pause(3000);
        await h.click(h.page.getByRole('radiogroup', { name: 'View as' }).getByRole('radio', { name: 'All' }));
      },
    },
    {
      id: 'call-back',
      say: [
        'The call-back screen shows only the number already on file, never the one in the letter.',
        'Dial the number from the letter instead, and the app says plainly that this call cannot open the gate.',
      ],
      async run(h) {
        await h.goto('/callback', PRIYA);
        await h.click(h.page.getByTestId('queue-item').filter({ hasText: 'Harbourline Shipping' }));
        await h.spotlight(h.page.getByTestId('number-on-file'), 2500);
        await h.type(h.page.getByLabel('Number you dialled'), '+44 7700 900123');
        await h.spotlight(h.page.getByTestId('number-mismatch'), 3000);
      },
    },
    {
      id: 'separation',
      say: ['Sam raised the Lindqvist change, so the second key refuses him.'],
      async run(h) {
        await h.goto('/second-key', SAM);
        await h.click(h.page.getByTestId('queue-item').filter({ hasText: 'Lindqvist Industrial Parts GmbH' }));
        await h.spotlight(h.page.getByTestId('key-blocked'), 3000);
      },
    },
    {
      id: 'second-key',
      say: [
        'Jordan, the finance controller, sees every flag with its reason, including the account already on file for another supplier.',
        'With four flags up, approving needs a written override reason, and it goes into the ledger.',
      ],
      async run(h) {
        await h.goto('/second-key', JORDAN);
        await h.click(h.page.getByTestId('queue-item').filter({ hasText: 'Lindqvist Industrial Parts GmbH' }));
        await h.spotlight(h.page.getByTestId('flag-list'), 3000);
        await h.click(h.page.getByTestId('approve'));
        await h.spotlight(h.page.getByTestId('decision-panel'), 1500);
        await h.type(h.page.getByLabel('Override reason'), 'Finance director visited with ID and a signed bank letter.');
      },
    },
    {
      id: 'rise',
      say: ['The second key turns, the gate opens, and the boat rises into the next chamber.'],
      async run(h) {
        await h.click(h.page.getByTestId('approve'));
        await h.pause(5000);
      },
    },
    {
      id: 'takeaway',
      say: ['A known number, a second person, a freeze before every run, and no full account number stored anywhere.'],
      async run(h) {
        await h.page.keyboard.press('Escape');
        await h.pause(3500);
      },
    },
  ],
};
