import { createAuthController, mountConfigurationScreen } from "./lib/auth-controller.js";
import { mountBoardManagementUI } from "./lib/board-management-ui.js";
import { mountInviteAcceptanceUI, mountInviteCaptureNotice } from "./lib/board-invite-acceptance-ui.js";
import { captureInviteLink, clearPendingInvite } from "./lib/invite-link-session.js";
import { supabaseClient, supabaseConfig } from "./lib/supabase-client.js";

// Capture a bearer invitation before authentication starts, then scrub it from
// the address bar. The token is held only in tab-scoped session storage.
let inviteCapture = { status: "none", token: null };
try {
  inviteCapture = captureInviteLink();
} catch {
  inviteCapture = { status: "storage_error", token: null };
}

const appShell = document.querySelector(".app-shell");
const signOutButton = document.querySelector("#auth-signout");
if (appShell) appShell.hidden = true;

if (!supabaseConfig.configured || !supabaseClient) {
  mountConfigurationScreen(supabaseConfig.state);
} else {
  let appInitialization = null;
  let authController;
  let boardManagementUI;
  let inviteAcceptanceUI;
  let resetInProgress = false;

  function showLocalDataNotice() {
    const notice = document.querySelector("#app-notice");
    if (!notice) return;
    notice.textContent = "공유 보드·구성원·초대와 업무 데이터가 Supabase 서버에 연결됩니다. 공유 보드를 선택하면 업무를 함께 확인하고 수정할 수 있습니다.";
    notice.dataset.kind = "platform-info";
    notice.hidden = false;
  }

  function updateProfile(user) {
    const profileName = document.querySelector(".profile-copy strong");
    const profileStatus = document.querySelector(".profile-copy small");
    const avatar = document.querySelector(".avatar-profile");
    const email = typeof user?.email === "string" ? user.email : "";
    if (profileName) profileName.textContent = email || "로그인 사용자";
    if (profileStatus) profileStatus.textContent = "로그인됨";
    if (avatar) avatar.textContent = email.trim().slice(0, 1).toUpperCase() || "나";
  }

  function showActiveServerBoard(board, metadata = {}) {
    window.__TEAMBOARD_ACTIVE_SERVER_BOARD = board ? { ...board } : null;
    if (typeof window.__TEAMBOARD_SET_ACTIVE_BOARD === "function") {
      window.__TEAMBOARD_SET_ACTIVE_BOARD(board ? { ...board } : null, metadata);
    }
    const active = document.querySelector("#server-board-active");
    if (!active) return;
    active.hidden = false;
    active.dataset.boardId = board?.id || "";
    active.dataset.selectionRevision = String(metadata.revision ?? "");
    active.textContent = board
      ? `선택된 공유 보드: ${board.name} · ${board.owner_id === window.__TEAMBOARD_AUTH_USER_ID ? "소유자" : "구성원"}. 아래 업무 영역은 이 보드의 서버 업무입니다.`
      : "참여 중인 공유 보드가 없습니다. 업무를 보려면 먼저 보드에 참여하세요.";
  }

  function mountRemoteBoardManagement(user) {
    const notice = document.querySelector("#app-notice");
    const pageContent = document.querySelector(".page-content");
    if (!pageContent || typeof user?.id !== "string") return;

    let section = document.querySelector("#server-board-section");
    if (!section) {
      section = document.createElement("section");
      section.className = "server-board-section";
      section.id = "server-board-section";
      section.setAttribute("aria-labelledby", "server-board-heading");

      const heading = document.createElement("h2");
      heading.className = "server-board-heading";
      heading.id = "server-board-heading";
      heading.textContent = "공유 보드 · 서버";

      const root = document.createElement("div");
      root.id = "server-board-list";
      const active = document.createElement("p");
      active.id = "server-board-active";
      active.className = "server-board-active";
      active.setAttribute("role", "status");
      active.setAttribute("aria-live", "polite");
      active.hidden = true;
      section.append(heading, root, active);
      if (notice?.parentElement === pageContent) notice.insertAdjacentElement("afterend", section);
      else pageContent.prepend(section);
    }

    if (!document.querySelector('link[data-board-list-styles]')) {
      const stylesheet = document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = "/board-list.css";
      stylesheet.dataset.boardListStyles = "true";
      document.head.append(stylesheet);
    }

    boardManagementUI?.dispose();
    boardManagementUI = mountBoardManagementUI({
      client: supabaseClient,
      userId: user.id,
      root: section.querySelector("#server-board-list"),
      onBoardSelected: showActiveServerBoard,
    });
  }

  function mountInviteFlow() {
    const pageContent = document.querySelector(".page-content");
    if (!pageContent || !inviteCapture || inviteCapture.status === "none") return;
    let root = document.querySelector("#invite-acceptance-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "invite-acceptance-root";
      const boards = document.querySelector("#server-board-section");
      if (boards) boards.insertAdjacentElement("afterend", root);
      else pageContent.prepend(root);
    }

    inviteAcceptanceUI?.dispose();
    if (inviteCapture.status === "captured" || inviteCapture.status === "restored") {
      inviteAcceptanceUI = mountInviteAcceptanceUI({
        client: supabaseClient,
        token: inviteCapture.token,
        captureStatus: inviteCapture.status,
        root,
        onAccepted: async (boardId) => {
          const result = await boardManagementUI?.reload();
          if (result?.status === "error" || result?.status === "stale" || result?.status === "disposed") {
            throw new Error("Shared board list refresh failed");
          }
          boardManagementUI?.selectBoard(boardId);
        },
      });
    } else {
      mountInviteCaptureNotice({ root, status: inviteCapture.status });
    }
  }

  async function initializeAuthenticatedApp(user) {
    if (typeof user?.id !== "string" || !user.id) throw new Error("인증 사용자 식별자를 확인할 수 없습니다.");
    window.__TEAMBOARD_AUTH_USER_ID = user.id;
    if (!appInitialization) appInitialization = import("../app.js").catch((error) => { appInitialization = null; throw error; });
    await appInitialization;
    updateProfile(user);
    showLocalDataNotice();
    mountRemoteBoardManagement(user);
    mountInviteFlow();
    if (appShell) appShell.hidden = false;
    if (signOutButton) signOutButton.hidden = false;
  }

  function resetAuthenticatedApp() {
    if (resetInProgress) return;
    resetInProgress = true;
    boardManagementUI?.dispose();
    inviteAcceptanceUI?.dispose();
    boardManagementUI = null;
    inviteAcceptanceUI = null;
    window.__TEAMBOARD_ACTIVE_SERVER_BOARD = null;
    if (typeof window.__TEAMBOARD_SET_ACTIVE_BOARD === "function") {
      window.__TEAMBOARD_SET_ACTIVE_BOARD(null, { reason: "logout" });
    }
    clearPendingInvite();
    if (appShell) appShell.hidden = true;
    if (signOutButton) signOutButton.hidden = true;
    delete window.__TEAMBOARD_AUTH_USER_ID;
    window.location.replace(window.location.pathname);
  }

  authController = createAuthController({ client: supabaseClient, onAuthenticated: initializeAuthenticatedApp, onUnauthenticated: resetAuthenticatedApp });
  signOutButton?.addEventListener("click", async () => {
    if (signOutButton.disabled) return;
    signOutButton.disabled = true;
    signOutButton.textContent = "로그아웃 중…";
    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) throw error;
      resetAuthenticatedApp();
    } catch {
      signOutButton.disabled = false;
      signOutButton.textContent = "로그아웃";
      authController.showMessage("로그아웃하지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.", "error");
      const notice = document.querySelector("#app-notice");
      if (notice) { notice.textContent = "로그아웃하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요."; notice.dataset.kind = "warning"; notice.hidden = false; }
    }
  });
}
