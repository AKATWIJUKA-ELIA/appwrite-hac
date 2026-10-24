/**
 * Nothing leaves without a click, and never to more than this many suppliers
 * at once. Enforced by approveAndSend on the server; the UI reads it only to
 * explain itself before the click.
 */
export const MAX_RECIPIENTS = 5;
