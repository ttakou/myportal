/**
 * The ways one account can be signed in to.
 *
 * A person who signs in with Google on one day and Microsoft on another does
 * not get one account with two doors — Supabase creates a second user, because
 * an identity is only merged into an existing one when the verified email
 * addresses match, and a personal Google address never matches a work one. The
 * result is two profiles for one human: goals written under one, recognition
 * received under the other, a reporting line hanging off whichever they
 * happened to use, and no screen anywhere that says why.
 *
 * Listing the doors is the first half of the fix — you cannot link what you
 * cannot see. The shaping lives here, away from the browser client, so the
 * rules about what may be removed are testable.
 */

/** The providers this portal offers. Anything else is shown but not offered. */
export const KNOWN_PROVIDERS = ["email", "azure", "google"] as const;
export type KnownProvider = (typeof KNOWN_PROVIDERS)[number];

const LABEL: Record<string, string> = {
  email: "Email and password",
  azure: "Microsoft",
  google: "Google",
};

/** What a provider is called in front of a person. */
export function providerLabel(provider: string): string {
  return LABEL[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}

/** The shape `supabase.auth.getUserIdentities()` returns, narrowed to what we read. */
export interface AuthIdentityLike {
  identity_id?: string | null;
  provider: string;
  identity_data?: { email?: string | null } | null;
}

export interface SignInMethod {
  provider: string;
  label: string;
  /** The address the provider knows them by — often not the account's own. */
  email: string | null;
  linked: boolean;
  /** Identifies the identity to unlink; null when this method is not linked. */
  identityId: string | null;
  /**
   * Removing the last way in locks the account out, and Supabase refuses it
   * anyway. Better to grey the button than to explain the error afterwards.
   */
  canRemove: boolean;
  /** A password is set, not linked, so it gets no "Link" button. */
  canLink: boolean;
}

/**
 * Every sign-in method, linked or not, in the order the login page offers them.
 *
 * Unlinked providers are listed too: the whole point of the screen is to show
 * somebody that Microsoft is *not* attached to the account they are looking at,
 * which is the thing nobody could see before.
 */
export function signInMethods(identities: AuthIdentityLike[]): SignInMethod[] {
  const byProvider = new Map<string, AuthIdentityLike>();
  for (const i of identities) {
    // First wins: duplicates for one provider cannot both be unlinked usefully.
    if (!byProvider.has(i.provider)) byProvider.set(i.provider, i);
  }
  const linkedCount = byProvider.size;

  const extras = [...byProvider.keys()]
    .filter((p) => !(KNOWN_PROVIDERS as readonly string[]).includes(p))
    .sort();

  return [...KNOWN_PROVIDERS, ...extras].map((provider) => {
    const identity = byProvider.get(provider);
    const linked = identity !== undefined;
    return {
      provider,
      label: providerLabel(provider),
      email: identity?.identity_data?.email ?? null,
      linked,
      identityId: identity?.identity_id ?? null,
      canRemove: linked && linkedCount > 1,
      canLink: !linked && provider !== "email",
    };
  });
}

/**
 * Turn a link failure into something a person can act on.
 *
 * `linkIdentity` fails with a bare "Manual linking is disabled" when the
 * project setting is off, which reads as a bug rather than a switch somebody
 * has to flip, and the provider-already-taken case is the exact situation this
 * screen exists to resolve.
 */
export function linkErrorMessage(raw: string): string {
  if (/manual linking is disabled|manual_linking_disabled/i.test(raw)) {
    return "Linking is switched off for this workspace. An administrator has to enable manual linking in the Supabase authentication settings before accounts can be joined here.";
  }
  if (/already (been )?(taken|linked|registered)|identity_already_exists/i.test(raw)) {
    return "That sign-in already belongs to another account in this portal. It has to be released from that account before it can be linked here — ask an administrator to merge the two.";
  }
  return raw;
}
