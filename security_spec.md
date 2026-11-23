# TablePulse Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Default-Deny Catch-All**: No unconfigured path may ever be read or written.
2. **Restaurant Ownership & Admin Authority**: Only the verified Platform Super Admin (`20781a05g8raj@gmail.com` with `email_verified == true` or `/admins/{uid}`) or a verified Restaurant Owner (`ownerId == request.auth.uid`) may modify restaurant metadata or staff rosters.
3. **Subcollection Master Gate**: Every write to `menuItems`, `orders`, and `staff` verifies the parent `/restaurants/{restaurantId}` exists and validates `restaurantId` consistency.
4. **Staff PII Isolation**: `staff/{staffId}` contains `email`; reads are strictly limited to Super Admin, the Restaurant Owner, or the staff member themselves (`resource.data.userId == request.auth.uid`).
5. **Order Terminal State Locking**: Once an order reaches `served` or `cancelled`, non-admin users cannot mutate it.
6. **Temporal & Immutable Integrity**: `createdAt` and `updatedAt` are strictly validated against `request.time`; `ownerId`, `restaurantId`, `customerUid`, and `createdAt` are immutable after creation.
7. **Strict Key & Size Guards**: Every document enforces `hasAll` + `hasOnly` on create, `affectedKeys().hasOnly(...)` on update, `isValidId()` on single-doc paths, and `.size()` limits on all strings and bounded arrays (`items.size() <= 30`).

## 2. The "Dirty Dozen" Payloads (All Must Fail with PERMISSION_DENIED)
1. **Shadow Field Injection on Restaurant Create**: `{ ...validRestaurant, isVerifiedSuperPartner: true }`
2. **Identity Spoofing on Restaurant Create**: `{ ...validRestaurant, ownerId: "other_user_uid" }`
3. **Unverified Email Admin Spoof**: Auth token has `email: "20781a05g8raj@gmail.com"`, `email_verified: false` attempting admin write.
4. **Resource Poisoning via Giant Document ID**: `restaurants/${'a'.repeat(500)}`
5. **Non-Owner Menu Price Tampering**: Customer attempts to update `menuItems/item-1` price to `0`.
6. **Terminal Order Re-opening**: Waitstaff tries to change `status` from `'served'` back to `'pending'`.
7. **Order State Value Poisoning**: Staff sends `{ status: 12345, updatedAt: request.time }`.
8. **Order Items Array Overflow**: Customer sends 35 items in `items` (exceeds max 30).
9. **Client-Forged Timestamp**: Order create with `createdAt: Timestamp(2020-01-01)` instead of `request.time`.
10. **PII Blanket Read on Staff**: Customer tries `get(/restaurants/r1/staff/s1)` to read staff emails.
11. **Self-Assigned Admin Role**: User tries to create `/admins/${uid}` for themselves.
12. **Immutable Field Mutation**: Owner tries to change `createdAt` or `ownerId` during restaurant update.
