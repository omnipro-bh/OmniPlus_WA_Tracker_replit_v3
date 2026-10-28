// Demo account subscription exemption.
//
// The Demo account (Demo@gmail.com) runs on a Whapi sandbox channel that is
// meant to stay permanently available for demonstrations. Its channel is
// therefore exempt from the channel-expiry check that pauses every other
// account when `channels.expires_at` runs out.
//
// This is a deliberately narrow, hardcoded exception: every guard calls
// `isSubscriptionExempt()` and nothing else changes, so behaviour for normal
// users is untouched. If the demo account ever needs to be data-driven, this
// helper is the single seam to swap for a `users.is_demo_account` flag.
//
// SCOPE — what this does NOT do:
//   * It does not revive the channel on Whapi's side. As of this change the
//     gate instance for MANTIS-6D23Z is dead (expired at Whapi, `stopped:true`,
//     `/health` -> 404 "Channel not found"). Extending it
//     (POST manager /channels/MANTIS-6D23Z/extend) and a possible QR re-scan
//     are a separate, one-time manual follow-up — not a code change.
//   * It does not touch `authStatus`. The stored `AUTHORIZED` value is stale
//     metadata left over from the worker pause path; it is handled with the
//     Whapi revive above, not here.
//   * It does not touch the Admin "Add Days" flow.

export const DEMO_ACCOUNT_EMAIL = "demo@gmail.com";

export function isSubscriptionExempt(email?: string | null): boolean {
  return (email ?? "").trim().toLowerCase() === DEMO_ACCOUNT_EMAIL;
}
