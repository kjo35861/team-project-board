import { BoardRepositoryError, toRepositoryError } from "./board-repository.js";

const INVITE_STATUSES = new Set(["pending", "accepted", "canceled", "expired"]);
const RAW_INVITE_TOKEN_PATTERN = /^[0-9a-f]{128}$/;

function normalizeId(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new BoardRepositoryError("invalid_input");
  }
  return value.trim();
}

function normalizeInviteToken(value) {
  if (typeof value !== "string" || !RAW_INVITE_TOKEN_PATTERN.test(value)) {
    throw new BoardRepositoryError("invalid_input");
  }
  return value;
}

function isTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isNullableTimestamp(value) {
  return value === null || isTimestamp(value);
}

async function requireAuthenticatedUser(client) {
  if (typeof client?.auth?.getUser !== "function") {
    throw new BoardRepositoryError("request_failed");
  }

  let result;
  try {
    result = await client.auth.getUser();
  } catch (error) {
    throw toRepositoryError(error);
  }

  if (result?.error) throw toRepositoryError(result.error);
  if (typeof result?.data?.user?.id !== "string" || !result.data.user.id) {
    throw new BoardRepositoryError("unauthenticated");
  }
}

async function callAuthenticatedRpc(client, functionName, args) {
  if (typeof client?.rpc !== "function") {
    throw new BoardRepositoryError("request_failed");
  }
  await requireAuthenticatedUser(client);

  let result;
  try {
    result = await client.rpc(functionName, args);
  } catch (error) {
    throw toRepositoryError(error);
  }

  if (result?.error) throw toRepositoryError(result.error);
  return result?.data;
}

function requireReturnedId(value, expectedId = null) {
  if (typeof value !== "string" || !value
    || (expectedId !== null && value !== expectedId)) {
    throw new BoardRepositoryError("request_failed");
  }
  return value;
}

/** Return only the safe roster fields exposed by list_board_member_profiles. */
export async function listBoardMembers(client, boardId) {
  const id = normalizeId(boardId);
  const data = await callAuthenticatedRpc(client, "list_board_member_profiles", { p_board_id: id });

  if (!Array.isArray(data)) throw new BoardRepositoryError("request_failed");
  return data.map((member) => {
    if (typeof member?.user_id !== "string" || !member.user_id
      || !(member.display_name === null || typeof member.display_name === "string")
      || !["owner", "member"].includes(member.role)) {
      throw new BoardRepositoryError("request_failed");
    }
    return {
      userId: member.user_id,
      displayName: member.display_name,
      role: member.role,
    };
  });
}

/** Let the signed-in regular member leave; the RPC enforces membership rules. */
export async function leaveBoard(client, boardId) {
  const id = normalizeId(boardId);
  const data = await callAuthenticatedRpc(client, "leave_board", { p_board_id: id });
  return requireReturnedId(data, id);
}

/** Remove a regular member through the owner-authorized database RPC. */
export async function removeBoardMember(client, boardId, userId) {
  const id = normalizeId(boardId);
  const targetUserId = normalizeId(userId);
  const data = await callAuthenticatedRpc(client, "remove_board_member", {
    p_board_id: id,
    p_user_id: targetUserId,
  });
  return requireReturnedId(data, targetUserId);
}

/**
 * Issue an invitation and return its one-time raw token to the caller.
 * The repository does not persist, cache, or log the bearer token; callers
 * should use it only to construct/share the invitation URL.
 */
export async function createBoardInvite(client, boardId) {
  const id = normalizeId(boardId);
  const data = await callAuthenticatedRpc(client, "create_board_invite", { p_board_id: id });
  if (!Array.isArray(data) || data.length !== 1) {
    throw new BoardRepositoryError("request_failed");
  }

  const invite = data[0];
  if (typeof invite?.invite_id !== "string" || !invite.invite_id
    || typeof invite.token !== "string" || !RAW_INVITE_TOKEN_PATTERN.test(invite.token)
    || !isTimestamp(invite.expires_at)) {
    throw new BoardRepositoryError("request_failed");
  }

  return {
    inviteId: invite.invite_id,
    token: invite.token,
    expiresAt: invite.expires_at,
  };
}

/** List safe invitation metadata; tokens and token hashes are never returned. */
export async function listBoardInvites(client, boardId) {
  const id = normalizeId(boardId);
  const data = await callAuthenticatedRpc(client, "list_board_invites", { p_board_id: id });
  if (!Array.isArray(data)) throw new BoardRepositoryError("request_failed");

  return data.map((invite) => {
    if (typeof invite?.invite_id !== "string" || !invite.invite_id
      || !isTimestamp(invite.created_at)
      || !isTimestamp(invite.expires_at)
      || !isNullableTimestamp(invite.accepted_at)
      || !(invite.accepted_by === null || (typeof invite.accepted_by === "string" && invite.accepted_by))
      || !isNullableTimestamp(invite.canceled_at)
      || !INVITE_STATUSES.has(invite.status)) {
      throw new BoardRepositoryError("request_failed");
    }
    return {
      inviteId: invite.invite_id,
      createdAt: invite.created_at,
      expiresAt: invite.expires_at,
      acceptedAt: invite.accepted_at,
      acceptedBy: invite.accepted_by,
      canceledAt: invite.canceled_at,
      status: invite.status,
    };
  });
}

/** Cancel an unused invitation; ownership and expiry are enforced by the RPC. */
export async function cancelBoardInvite(client, inviteId) {
  const id = normalizeId(inviteId);
  const data = await callAuthenticatedRpc(client, "cancel_board_invite", { p_invite_id: id });
  return requireReturnedId(data, id);
}

/** Accept an invitation using its one-time bearer token; never persist the token. */
export async function acceptBoardInvite(client, token) {
  const rawToken = normalizeInviteToken(token);
  const data = await callAuthenticatedRpc(client, "accept_board_invite", { p_token: rawToken });
  return requireReturnedId(data);
}
