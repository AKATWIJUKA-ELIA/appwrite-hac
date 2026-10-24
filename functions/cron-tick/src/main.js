// Quotebook's scheduler. Appwrite runs this function every hour and it
// asks the site to do its periodic work: send follow-ups to suppliers who have
// not replied, and fail requests whose background job died so they can be
// retried. The work itself lives in the site (/api/cron/tick); this function
// only provides the clock.
export default async ({ res, log, error }) => {
  const url = process.env.TICK_URL;
  const secret = process.env.CRON_SECRET;
  if (!url || !secret) {
    error("TICK_URL or CRON_SECRET is not set on this function");
    return res.json({ ok: false, reason: "not configured" }, 500);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
  const body = await response.text();
  if (response.ok) log(`tick ok: ${body.slice(0, 300)}`);
  else error(`tick failed: HTTP ${response.status} ${body.slice(0, 300)}`);

  return res.json({ status: response.status, body: body.slice(0, 500) }, response.ok ? 200 : 502);
};
