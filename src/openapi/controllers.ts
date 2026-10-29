import { AppController } from '../app.controller';
import { AuthController } from '../auth/auth.controller';
import { GoogleAuthenticationController } from '../auth/social/google-authentication.controller';
import { GenresController } from '../genres/genres.controller';
import { MoviesController } from '../movies/movies.controller';
import { RatingsController } from '../ratings/ratings.controller';
import { RolesController } from '../roles/roles.controller';
import { AcceptInvitationController } from '../room-invitations/accept-invitation.controller';
import { RoomInvitationsController } from '../room-invitations/room-invitations.controller';
import { RoomInvitationActionsController } from '../room-invitations/room-invitation-actions.controller';
import { MyRoomInvitationsController } from '../room-invitations/my-room-invitations.controller';
import { MySentRoomInvitationsController } from '../room-invitations/my-sent-room-invitations.controller';
import { UserInvitableRoomsController } from '../room-invitations/user-invitable-rooms.controller';
import { PublicInviteLinksController } from '../room-invite-links/public-invite-links.controller';
import { RoomInviteLinksController } from '../room-invite-links/room-invite-links.controller';
import { RoomsController } from '../rooms/rooms.controller';
import { UploadsController } from '../uploads/uploads.controller';
import { UsersController } from '../users/users.controller';
import { CommunityController } from '../community/community.controller';
import { RoomChatController } from '../room-chat/room-chat.controller';
import { RoomReadController } from '../room-chat/room-read.controller';
import { WatchlistController } from '../watchlist/watchlist.controller';
import { FavoritesController } from '../favorites/favorites.controller';
import { NotificationsController } from '../notifications/notifications.controller';
import { MovieCommentsController } from '../movie-comments/movie-comments.controller';
import { PeopleController } from '../people/people.controller';
import { AdminFeaturedController } from '../featured-artists/featured-admin.controller';
import { FeaturedArtistsController } from '../featured-artists/featured-artists.controller';
import { AdminCurationsController } from '../curations/curations-admin.controller';
import { CurationsController } from '../curations/curations.controller';

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
  RoomInvitationActionsController,
  MyRoomInvitationsController,
  MySentRoomInvitationsController,
  UserInvitableRoomsController,
  PublicInviteLinksController,
  RoomInviteLinksController,
  RoomsController,
  UploadsController,
  UsersController,
  CommunityController,
  RoomChatController,
  RoomReadController,
  WatchlistController,
  FavoritesController,
  NotificationsController,
  MovieCommentsController,
  PeopleController,
  FeaturedArtistsController,
  AdminFeaturedController,
  CurationsController,
  AdminCurationsController,
];
