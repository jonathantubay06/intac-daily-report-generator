function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

// Unset variable -> null, so `splitList(x) || default` uses the default.
// Set but empty (NAME=) -> [] and means "none" on purpose.
function splitList(s) {
  if (s === undefined) return null;
  return s.split(',').map(x => x.trim()).filter(Boolean);
}

export const config = {
  crmUrl: process.env.CRM_URL || 'https://crm.intacadvisory.com',
  crmUser: process.env.CRM_USER || '',
  crmPassword: process.env.CRM_PASSWORD || '',

  teamPassword: process.env.TEAM_PASSWORD || (() => { throw new Error('TEAM_PASSWORD is not set in .env'); })(),

  allowedOrigins: splitList(process.env.ALLOWED_ORIGINS) || ['*'],

  recipients: {
    'non-ga': {
      to: splitList(process.env.NONGA_TO) || [
        'charlie@sentrystrategy.com',
        'charlie@sentrystrategy.com',
        'bill@globalcorrosion.com',
      ],
      cc: splitList(process.env.NONGA_CC) || [
        'nick.le@sentrystrategy.com',
        'vananh.le@sentryxp.com',
      ],
      subject: (date) => `Intac Daily Reporting - Non-GA - ${date}`,
      // Tue-Fri "Daily" mode reuses the Non-GA recipients with a plain subject.
      dailySubject: (date) => `Intac Daily Reporting - ${date}`,
    },
    ga: {
      to: splitList(process.env.GA_TO) || [
        'charlie@sentrystrategy.com',
        'charlie@sentrystrategy.com',
        'bill@globalcorrosion.com',
      ],
      cc: splitList(process.env.GA_CC) || [
        'nick.le@sentrystrategy.com',
        'vananh.le@sentryxp.com',
      ],
      subject: (date) => `Intac Daily Reporting - GA - ${date}`,
    },
  },

  from: process.env.MAIL_FROM || 'Jonathan Tubay <jonathan@sentrystrategy.com>',
};

export { required };
