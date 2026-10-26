import { isEmailVerified } from "./auth-policy.js";

function getAuthMessage(error) {
  const code = typeof error?.code === "string" ? error.code.toLowerCase() : "";
  const text = typeof error?.message === "string" ? error.message.toLowerCase() : "";
  const combined = `${code} ${text}`;
  if (combined.includes("email_not_confirmed") || combined.includes("email not confirmed")) return "이메일 인증이 아직 완료되지 않았습니다. 인증 메일을 확인해 주세요.";
  if (combined.includes("invalid_credentials") || combined.includes("invalid login credentials")) return "이메일 또는 비밀번호를 확인해 주세요.";
  if (combined.includes("user_already_exists") || combined.includes("already registered")) return "이미 가입된 이메일일 수 있습니다. 로그인 화면에서 다시 시도해 주세요.";
  if (combined.includes("weak_password") || combined.includes("password should be")) return "비밀번호가 너무 짧거나 안전하지 않습니다. 6자 이상으로 다시 입력해 주세요.";
  if (combined.includes("rate limit") || combined.includes("too many requests") || combined.includes("over_email_send_rate_limit")) return "요청이 잠시 많습니다. 잠시 기다린 뒤 다시 시도해 주세요.";
  if (combined.includes("fetch") || combined.includes("network") || combined.includes("timeout")) return "네트워크 연결을 확인한 뒤 다시 시도해 주세요.";
  return "요청을 처리하지 못했습니다. 입력과 네트워크 연결을 확인한 뒤 다시 시도해 주세요.";
}

function createScreen() {
  const screen = document.createElement("main");
  screen.className = "auth-screen";
  screen.id = "auth-screen";
  screen.setAttribute("aria-label", "계정 인증");
  screen.innerHTML = `
    <section class="auth-card">
      <div class="auth-brand" aria-label="teamboard"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>teamboard</span></div>
      <p class="auth-message" id="auth-message" role="status" aria-live="polite" hidden></p>
      <section id="auth-form-panel" aria-labelledby="auth-title"><h1 id="auth-title">로그인</h1><p class="auth-description">팀 프로젝트 협업 보드에 로그인해 계속 진행하세요.</p>
        <div class="auth-mode-switch" aria-label="계정 작업 선택"><button type="button" data-auth-mode="login" aria-pressed="true">로그인</button><button type="button" data-auth-mode="signup" aria-pressed="false">회원가입</button></div>
        <form class="auth-form" id="auth-form"><div class="auth-field"><label for="auth-email">이메일</label><input id="auth-email" name="email" type="email" autocomplete="email" required maxlength="254" placeholder="name@example.com"></div><div class="auth-field"><label for="auth-password">비밀번호</label><input id="auth-password" name="password" type="password" autocomplete="current-password" required minlength="6" maxlength="128" placeholder="6자 이상 입력해 주세요"></div><button class="auth-primary-button" id="auth-submit" type="submit">로그인</button></form>
        <p class="auth-local-note">로그인과 이메일 확인이 끝난 뒤에만 보드 화면을 엽니다. 보드와 업무의 서버 공유 및 권한 적용은 아직 구현되지 않았습니다.</p></section>
      <section id="auth-confirmation-panel" aria-labelledby="auth-confirmation-title" hidden><h1 id="auth-confirmation-title">이메일을 확인해 주세요</h1><p class="auth-description" id="auth-confirmation-copy"></p><div class="auth-pending-actions"><button class="auth-primary-button" id="auth-resend-button" type="button">인증 메일 다시 보내기</button><button class="auth-secondary-button" id="auth-back-to-login" type="button">로그인 화면으로 돌아가기</button></div></section>
      <section id="auth-config-panel" aria-labelledby="auth-config-title" hidden><h1 id="auth-config-title">인증 설정이 필요합니다</h1><p class="auth-description" id="auth-config-copy"></p><div class="auth-config-details">저장소 루트의 <code>.env.local</code>에 <code>VITE_SUPABASE_URL</code>과 공개용 <code>VITE_SUPABASE_PUBLIC_KEY</code>를 설정한 뒤 Vite 서버를 다시 시작하세요. 변수 예시는 <code>README.md</code>를 참고하세요.<br>Supabase 대시보드에서 앱 주소를 Site URL 및 허용된 리디렉션 URL로 등록해야 이메일 확인 후 돌아올 수 있습니다.<br><strong>service_role 키나 다른 비밀 키는 브라우저 환경 변수에 넣지 마세요.</strong></div><p class="auth-local-note">설정이 없거나 잘못된 경우에도 로컬 보드 데이터를 열지 않습니다. 인증을 우회해 로컬 모드로 전환하지 않습니다.</p></section>
      <section id="auth-fatal-panel" aria-labelledby="auth-fatal-title" hidden><h1 id="auth-fatal-title">보드 화면을 열지 못했습니다</h1><p class="auth-description" id="auth-fatal-copy"></p><button class="auth-primary-button" id="auth-retry-app" type="button">다시 시도</button></section>
    </section>`;
  return screen;
}

