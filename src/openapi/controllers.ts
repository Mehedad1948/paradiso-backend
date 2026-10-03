import { AppController } from '../app.controller';
import { AuthController } from '../auth/auth.controller';
import { GoogleAuthenticationController } from '../auth/social/google-authentication.controller';
import { GenresController } from '../genres/genres.controller';
import { MoviesController } from '../movies/movies.controller';
import { RatingsController } from '../ratings/ratings.controller';
import { RolesController } from '../roles/roles.controller';
import { AcceptInvitationController } from '../room-invitations/accept-invitation.controller';
import { RoomInvitationsController } from '../room-invitations/room-invitations.controller';
import { PublicInviteLinksController } from '../room-invite-links/public-invite-links.controller';
import { RoomInviteLinksController } from '../room-invite-links/room-invite-links.controller';
import { RoomsController } from '../rooms/rooms.controller';
import { UploadsController } from '../uploads/uploads.controller';
import { UsersController } from '../users/users.controller';

// Keep this list in sync with application controllers. Both runtime docs and the
// offline exporter use their real route and DTO metadata.
export const apiControllers = [
  AppController,
  AuthController,
  GoogleAuthenticationController,
  GenresController,
  MoviesController,
  RatingsController,
  RolesController,
  AcceptInvitationController,
  RoomInvitationsController,
  PublicInviteLinksController,
  RoomInviteLinksController,
  RoomsController,
  UploadsController,
  UsersController,
];
