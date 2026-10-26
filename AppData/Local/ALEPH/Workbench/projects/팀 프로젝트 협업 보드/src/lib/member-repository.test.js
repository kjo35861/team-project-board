import { describe, expect, it, vi } from "vitest";
import { BoardRepositoryError } from "./board-repository.js";
import {
  acceptBoardInvite,
  cancelBoardInvite,
  createBoardInvite,
  leaveBoard,
  listBoardInvites,
  listBoardMembers,
  removeBoardMember,
} from "./member-repository.js";

const TOKEN = "a".repeat(128);
const NOW = "2026-07-08T12:00:00.000Z";
const EXPIRES = "2026-07-15T12:00:00.000Z";

function makeClient({ user = { id: "user-1" }, authError = null, data = [], error = null, thrown = null } = {}) {
  const getUser = vi.fn().mockResolvedValue({ data: { user }, error: authError });
  const rpc = vi.fn().mockImplementation(() => {
    if (thrown) return Promise.reject(thrown);
    return Promise.resolve({ data, error });
  });
  return { client: { auth: { getUser }, rpc }, getUser, rpc };
}

describe("board member repository", () => {
  it("returns only safe member roster fields", async () => {
    const setup = makeClient({ data: [
      { user_id: "owner-1", display_name: "Owner", role: "owner", email: "private@example.test" },
      { user_id: "member-1", display_name: null, role: "member", created_at: NOW },
    ] });

    await expect(listBoardMembers(setup.client, "board-1")).resolves.toEqual([
      { userId: "owner-1", displayName: "Owner", role: "owner" },
      { userId: "member-1", displayName: null, role: "member" },
    ]);
    expect(setup.rpc).toHaveBeenCalledWith("list_board_member_profiles", { p_board_id: "board-1" });
  });

  it("rejects malformed roster data and validates IDs before requesting", async () => {
    const malformed = makeClient({ data: [{ user_id: "member-1", display_name: "Member", role: "admin" }] });
    await expect(listBoardMembers(malformed.client, "board-1")).rejects.toMatchObject({ code: "request_failed" });

    const invalidId = makeClient();
    await expect(listBoardMembers(invalidId.client, " ")).rejects.toMatchObject({ code: "invalid_input" });
    expect(invalidId.getUser).not.toHaveBeenCalled();
    expect(invalidId.rpc).not.toHaveBeenCalled();
  });

  it("leaves and removes members only through their authorized RPCs", async () => {
    const leaving = makeClient({ data: "board-1" });
    await expect(leaveBoard(leaving.client, "board-1")).resolves.toBe("board-1");
    expect(leaving.rpc).toHaveBeenCalledWith("leave_board", { p_board_id: "board-1" });

    const removing = makeClient({ data: "member-2" });
    await expect(removeBoardMember(removing.client, "board-1", "member-2")).resolves.toBe("member-2");
    expect(removing.rpc).toHaveBeenCalledWith("remove_board_member", {
      p_board_id: "board-1",
      p_user_id: "member-2",
    });

    const mismatched = makeClient({ data: "another-user" });
    await expect(removeBoardMember(mismatched.client, "board-1", "member-2"))
      .rejects.toMatchObject({ code: "request_failed" });
  });
});

describe("board invitation repository", () => {
  it("creates an invitation and exposes its one-time raw token only in the return value", async () => {
    const setup = makeClient({ data: [{ invite_id: "invite-1", token: TOKEN, expires_at: EXPIRES }] });
    await expect(createBoardInvite(setup.client, "board-1")).resolves.toEqual({
      inviteId: "invite-1",
      token: TOKEN,
      expiresAt: EXPIRES,
    });
    expect(setup.rpc).toHaveBeenCalledWith("create_board_invite", { p_board_id: "board-1" });
  });

  it("rejects malformed create responses instead of returning an unusable or unsafe token", async () => {
    const malformed = makeClient({ data: [{ invite_id: "invite-1", token: "not-a-token", expires_at: EXPIRES }] });
    await expect(createBoardInvite(malformed.client, "board-1"))
      .rejects.toMatchObject({ code: "request_failed" });
  });

  it("lists only validated invitation metadata, without carrying extra token fields", async () => {
    const setup = makeClient({ data: [{
      invite_id: "invite-1",
      created_at: NOW,
      expires_at: EXPIRES,
      accepted_at: null,
      accepted_by: null,
      canceled_at: null,
      status: "pending",
      token: TOKEN,
      token_hash: "secret-hash",
    }] });

    await expect(listBoardInvites(setup.client, "board-1")).resolves.toEqual([{
      inviteId: "invite-1",
      createdAt: NOW,
      expiresAt: EXPIRES,
      acceptedAt: null,
      acceptedBy: null,
      canceledAt: null,
      status: "pending",
    }]);
    expect(setup.rpc).toHaveBeenCalledWith("list_board_invites", { p_board_id: "board-1" });
  });

  it("cancels by ID and accepts only well-formed invitation tokens", async () => {
    const cancel = makeClient({ data: "invite-1" });
    await expect(cancelBoardInvite(cancel.client, "invite-1")).resolves.toBe("invite-1");
    expect(cancel.rpc).toHaveBeenCalledWith("cancel_board_invite", { p_invite_id: "invite-1" });

    const accept = makeClient({ data: "board-1" });
    await expect(acceptBoardInvite(accept.client, TOKEN)).resolves.toBe("board-1");
    expect(accept.rpc).toHaveBeenCalledWith("accept_board_invite", { p_token: TOKEN });

    const invalid = makeClient();
    await expect(acceptBoardInvite(invalid.client, "invalid")).rejects.toMatchObject({ code: "invalid_input" });
    expect(invalid.getUser).not.toHaveBeenCalled();
    expect(invalid.rpc).not.toHaveBeenCalled();
  });

  it("blocks unauthenticated calls and maps permission, network, and unknown failures safely", async () => {
    const unauthenticated = makeClient({ user: null });
    await expect(listBoardMembers(unauthenticated.client, "board-1"))
      .rejects.toMatchObject({ code: "unauthenticated" });
    expect(unauthenticated.rpc).not.toHaveBeenCalled();

    const forbidden = makeClient({ error: { code: "42501", message: "permission denied" } });
    await expect(leaveBoard(forbidden.client, "board-1"))
      .rejects.toMatchObject({ code: "forbidden" });

    const network = makeClient({ thrown: new TypeError("Failed to fetch") });
    await expect(listBoardInvites(network.client, "board-1"))
      .rejects.toMatchObject({ code: "network" });

    const unknown = makeClient({ error: { code: "XX000", message: "internal details" } });
    const error = await cancelBoardInvite(unknown.client, "invite-1").catch((caught) => caught);
    expect(error).toBeInstanceOf(BoardRepositoryError);
    expect(error).toMatchObject({ code: "request_failed" });
    expect(error.message).not.toContain("internal details");
  });
});