export function createAuthController({ client, onAuthenticated, onUnauthenticated }) {
  const screen = createScreen(); document.body.prepend(screen);
  const formPanel = screen.querySelector("#auth-form-panel");
  const confirmationPanel = screen.querySelector("#auth-confirmation-panel");
  const configPanel = screen.querySelector("#auth-config-panel");
  const fatalPanel = screen.querySelector("#auth-fatal-panel");
  const message = screen.querySelector("#auth-message");
  const form = screen.querySelector("#auth-form");
  const emailInput = screen.querySelector("#auth-email");
  const passwordInput = screen.querySelector("#auth-password");
  const submitButton = screen.querySelector("#auth-submit");
  const modeButtons = [...screen.querySelectorAll("[data-auth-mode]")];
  const confirmationCopy = screen.querySelector("#auth-confirmation-copy");
  const resendButton = screen.querySelector("#auth-resend-button");
  const retryButton = screen.querySelector("#auth-retry-app");
  let mode = "login"; let busy = false; let pendingEmail = ""; let currentUserId = ""; let retryApp = null;
  let sessionRevision = 0; let handledLocation = ""; let redirectStatusMessage = "";

  function setMessage(text, kind = "info") { message.textContent = text; message.dataset.kind = kind; message.hidden = !text; }
  function showForm(nextMode = "login", status = "", kind = "info") {
    mode = nextMode; formPanel.hidden = false; confirmationPanel.hidden = true; configPanel.hidden = true; fatalPanel.hidden = true; screen.hidden = false;
    screen.querySelector("#auth-title").textContent = mode === "signup" ? "계정 만들기" : "로그인";
    screen.querySelector(".auth-description").textContent = mode === "signup" ? "이메일과 비밀번호로 계정을 만들고 이메일 인증을 완료하세요." : "팀 프로젝트 협업 보드에 로그인해 계속 진행하세요.";
    modeButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.authMode === mode)));
    passwordInput.autocomplete = mode === "signup" ? "new-password" : "current-password";
    submitButton.textContent = busy ? "처리 중…" : mode === "signup" ? "회원가입" : "로그인";
    setMessage(status || redirectStatusMessage, kind);
  }
  function showConfirmation(email, status = "인증 메일을 확인한 뒤 링크를 열어 주세요.", kind = "info") {
    pendingEmail = email || pendingEmail; formPanel.hidden = true; confirmationPanel.hidden = false; configPanel.hidden = true; fatalPanel.hidden = true; screen.hidden = false;
    confirmationCopy.textContent = `${pendingEmail ? `${pendingEmail} 주소로 ` : ""}보낸 인증 링크를 열어 이메일 인증을 완료해 주세요. 인증 후 이 앱으로 돌아오면 세션을 확인하고 보드 화면을 엽니다.`;
    passwordInput.value = ""; setMessage(status, kind);
  }
  function setBusy(value) { busy = value; submitButton.disabled = value; modeButtons.forEach((button) => { button.disabled = value; }); resendButton.disabled = value; resendButton.textContent = value ? "요청 중…" : "인증 메일 다시 보내기"; submitButton.textContent = value ? "처리 중…" : (mode === "signup" ? "회원가입" : "로그인"); }
  function showAppError(text, retry) { retryApp = typeof retry === "function" ? retry : null; formPanel.hidden = true; confirmationPanel.hidden = true; configPanel.hidden = true; fatalPanel.hidden = false; screen.hidden = false; screen.querySelector("#auth-fatal-copy").textContent = text; retryButton.disabled = !retryApp; }
  function deactivateSession() { if (!currentUserId) return false; currentUserId = ""; onUnauthenticated?.(); return true; }
  async function processSession(session, revision = sessionRevision) {
    if (revision !== sessionRevision) return;
    const user = session?.user || null;
    if (!user) { const hadUser = deactivateSession(); if (!hadUser && !confirmationPanel.hidden) return; if (!hadUser) showForm("login"); return; }
    if (!isEmailVerified(user)) { const hadUser = deactivateSession(); if (hadUser) return; showConfirmation(user.email || pendingEmail, "보드에 들어가기 전에 이메일 인증을 완료해야 합니다.", "warning"); return; }
    const userId = typeof user.id === "string" ? user.id : "";
    if (!userId) { showForm("login", "계정 정보를 확인하지 못했습니다. 다시 로그인해 주세요.", "warning"); return; }
    if (currentUserId && userId !== currentUserId) { deactivateSession(); return; }
    if (userId === currentUserId) return;
    currentUserId = userId; screen.hidden = true;
    try { await onAuthenticated?.(user); if (revision !== sessionRevision) return; }
    catch { if (revision !== sessionRevision) return; showAppError("인증은 확인했지만 앱 초기화 중 문제가 발생했습니다. 다시 시도하거나 페이지를 새로고침해 주세요.", async () => { screen.hidden = true; try { await onAuthenticated?.(user); } catch { showAppError("앱 초기화에 다시 실패했습니다. 네트워크나 설정을 확인한 뒤 재시도해 주세요.", async () => { await onAuthenticated?.(user); }); } }); }
  }
  function handleAuthCallback() {
    const locationKey = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (locationKey === handledLocation) return;
    const params = new URLSearchParams(`${window.location.search}${window.location.hash.replace(/^#/, "?")}`);
    if (!(params.has("code") || params.has("access_token") || params.has("error") || params.has("error_description"))) return;
    handledLocation = locationKey;
    const errorDescription = params.get("error_description") || params.get("error");
    redirectStatusMessage = errorDescription ? "이메일 인증을 완료하지 못했습니다. 인증 링크가 만료되었거나 잘못되었을 수 있습니다. 로그인하거나 새 인증 링크를 요청해 주세요." : "인증 링크에서 돌아왔습니다. 이메일 확인과 로그인 상태를 확인해 주세요.";
    // Leave callback parameters to Supabase's detectSessionInUrl processing.
  }
  async function handleSubmit(event) {
    event.preventDefault(); if (busy || !form.reportValidity()) return;
    const email = emailInput.value.trim(); const password = passwordInput.value; setMessage(""); setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) { const combinedError = `${error.code || ""} ${error.message || ""}`.toLowerCase(); showForm(combinedError.includes("already") ? "login" : "signup", getAuthMessage(error), "error"); return; }
        pendingEmail = email;
        if (data?.session) { sessionRevision += 1; await processSession(data.session); }
        else showConfirmation(email, "가입 요청을 받았습니다. 받은 편지함에서 인증 링크를 열어 계정을 확인해 주세요.");
      } else {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) { if (String(error.code || "").toLowerCase().includes("email_not_confirmed") || String(error.message || "").toLowerCase().includes("email not confirmed")) showConfirmation(email, getAuthMessage(error), "warning"); else setMessage(getAuthMessage(error), "error"); return; }
        if (data?.session) { sessionRevision += 1; await processSession(data.session); }
        else setMessage("로그인 세션을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.", "error");
      }
    } catch (error) { setMessage(getAuthMessage(error), "error"); }
    finally { setBusy(false); }
  }
  async function resendConfirmation() { if (busy || !pendingEmail) return; setBusy(true); setMessage(""); try { const { error } = await client.auth.resend({ type: "signup", email: pendingEmail, options: { emailRedirectTo: window.location.origin } }); if (error) setMessage(getAuthMessage(error), "error"); else setMessage("인증 메일 재전송을 요청했습니다. 메일함과 스팸함을 확인해 주세요.", "success"); } catch (error) { setMessage(getAuthMessage(error), "error"); } finally { setBusy(false); } }
  form.addEventListener("submit", handleSubmit);
  modeButtons.forEach((button) => button.addEventListener("click", () => { if (!busy) showForm(button.dataset.authMode); }));
  resendButton.addEventListener("click", resendConfirmation);
  screen.querySelector("#auth-back-to-login").addEventListener("click", () => showForm("login"));
  retryButton.addEventListener("click", () => { if (retryApp) void retryApp(); });

  handleAuthCallback();
  const initialRevision = sessionRevision;
  const { data: subscriptionData } = client.auth.onAuthStateChange((_event, session) => { const revision = ++sessionRevision; queueMicrotask(() => { void processSession(session, revision); }); });
  void client.auth.getSession().then(({ data, error }) => { if (initialRevision !== sessionRevision) return; if (error) { showForm("login", "저장된 로그인 상태를 복원하지 못했습니다. 다시 로그인해 주세요.", "warning"); return; } void processSession(data?.session || null, initialRevision); }).catch(() => { if (initialRevision === sessionRevision) showForm("login", "로그인 상태를 확인하지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.", "warning"); });
  return { screen, showAppError, showMessage(text, kind = "error") { setMessage(text, kind); }, subscription: subscriptionData?.subscription || null };
}

export function mountConfigurationScreen(state) {
  const screen = createScreen(); document.body.prepend(screen);
  const panel = screen.querySelector("#auth-config-panel");
  screen.querySelector("#auth-form-panel").hidden = true; screen.querySelector("#auth-confirmation-panel").hidden = true; screen.querySelector("#auth-fatal-panel").hidden = true; panel.hidden = false;
  const copy = screen.querySelector("#auth-config-copy");
  if (state === "incomplete") copy.textContent = "Supabase 공개 설정 중 일부가 누락되었습니다. 두 환경 변수가 모두 설정되어 있는지 확인하세요.";
  else if (state === "invalid") copy.textContent = "Supabase 프로젝트 URL 또는 공개 키 형식을 확인할 수 없습니다. HTTPS 프로젝트 URL과 브라우저 공개 키를 확인하세요.";
  else copy.textContent = "Supabase URL과 공개 키가 설정되지 않았습니다. 설정을 완료하기 전에는 로그인이나 보드 데이터를 열 수 없습니다.";
  return screen;
}

export { getAuthMessage };
