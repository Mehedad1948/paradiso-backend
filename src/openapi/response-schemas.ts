import { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

// These describe serialized HTTP responses, not database entities. Relations
// differ by endpoint and private user fields must never enter the contract.
type Properties = Record<string, SchemaObject>;
const string: SchemaObject = { type: 'string' };
const integer: SchemaObject = { type: 'integer' };
const number: SchemaObject = { type: 'number' };
const boolean: SchemaObject = { type: 'boolean' };
const uuid: SchemaObject = { type: 'string', format: 'uuid' };
const date: SchemaObject = { type: 'string', format: 'date-time' };
const nullable = (schema: SchemaObject): SchemaObject =>
  '$ref' in schema
    ? { oneOf: [schema, { type: 'object', nullable: true, enum: [null] }] }
    : { ...schema, nullable: true };
export const ref = (name: string): SchemaObject & { $ref: string } => ({
  $ref: `#/components/schemas/${name}`,
});
const array = (items: SchemaObject): SchemaObject => ({ type: 'array', items });
const object = (
  properties: Properties,
  required = Object.keys(properties),
): SchemaObject => ({ type: 'object', properties, required });
const envelope = (schema: SchemaObject): SchemaObject =>
  object({ ...schema.properties, apiVersion: string }, [
    ...(schema.required ?? []),
    'apiVersion',
  ]);
const data = (schema: SchemaObject): SchemaObject =>
  envelope(object({ data: schema }));
const page = (items: SchemaObject): SchemaObject =>
  object({
    data: array(items),
    meta: ref('PaginationMeta'),
    links: ref('PaginationLinks'),
  });
const publicUser = object({
  id: integer,
  username: string,
  avatar: nullable(string),
});
const genre = object({ id: uuid, name: string, tmdbId: integer });
const movieProperties: Properties = {
  id: uuid,
  dbId: nullable(integer),
  title: string,
  poster_path: nullable(string),
  vote_average: nullable(number),
  overview: nullable(string),
  original_title: nullable(string),
  video: nullable(string),
  release_date: nullable(string),
  imdbRate: nullable(number),
  imdbLink: nullable(string),
  isWatchedTogether: boolean,
  runtime: nullable(integer),
  createdAt: date,
  updatedAt: date,
  addedBy: nullable(ref('PublicUser')),
  genres: array(ref('Genre')),
};
const movie = object(movieProperties);
// TMDb people; id is the TMDb person ID for /people/{tmdbPersonId}.
const personProperties: Properties = {
  id: integer,
  name: string,
  profile_path: nullable(string),
};
const creditItem = object(
  {
    tmdbId: integer,
    movieId: {
      ...nullable(uuid),
      description: 'Our movie ID when the film is in the library, else null.',
    },
    title: string,
    release_date: nullable(string),
    poster_path: nullable(string),
    vote_average: nullable(number),
    character: { ...nullable(string), description: 'Acting credits only.' },
    jobs: {
      ...array(string),
      minItems: 1,
      description: 'Crew credits only: every job on the film, merged.',
    },
  },
  ['tmdbId', 'movieId', 'title', 'release_date', 'poster_path', 'vote_average'],
);
const creditList = (description: string): SchemaObject => ({
  ...array(ref('CreditItem')),
  description,
});
const person = object({
  ...personProperties,
  biography: {
    ...string,
    description:
      'In the requested language, falling back to en-US; empty when unknown.',
  },
  birthday: nullable(string),
  deathday: nullable(string),
  placeOfBirth: nullable(string),
  knownForDepartment: {
    ...nullable(string),
    description:
      'TMDb department, e.g. Directing or Acting; pick the first tab from it.',
  },
  imdbId: nullable(string),
  credits: object({
    directing: creditList(
      'Films directed. Unreleased (no release_date) first, then newest first.',
    ),
    acting: creditList(
      'Acting roles, several roles in one film joined with " / ". Self appearances are left out. Same order.',
    ),
    crew: creditList(
      'Other crew work, one entry per film with jobs merged. Same order.',
    ),
  }),
});
const movieDetails = object({
  id: uuid,
  dbId: nullable(integer),
  title: string,
  original_title: nullable(string),
  tagline: nullable(string),
  overview: nullable(string),
  release_date: nullable(string),
  runtime: { ...nullable(integer), description: 'Minutes.' },
  poster_path: nullable(string),
  backdrop_path: nullable(string),
  backdrops: {
    ...array(string),
    maxItems: 8,
    description:
      'Gallery of TMDb backdrop paths, backdrop_path first; empty when unknown. Prefix https://image.tmdb.org/t/p/w780.',
  },
  vote_average: nullable(number),
  imdbRate: nullable(number),
  imdbLink: nullable(string),
  genres: array(ref('Genre')),
  director: {
    ...nullable(string),
    deprecated: true,
    description:
      'Comma-separated director names. Deprecated: read directors instead.',
  },
  directors: {
    ...array(ref('MovieCrewMember')),
    description:
      'Every credited director (co-directors included); empty when unknown.',
  },
  crew: {
    ...array(
      object({
        ...personProperties,
        jobs: { ...array(string), minItems: 1 },
      }),
    ),
    maxItems: 8,
    description:
      'Key crew (Screenplay, Writer, Director of Photography, Original Music Composer), one entry per person with every job they held.',
  },
  cast: {
    ...array(
      object({
        id: {
          ...nullable(integer),
          description:
            'TMDb person ID for /people/{tmdbPersonId}; null only while stored details predate person IDs.',
        },
        name: string,
        character: nullable(string),
        profile_path: nullable(string),
      }),
    ),
    maxItems: 8,
    description: 'Top-billed cast in billing order; empty when unknown.',
  },
  trailerKey: {
    ...nullable(string),
    description: 'YouTube video key: https://www.youtube.com/watch?v={key}',
  },
});
const invitationStatus: SchemaObject = {
  type: 'string',
  enum: [
    'awaiting_approval',
    'pending',
    'accepted',
    'declined',
    'rejected',
    'cancelled',
    'expired',
  ],
};
const invitationProperties: Properties = {
  id: integer,
  status: invitationStatus,
  room: object({
    id: integer,
    name: string,
    image: nullable(string),
    isPublic: boolean,
  }),
  inviter: nullable(ref('PublicUser')),
  invitee: nullable(ref('PublicUser')),
  email: nullable({ type: 'string', format: 'email' }),
  userStatus: { type: 'string', enum: ['member', 'notVerified', 'guest'] },
  reviewedBy: nullable(ref('PublicUser')),
  reviewedAt: nullable(date),
  respondedAt: nullable(date),
  createdAt: date,
  expiresAt: date,
};
const linkProperties: Properties = {
  id: integer,
  token: uuid,
  expiresAt: nullable(date),
  maxUsage: integer,
  uses: integer,
  createdAt: date,
  isActive: boolean,
};
const roomProperties: Properties = {
  id: integer,
  name: string,
  description: nullable(string),
  image: nullable(string),
  isPublic: boolean,
  themeColor: nullable(string),
};
const tmdbProperties: Properties = {
  id: integer,
  title: string,
  original_title: string,
  overview: string,
  release_date: string,
  poster_path: nullable(string),
  backdrop_path: nullable(string),
  adult: boolean,
  popularity: number,
  vote_average: number,
  vote_count: integer,
  original_language: string,
};
const user = object(
  {
    id: integer,
    email: { type: 'string', format: 'email' },
    username: string,
    avatar: nullable(string),
    role: string,
  },
  ['id', 'email', 'username'],
);
const currentUser = object(
  {
    ...user.properties,
    avatar: nullable({ type: 'string', format: 'uri' }),
    genres: array(ref('Genre')),
    onboardedAt: nullable(date),
    roomInvitePolicy: {
      type: 'string',
      enum: ['everyone', 'following', 'nobody'],
    },
    stats: {
      ...object({
        followersCount: integer,
        followingCount: integer,
        favoritesCount: integer,
        watchlistCount: integer,
        favoritePosters: {
          ...array(nullable(string)),
          maxItems: 4,
          description:
            'poster_path of the first 4 favorites in display order; null when that movie has no poster.',
        },
      }),
      description: "The user's account totals. Counts are 0 when empty.",
    },
  },
  [
    'id',
    'email',
    'username',
    'avatar',
    'genres',
    'onboardedAt',
    'roomInvitePolicy',
    'stats',
  ],
);
const updatedMovie = object({
  id: uuid,
  dbId: nullable(integer),
  title: string,
  release_date: nullable(string),
  imdbRate: nullable(number),
  imdbLink: nullable(string),
  poster_path: nullable(string),
  overview: nullable(string),
  isWatchedTogether: boolean,
  genres: array(ref('Genre')),
  addedBy: object({ username: nullable(string), avatar: nullable(string) }),
  createdAt: date,
  updatedAt: date,
});
const ratedMovie = object({
  ...movieProperties,
  ratings: array(ref('Rating')),
});

export const responseSchemas: Record<string, SchemaObject> = {
  CommunityPost: object({
    id: integer,
    kind: { type: 'string', enum: ['post', 'quote', 'repost'] },
    text: string,
    rating: nullable(number),
    imageUrl: nullable(string),
    createdAt: date,
    updatedAt: date,
    author: ref('PublicUser'),
    movie: nullable(
      object({
        id: uuid,
        dbId: nullable(integer),
        title: string,
        poster_path: nullable(string),
      }),
    ),
    room: nullable(object({ id: integer, name: string })),
    quotedPostId: nullable(integer),
    quotedPost: nullable(
      object({
        id: integer,
        text: string,
        rating: nullable(number),
        imageUrl: nullable(string),
        createdAt: date,
        author: ref('PublicUser'),
        movie: nullable(
          object({
            id: uuid,
            dbId: nullable(integer),
            title: string,
            poster_path: nullable(string),
          }),
        ),
      }),
    ),
    promotion: nullable(
      object({
        room: object({ id: integer, name: string, image: nullable(string) }),
        canJoin: boolean,
        token: nullable(uuid),
      }),
    ),
    commentCount: integer,
    likeCount: integer,
    dislikeCount: integer,
    repostCount: integer,
    quoteCount: integer,
    myReaction: nullable({ type: 'integer', enum: [1, -1] }),
    reposted: boolean,
  }),
  CommunityReaction: object({
    likeCount: integer,
    dislikeCount: integer,
    myReaction: nullable({ type: 'integer', enum: [1, -1] }),
  }),
  CommunityReactionResponse: {},
  CommunityComment: object({
    id: integer,
    postId: integer,
    text: string,
    author: ref('PublicUser'),
    createdAt: date,
    updatedAt: date,
  }),
  CommunityPostResponse: {},
  CommunityPostPageResponse: envelope(
    object({
      data: array(ref('CommunityPost')),
      nextCursor: nullable(integer),
    }),
  ),
  CommunityCommentResponse: {},
  CommunityCommentPageResponse: envelope(
    object({
      data: array(ref('CommunityComment')),
      nextCursor: nullable(integer),
    }),
  ),
  MovieComment: object({
    id: integer,
    movieId: uuid,
    parentId: {
      ...nullable(integer),
      description:
        'The top-level comment this replies to; null for top-level comments.',
    },
    text: string,
    spoiler: {
      ...boolean,
      description: 'Hide the text behind a reveal until the reader taps it.',
    },
    author: ref('PublicUser'),
    replyCount: { ...integer, description: 'Always 0 on replies.' },
    createdAt: date,
    updatedAt: { ...date, description: 'Differs from createdAt once edited.' },
  }),
  MovieCommentResponse: {},
  MovieCommentPageResponse: envelope(
    object({
      data: array(ref('MovieComment')),
      nextCursor: nullable(integer),
      total: {
        ...integer,
        description: 'All comments on the movie, replies included.',
      },
    }),
  ),
  MovieCommentRepliesResponse: envelope(
    object({
      data: array(ref('MovieComment')),
      nextCursor: nullable(integer),
    }),
  ),
  CommunityProfileResponse: envelope(
    object({
      ...publicUser.properties,
      followersCount: integer,
      followingCount: integer,
    }),
  ),
  CommunityUserPageResponse: envelope(
    object({ data: array(ref('PublicUser')), nextCursor: nullable(integer) }),
  ),
  CommunityUserListResponse: envelope(
    object({ data: array(ref('PublicUser')) }),
  ),
  ChatMessage: object({
    id: integer,
    roomId: integer,
    text: nullable(string),
    author: ref('PublicUser'),
    replyTo: nullable(
      object({
        id: integer,
        text: nullable(string),
        author: ref('PublicUser'),
        deleted: boolean,
      }),
    ),
    mentions: array(ref('PublicUser')),
    movies: array(
      object({
        movieId: nullable(uuid),
        tmdbId: nullable(integer),
        title: string,
        year: nullable(string),
        posterPath: nullable(string),
      }),
    ),
    reactions: array(
      object({
        emoji: string,
        count: integer,
        reactedByMe: boolean,
        userIds: array(integer),
      }),
    ),
    poll: nullable(
      object({
        allowsMultiple: boolean,
        anonymous: boolean,
        closesAt: nullable(date),
        closedAt: nullable(date),
        isClosed: boolean,
        totalVoters: integer,
        options: array(
          object({
            id: integer,
            text: string,
            movieId: nullable(uuid),
            votes: integer,
            votedByMe: boolean,
            voterIds: array(integer),
          }),
        ),
      }),
    ),
    pinnedAt: nullable(date),
    pinnedById: nullable(integer),
    editedAt: nullable(date),
    deletedAt: nullable(date),
    createdAt: date,
    updatedAt: date,
  }),
  ChatMessageResponse: {},
  ChatMessagePageResponse: envelope(
    object({
      data: array(ref('ChatMessage')),
      nextCursor: nullable(integer),
    }),
  ),
  ChatSyncResponse: envelope(
    object({ data: array(ref('ChatMessage')), cursor: date, hasMore: boolean }),
  ),
  ChatMessageListResponse: data(array(ref('ChatMessage'))),
  ChatUnreadResponse: envelope(
    object({
      lastReadMessageId: nullable(integer),
      latestMessageId: nullable(integer),
      unreadCount: integer,
      mentionCount: integer,
    }),
  ),
  PublicUser: publicUser,
  UserResponse: envelope(user),
  CurrentUserResponse: envelope(currentUser),
  Genre: genre,
  GenreResponse: envelope(genre),
  GenreListResponse: data(array(ref('Genre'))),
  PaginationMeta: object({
    itemsPerPage: integer,
    totalItems: integer,
    currentPage: integer,
    totalPages: integer,
  }),
  PaginationLinks: object({
    first: string,
    previous: string,
    next: string,
    last: string,
    current: string,
  }),
  Movie: movie,
  MovieResponse: envelope(movie),
  MovieDetailsResponse: envelope(movieDetails),
  MovieCrewMember: object(personProperties),
  CreditItem: creditItem,
  PersonResponse: envelope(person),
  ResolvedMovieResponse: envelope(object({ id: uuid })),
  MovieListResponse: envelope(page(ref('Movie'))),
  CreatedMovieResponse: envelope(
    object({ ...movieProperties, addedBy: object({ id: integer }) }, [
      'id',
      'dbId',
      'title',
      'isWatchedTogether',
      'addedBy',
      'genres',
      'createdAt',
      'updatedAt',
    ]),
  ),
  UpdatedMovieResponse: envelope(updatedMovie),
  Rating: object({ id: uuid, rate: number, user: ref('PublicUser') }),
  RatedMovie: ratedMovie,
  RatedMovieResponse: envelope(ratedMovie),
  RatingsResponse: envelope(
    object({
      movies: page(ref('RatedMovie')),
      users: array(ref('PublicUser')),
    }),
  ),
  AddedRatingResponse: envelope(
    object({
      rate: number,
      movie: object(
        movieProperties,
        Object.keys(movieProperties).filter((key) => key !== 'genres'),
      ),
    }),
  ),
  RoomListItem: object({
    ...roomProperties,
    // Unread chat messages for the viewer; 0 in rooms they are not part of.
    unreadCount: integer,
    owner: object({ id: integer, username: string }),
    users: array(ref('PublicUser')),
    movies: array(
      object({
        id: uuid,
        title: string,
        genres: array(object({ id: uuid, name: string })),
      }),
    ),
  }),
  RoomListResponse: envelope(page(ref('RoomListItem'))),
  RoomResponse: envelope(
    object({
      ...roomProperties,
      owner: ref('PublicUser'),
      users: array(ref('PublicUser')),
      movies: array(
        object({ id: uuid, title: string, poster_path: nullable(string) }),
      ),
    }),
  ),
  CreatedRoomResponse: envelope(
    object(
      {
        message: string,
        id: integer,
        name: string,
        image: nullable(string),
        isPublic: boolean,
        themeColor: nullable(string),
        owner: user,
      },
      ['message', 'id', 'name', 'isPublic', 'themeColor', 'owner'],
    ),
  ),
  RoomRating: object({
    id: uuid,
    title: string,
    poster_path: nullable(string),
    release_date: nullable(string),
    isWatchedTogether: boolean,
    createdAt: date,
    addedBy: nullable(ref('PublicUser')),
    averageRate: nullable(number),
    rateVariance: nullable(number),
    userSpecificRate: nullable(number),
    ratings: array(object({ user: ref('PublicUser'), rate: nullable(number) })),
    hasVoted: boolean,
  }),
  RoomRatingsResponse: envelope(page(ref('RoomRating'))),
  RoomRatingSummaryResponse: envelope(
    object({ unrated: integer, unratedWatchedTogether: integer }),
  ),
  MessageResponse: envelope(object({ message: string })),
  RoomBan: object({
    id: integer,
    user: object({ id: integer, username: string }),
    bannedBy: nullable(object({ id: integer, username: string })),
    reason: nullable(string),
    createdAt: date,
  }),
  WatchlistItem: object({ addedAt: date, movie: ref('Movie') }),
  WatchlistResponse: envelope(page(ref('WatchlistItem'))),
  WatchlistStatusResponse: envelope(object({ inWatchlist: boolean })),
  FavoriteMovie: object({
    position: integer,
    addedAt: date,
    note: nullable(string),
    movie: ref('Movie'),
  }),
  FavoritesResponse: data(array(ref('FavoriteMovie'))),
  FavoriteStatusResponse: envelope(object({ isFavorite: boolean })),
  Notification: object({
    id: uuid,
    type: {
      type: 'string',
      enum: [
        'room_invite',
        'room_invite_approval',
        'room_invite_accepted',
        'room_invite_rejected',
        'room_invite_declined',
        'movie_added',
        'chat_mention',
        'post_liked',
        'post_commented',
      ],
    },
    read: boolean,
    createdAt: date,
    updatedAt: date,
    actor: object({
      id: integer,
      username: string,
      displayName: string,
      avatarUrl: nullable({ type: 'string', format: 'uri' }),
    }),
    actorCount: integer,
    entity: object({
      type: { type: 'string', enum: ['room', 'post', 'movie', 'message'] },
      id: string,
    }),
    // Render snapshot; which fields are present depends on type.
    data: object(
      {
        roomName: string,
        roomImage: nullable(string),
        inviteToken: string,
        invitationId: integer,
        movieTitle: string,
        posterUrl: nullable(string),
        postExcerpt: string,
        commentExcerpt: string,
        messageExcerpt: string,
        reason: { type: 'string', enum: ['mention', 'reply'] },
      },
      [],
    ),
    roomId: nullable(integer),
  }),
  NotificationPageResponse: envelope(
    object({ items: array(ref('Notification')), nextCursor: nullable(string) }),
  ),
  NotificationUnreadCountResponse: envelope(object({ count: integer })),
  NotificationsReadResponse: envelope(object({ updated: integer })),
  CommunityRecommendation: object({
    id: integer,
    rating: number,
    text: string,
    recommendedAt: date,
    movie: ref('Movie'),
  }),
  CommunityRecommendationPageResponse: envelope(
    object({
      data: array(ref('CommunityRecommendation')),
      nextCursor: nullable(integer),
    }),
  ),
  RoomBanListResponse: data(array(ref('RoomBan'))),
  LeftRoomResponse: envelope(
    object({ message: string, votesCleared: boolean }),
  ),
  AddedRoomMovieResponse: envelope(object({ message: string, movieId: uuid })),
  InvitationResponse: envelope(object(invitationProperties)),
  Invitation: object(invitationProperties),
  InvitationsResponse: envelope(page(ref('Invitation'))),
  SentInvitationsResponse: envelope(
    object({
      ...page(ref('Invitation')).properties,
      summary: object({
        total: integer,
        ...Object.fromEntries(
          (invitationStatus.enum as string[]).map((status) => [
            status,
            integer,
          ]),
        ),
      }),
    }),
  ),
  InvitableRoom: object({
    id: integer,
    name: string,
    image: nullable(string),
    isPublic: boolean,
    isMember: boolean,
    hasPendingInvite: boolean,
    requiresApproval: boolean,
  }),
  InvitableRoomsResponse: data(array(ref('InvitableRoom'))),
  InvitationAcceptedResponse: envelope(
    object({ roomId: integer, message: string }),
  ),
  CreatedInviteLinkResponse: envelope(
    object(
      {
        ...linkProperties,
        room: object({ id: integer }),
        createdBy: object({ id: integer }),
      },
      [
        'id',
        'token',
        'maxUsage',
        'uses',
        'createdAt',
        'isActive',
        'room',
        'createdBy',
      ],
    ),
  ),
  InviteLink: object({
    ...linkProperties,
    createdBy: nullable(ref('PublicUser')),
    inviteUrl: string,
  }),
  InviteLinksResponse: envelope(page(ref('InviteLink'))),
  UpdatedInviteLinkResponse: envelope(
    object({ ...linkProperties, inviteUrl: string }),
  ),
  RemovedInviteLinkResponse: envelope(object({ message: string, id: integer })),
  InvitePreviewResponse: envelope(
    object({
      room: object({
        id: integer,
        name: string,
        description: nullable(string),
        image: nullable(string),
      }),
      inviter: nullable(
        object({ id: integer, name: string, avatar: nullable(string) }),
      ),
      canJoin: boolean,
      message: nullable(string),
    }),
  ),
  InviteJoinedResponse: envelope(
    object({ room: object({ id: integer, name: string }), message: string }),
  ),
  TokensResponse: envelope(
    object({ accessToken: string, refreshToken: string }),
  ),
  TokensMessageResponse: envelope(
    object({ accessToken: string, refreshToken: string, message: string }),
  ),
  StringResponse: data(string),
  HealthResponse: envelope(
    object({
      status: { type: 'string', enum: ['ok'] },
      database: { type: 'string', enum: ['up'] },
      uptime: integer,
      timestamp: date,
    }),
  ),
  EmptyResponse: envelope(object({})),
  RoleResponse: envelope(object({ id: uuid, name: string })),
  UploadResponse: envelope(
    object({
      id: integer,
      name: string,
      path: string,
      type: string,
      mime: string,
      size: number,
      createDate: date,
      updateDate: date,
    }),
  ),
  TmdbGenre: object({ id: integer, name: string }),
  TmdbGenresResponse: data(array(ref('TmdbGenre'))),
  TmdbSearchMovie: {
    ...object(
      { ...tmdbProperties, genre_ids: array(integer), video: boolean },
      ['id', 'title'],
    ),
    additionalProperties: true,
  },
  TmdbSearchResponse: envelope(
    object({
      page: integer,
      total_results: integer,
      total_pages: integer,
      results: array(ref('TmdbSearchMovie')),
    }),
  ),
  TmdbMovieResponse: {
    ...envelope(
      object(
        { ...tmdbProperties, genres: array(ref('TmdbGenre')), video: boolean },
        ['id', 'title', 'genres'],
      ),
    ),
    additionalProperties: true,
  },
  ErrorResponse: object(
    {
      statusCode: integer,
      message: { oneOf: [string, array(string)] },
      error: string,
    },
    ['statusCode', 'message'],
  ),
};

responseSchemas.CommunityPostResponse = envelope(responseSchemas.CommunityPost);
responseSchemas.CommunityReactionResponse = envelope(
  responseSchemas.CommunityReaction,
);
responseSchemas.CommunityCommentResponse = envelope(
  responseSchemas.CommunityComment,
);
responseSchemas.ChatMessageResponse = envelope(responseSchemas.ChatMessage);
responseSchemas.MovieCommentResponse = envelope(responseSchemas.MovieComment);

// Stable operation IDs are also the keys in generated frontend contracts.
// Adding a route without a response contract causes export/build checks to fail.
export const operationResponses: Record<string, string> = {
  Community_feed: 'CommunityPostPageResponse',
  Community_followingFeed: 'CommunityPostPageResponse',
  Community_roomFeed: 'CommunityPostPageResponse',
  Community_getPost: 'CommunityPostResponse',
  Community_createPost: 'CommunityPostResponse',
  Community_updatePost: 'CommunityPostResponse',
  Community_deletePost: 'MessageResponse',
  Community_repost: 'CommunityPostResponse',
  Community_undoRepost: 'MessageResponse',
  Community_react: 'CommunityReactionResponse',
  Community_removeReaction: 'CommunityReactionResponse',
  Community_listComments: 'CommunityCommentPageResponse',
  Community_createComment: 'CommunityCommentResponse',
  Community_deleteComment: 'MessageResponse',
  Community_suggestedUsers: 'CommunityUserListResponse',
  Community_searchUsers: 'CommunityUserPageResponse',
  Community_profile: 'CommunityProfileResponse',
  Community_recommendations: 'CommunityRecommendationPageResponse',
  Community_follow: 'MessageResponse',
  Community_unfollow: 'MessageResponse',
  Community_followers: 'CommunityUserPageResponse',
  Community_following: 'CommunityUserPageResponse',
  RoomChat_listMessages: 'ChatMessagePageResponse',
  RoomChat_syncMessages: 'ChatSyncResponse',
  RoomChat_listPinned: 'ChatMessageListResponse',
  RoomChat_getUnread: 'ChatUnreadResponse',
  RoomChat_markRead: 'ChatUnreadResponse',
  RoomRead_markRead: 'ChatUnreadResponse',
  RoomChat_getMessage: 'ChatMessageResponse',
  RoomChat_sendMessage: 'ChatMessageResponse',
  RoomChat_editMessage: 'ChatMessageResponse',
  RoomChat_deleteMessage: 'ChatMessageResponse',
  RoomChat_addReaction: 'ChatMessageResponse',
  RoomChat_removeReaction: 'ChatMessageResponse',
  RoomChat_votePoll: 'ChatMessageResponse',
  RoomChat_closePoll: 'ChatMessageResponse',
  RoomChat_pinMessage: 'ChatMessageResponse',
  RoomChat_unpinMessage: 'ChatMessageResponse',
  App_getHello: 'StringResponse',
  App_health: 'HealthResponse',
  Auth_isAuthenticated: 'StringResponse',
  Auth_signIn: 'TokensResponse',
  Auth_refreshTokens: 'TokensResponse',
  Auth_verifyEmail: 'TokensMessageResponse',
  Auth_resetPassword: 'TokensMessageResponse',
  Auth_forgetPassword: 'MessageResponse',
  Auth_resendVerification: 'MessageResponse',
  GoogleAuthentication_authenticate: 'ErrorResponse',
  Movies_getMovies: 'MovieListResponse',
  Movies_getMovieById: 'MovieResponse',
  Movies_getMovieDetails: 'MovieDetailsResponse',
  MovieComments_list: 'MovieCommentPageResponse',
  MovieComments_listReplies: 'MovieCommentRepliesResponse',
  MovieComments_create: 'MovieCommentResponse',
  MovieComments_update: 'MovieCommentResponse',
  MovieComments_remove: 'MessageResponse',
  Movies_updateMovieById: 'UpdatedMovieResponse',
  Movies_createMovie: 'CreatedMovieResponse',
  Movies_resolveMovie: 'ResolvedMovieResponse',
  People_getPerson: 'PersonResponse',
  Movies_searchMoviesFromTmdb: 'TmdbSearchResponse',
  Movies_getTmdbGenres: 'TmdbGenresResponse',
  Movies_getTmdbMovieDetails: 'TmdbMovieResponse',
  Rooms_createRoom: 'CreatedRoomResponse',
  Rooms_joinRoom: 'MessageResponse',
  Rooms_getRooms: 'RoomListResponse',
  Rooms_getRoomById: 'RoomResponse',
  Rooms_updateRoom: 'RoomResponse',
  Rooms_addMovieToRoom: 'AddedRoomMovieResponse',
  Rooms_addCustomMovieToRoom: 'AddedRoomMovieResponse',
  Rooms_removeMovieFromRoom: 'MessageResponse',
  Rooms_kickUser: 'MessageResponse',
  Rooms_getRoomBans: 'RoomBanListResponse',
  Rooms_banUser: 'MessageResponse',
  Rooms_unbanUser: 'MessageResponse',
  Rooms_leaveRoom: 'LeftRoomResponse',
  Watchlist_list: 'WatchlistResponse',
  Watchlist_has: 'WatchlistStatusResponse',
  Watchlist_add: 'MessageResponse',
  Watchlist_remove: 'MessageResponse',
  Favorites_list: 'FavoritesResponse',
  Favorites_set: 'FavoritesResponse',
  Favorites_listForUser: 'FavoritesResponse',
  Favorites_has: 'FavoriteStatusResponse',
  Favorites_setNote: 'FavoritesResponse',
  Favorites_add: 'MessageResponse',
  Favorites_remove: 'MessageResponse',
  Notifications_list: 'NotificationPageResponse',
  Notifications_unreadCount: 'NotificationUnreadCountResponse',
  Notifications_markRead: 'NotificationsReadResponse',
  Notifications_remove: 'EmptyResponse',
  Rooms_getRoomRatings: 'RoomRatingsResponse',
  Rooms_getRoomRatingSummary: 'RoomRatingSummaryResponse',
  Ratings_addRating: 'AddedRatingResponse',
  Ratings_getRatings: 'RatingsResponse',
  Ratings_getOneRating: 'RatedMovieResponse',
  RoomInvitations_inviteUser: 'InvitationResponse',
  RoomInvitations_getRoomInvitations: 'InvitationsResponse',
  RoomInvitationActions_accept: 'InvitationResponse',
  RoomInvitationActions_decline: 'InvitationResponse',
  RoomInvitationActions_approve: 'InvitationResponse',
  RoomInvitationActions_reject: 'InvitationResponse',
  RoomInvitationActions_cancel: 'InvitationResponse',
  MyRoomInvitations_list: 'InvitationsResponse',
  MySentRoomInvitations_list: 'SentInvitationsResponse',
  UserInvitableRooms_list: 'InvitableRoomsResponse',
  AcceptInvitation_accept: 'InvitationAcceptedResponse',
  RoomInviteLinks_create: 'CreatedInviteLinkResponse',
  RoomInviteLinks_findAll: 'InviteLinksResponse',
  RoomInviteLinks_update: 'UpdatedInviteLinkResponse',
  RoomInviteLinks_remove: 'RemovedInviteLinkResponse',
  PublicInviteLinks_getOneByToken: 'InvitePreviewResponse',
  PublicInviteLinks_verify: 'InviteJoinedResponse',
  Users_getCurrentUser: 'CurrentUserResponse',
  Users_updateCurrentUser: 'CurrentUserResponse',
  Users_createUser: 'UserResponse',
  Users_updateUser: 'CurrentUserResponse',
  Genres_create: 'GenreListResponse',
  Genres_findAll: 'GenreListResponse',
  Genres_findOne: 'GenreResponse',
  Genres_update: 'GenreResponse',
  Genres_remove: 'EmptyResponse',
  Roles_createRole: 'RoleResponse',
  Uploads_uploadFile: 'UploadResponse',
};
