# Administrator guide

Administrators operate the authenticated **Admin** dashboard. This role provides platform oversight; it does not replace the organizer's or referee's on-chain wallet authority.

## Prerequisites

- A GGG account assigned the **ADMIN** role.
- Use the Testnet application only.

## Oversight tasks

1. Sign in. The dashboard navigation shows **Admin** only for an administrator.
2. Open **Admin** to view platform counts and entry points for users and tournaments.
3. Use **Users** to inspect an account, update its app role, reset a password, or delete an account when appropriate.
4. Use **Tournaments** to inspect platform records and correct permitted metadata.

## Important boundaries

- Admin role changes affect GGG app access, not an on-chain wallet's organizer/referee authority.
- **Cancel Tournament (DB only)** changes the database record only; it does not cancel the escrow contract. The configured organizer must submit the on-chain cancellation with their wallet.
- Never request, record, or share a user's wallet seed phrase, recovery phrase, private key, or signed transaction data.

## Troubleshooting

- If **Admin** is absent from navigation, sign in with an account assigned the ADMIN role.
- If an on-chain action is needed, direct the configured organizer or referee to the appropriate role guide; an admin session is not a wallet authorization.
