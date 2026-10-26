# Room invitations

A room member can invite another user to the room, typically from that
user's profile. The invited user must accept. In a private room, an invitation
from a regular member waits for the owner's approval before the invited user
sees it. All routes need a bearer access token.

## Status flow

```
create → pending                 owner invites, or the room is public
create → awaiting_approval       a member invites to a private room
awaiting_approval → pending      owner approves
awaiting_approval → rejected     owner rejects
pending → accepted               invitee accepts (they join the room in the same transaction)
pending → declined               invitee declines
awaiting_approval | pending → cancelled   inviter cancels
awaiting_approval | pending → expired     14 days after creation
```

Only one invitation per user and room can be open (`awaiting_approval` or
`pending`) at a time; after it closes, the user can be invited again. Expiry
is applied by an hourly job, and responses already report an overdue open
invitation as `expired`.

## Endpoints

| Method | Route                                                   | Who            | Purpose                                                      |
| ------ | ------------------------------------------------------- | -------------- | ------------------------------------------------------------ |
| GET    | `/users/{userId}/invitable-rooms`                       | you            | Your rooms with `isMember`, `hasPendingInvite`, `requiresApproval` for that user |
| POST   | `/rooms/{roomId}/invitations`                           | room members   | Body `{ "userId": 7 }` or `{ "email": "a@b.c" }`; returns the invitation |
| GET    | `/rooms/{roomId}/invitations?status=awaiting_approval`  | owner          | Invitations of the room, paginated; `status` optional       |
| GET    | `/me/room-invitations?status=pending`                   | invitee        | Invitations sent to you, paginated; `status` optional       |
| POST   | `/room-invitations/{id}/accept`                         | invitee        | Join the room                                                |
| POST   | `/room-invitations/{id}/decline`                        | invitee        |                                                              |
| POST   | `/room-invitations/{id}/approve`                        | owner          | `awaiting_approval` → `pending`                              |
| POST   | `/room-invitations/{id}/reject`                         | owner          | `awaiting_approval` → `rejected`                             |
| DELETE | `/room-invitations/{id}`                                | inviter        | Sets the status to `cancelled`; returns the invitation       |
| POST   | `/room-invitations/accept`                              | emailed person | Unchanged: body `{ "token" }` from the email link            |

Every invitation response has `id`, `status`, `room`, `inviter`, `invitee`
(`null` for an email to someone without an account), `email`, `createdAt`,
`expiresAt`, `reviewedBy`, `reviewedAt` and `respondedAt`. Actions return the
updated invitation.

## Rules and errors

- Only room members can invite; anyone else gets **403**.
- Send exactly one of `userId` or `email` (**400** otherwise). Inviting
  yourself is a **400**; an unknown `userId` is a **404**.
- **409** when the user is already a member, is banned from the room, or
  already has an open invitation to the room.
- **403** when the invited user's `roomInvitePolicy` does not allow you.
- **429** after 20 invitations sent in the last 24 hours, cancelled ones
  included.
- Answering needs the right role: `accept` and `decline` are for the invitee
  (403 otherwise), `approve` and `reject` for the room's _current_ owner,
  `DELETE` for the inviter. An action on an invitation in the wrong state is
  a **409**; on an expired one a **410**.
- The invitee cannot see, and gets a **404** for, an invitation that has not
  reached `pending`: `awaiting_approval` and `rejected` invitations never
  appear in `/me/room-invitations`.

## Invite policy

`PATCH /users/me` accepts `roomInvitePolicy`, and `GET /users/me` returns it:

- `everyone` (default)
- `following`: only people the user follows can invite them
- `nobody`

The policy applies to every inviter, owners included, and is checked again
when the owner approves a waiting invitation.

## Email invitations

An `email` invitation works as before: an email with a token link, accepted at
`POST /room-invitations/accept` by the signed-in, verified owner of that
address. The email goes out once the invitation is `pending`, so a member's
invitation to a private room is emailed after the owner approves it. If the
address belongs to an account the invitation is addressed to that account
(`invitee` is set), and the app can answer it with the routes above.

## Side effects

- Notifications (see [notifications](notifications.md)): the invitee when an
  invitation becomes pending (including after approval, or when the room goes
  public); the owner for `awaiting_approval`; the inviter on accepted or
  rejected.
- An inviter who leaves, is kicked or banned: their `awaiting_approval`
  invitations become `cancelled`. Their `pending` ones stay.
- A private room becoming public turns its `awaiting_approval` invitations
  into `pending`.
- Joining the room another way (Join button, invite link, emailed token) marks
  the user's open invitations to it `accepted`.
- Banning a user expires their open invitations to the room.

## Database

Apply the migration with the existing runner. In PowerShell, call the script
directly because PowerShell drops `--`:

```powershell
npm run build; if ($?) { node scripts/migrate-community.cjs --apply }
```

It renames `room_invitation.invitedById` to `inviterId`, makes `email`
nullable, replaces the `(email, roomId)` unique constraint with partial unique
indexes on open invitations, adds `inviteeUserId`, `reviewedById`,
`reviewedAt`, `respondedAt`, `pendingAt` (when the invitee could first see it)
and `expiresAt`, turns `status` into `varchar` with a CHECK constraint, adds
`user.roomInvitePolicy`, and allows the new notification types. Existing
invitations get `expiresAt` 14 days after creation.
