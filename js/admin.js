import {
  ensureSupabase,
  formatDateTime,
  formatDateTimeInput,
  hasSupabaseConfig,
  setText,
} from "./supabase.js";

const setupError = document.querySelector("#admin-setup-error");
const adminPanel = document.querySelector("#admin-panel");
const authStatus = document.querySelector("#auth-status");
const authForm = document.querySelector("#auth-form");
const authEmail = document.querySelector("#auth-email");
const authPassword = document.querySelector("#auth-password");
const signupButton = document.querySelector("#signup-button");
const logoutButton = document.querySelector("#logout-button");
const bootstrapPanel = document.querySelector("#bootstrap-panel");
const bootstrapButton = document.querySelector("#bootstrap-button");
const adminMessage = document.querySelector("#admin-message");
const configForm = document.querySelector("#config-form");
const configTitle = document.querySelector("#config-title");
const configStartsAt = document.querySelector("#config-starts-at");
const configMaxVotes = document.querySelector("#config-max-votes");
const candidateForm = document.querySelector("#candidate-form");
const candidateEditor = document.querySelector("#candidate-editor");
const addCandidateButton = document.querySelector("#add-candidate-button");
const codeForm = document.querySelector("#code-form");
const codeCount = document.querySelector("#code-count");
const codePrefix = document.querySelector("#code-prefix");
const generatedCodes = document.querySelector("#generated-codes");
const codeList = document.querySelector("#code-list");
const codeSummary = document.querySelector("#code-summary");
const resultList = document.querySelector("#result-list");
const resultSummary = document.querySelector("#result-summary");

let candidateDrafts = [];
let isAdmin = false;

function showAdminMessage(message, tone = "normal") {
  adminMessage.textContent = message;
  adminMessage.style.color =
    tone === "error" ? "var(--danger)" : tone === "success" ? "var(--success)" : "var(--muted)";
}

function randomCode(prefix) {
  const values = new Uint32Array(1);
  window.crypto.getRandomValues(values);
  const base = values[0].toString(36).toUpperCase().padStart(7, "0").slice(0, 6);
  return prefix ? `${prefix.toUpperCase()}-${base}` : base;
}

function createField(labelText, value, field, index, maxLength) {
  const label = document.createElement("label");
  label.className = "field";

  const title = document.createElement("span");
  title.textContent = labelText;

  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.dataset.field = field;
  input.dataset.index = String(index);
  input.maxLength = maxLength;

  label.append(title, input);
  return label;
}

function sanitizeCandidates() {
  return candidateDrafts
    .map((candidate, index) => ({
      id: candidate.id ?? null,
      name: candidate.name.trim(),
      description: candidate.description.trim(),
      display_order: index + 1,
    }))
    .filter((candidate) => candidate.name);
}

function renderCandidateEditor() {
  candidateEditor.innerHTML = "";

  if (!candidateDrafts.length) {
    candidateDrafts = [{ id: null, name: "", description: "" }];
  }

  const fragment = document.createDocumentFragment();

  candidateDrafts.forEach((candidate, index) => {
    const row = document.createElement("div");
    row.className = "candidate-editor-row";

    const head = document.createElement("div");
    head.className = "candidate-row";

    const title = document.createElement("strong");
    title.textContent = `후보 ${index + 1}`;

    const removeButton = document.createElement("button");
    removeButton.className = "secondary-button";
    removeButton.type = "button";
    removeButton.dataset.removeIndex = String(index);
    removeButton.textContent = "삭제";

    head.append(title, removeButton);

    const grid = document.createElement("div");
    grid.className = "candidate-editor-grid";
    grid.append(
      createField("이름", candidate.name, "name", index, 50),
      createField("설명", candidate.description, "description", index, 120),
    );

    row.append(head, grid);
    fragment.appendChild(row);
  });

  candidateEditor.appendChild(fragment);

  candidateEditor.querySelectorAll("input[data-field]").forEach((input) => {
    input.addEventListener("input", (event) => {
      const target = event.target;
      const index = Number(target.dataset.index);
      const field = target.dataset.field;
      candidateDrafts[index][field] = target.value;
    });
  });

  candidateEditor.querySelectorAll("button[data-remove-index]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const index = Number(event.currentTarget.dataset.removeIndex);
      candidateDrafts.splice(index, 1);
      renderCandidateEditor();
    });
  });
}

function setAdminUiState(session) {
  const email = session?.user?.email;
  setText(authStatus, email ? `${email} 로그인됨` : "로그아웃 상태");
  logoutButton.classList.toggle("hidden", !email);
}

function renderCodeList(codes) {
  codeList.innerHTML = "";

  if (!codes.length) {
    setText(codeSummary, "생성된 참여코드가 없습니다.");
    codeList.innerHTML = "<p>참여코드를 먼저 생성해 주세요.</p>";
    return;
  }

  const usedCount = codes.filter((code) => code.used_at).length;
  setText(codeSummary, `최근 코드 ${codes.length}개 중 ${usedCount}개 사용됨`);

  const fragment = document.createDocumentFragment();

  codes.forEach((code) => {
    const card = document.createElement("article");
    card.className = "list-card";

    const title = document.createElement("h3");
    title.textContent = code.code;

    const status = document.createElement("p");
    status.textContent = code.used_at ? "사용 완료" : "미사용";

    const created = document.createElement("p");
    created.textContent = `생성: ${formatDateTime(code.created_at)}`;

    card.append(title, status, created);

    if (code.used_at) {
      const used = document.createElement("p");
      used.textContent = `사용: ${formatDateTime(code.used_at)}`;
      card.append(used);
    }

    fragment.appendChild(card);
  });

  codeList.appendChild(fragment);
}

function renderResults(results, ballotCount) {
  resultList.innerHTML = "";
  setText(resultSummary, `총 투표 수 ${ballotCount}개`);

  if (!results.length) {
    resultList.innerHTML = "<p>후보를 등록하면 결과를 확인할 수 있습니다.</p>";
    return;
  }

  const fragment = document.createDocumentFragment();

  results.forEach((result) => {
    const card = document.createElement("article");
    card.className = "list-card";

    const title = document.createElement("h3");
    title.textContent = result.candidate_name;

    const description = document.createElement("p");
    description.textContent = result.description || "설명 없음";

    const count = document.createElement("p");
    count.className = "result-count";
    count.textContent = `${result.vote_count}표`;

    card.append(title, description, count);
    fragment.appendChild(card);
  });

  resultList.appendChild(fragment);
}

async function loadAdminData() {
  const supabase = ensureSupabase();

  const [
    { data: config, error: configError },
    { data: candidates, error: candidateError },
    { data: codes, error: codeError },
    { data: results, error: resultError },
    { count: ballotCount, error: ballotError },
  ] = await Promise.all([
    supabase.from("app_config").select("*").eq("id", true).maybeSingle(),
    supabase
      .from("candidates")
      .select("id, name, description, display_order")
      .order("display_order", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("voter_codes")
      .select("id, code, used_at, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.rpc("get_candidate_results"),
    supabase.from("ballots").select("*", { count: "exact", head: true }),
  ]);

  if (configError || candidateError || codeError || resultError || ballotError) {
    throw configError ?? candidateError ?? codeError ?? resultError ?? ballotError;
  }

  configTitle.value = config?.title ?? "우리의 투표";
  configStartsAt.value = formatDateTimeInput(config?.starts_at);
  configMaxVotes.value = String(config?.max_votes_per_voter ?? 1);

  candidateDrafts =
    candidates?.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      description: candidate.description ?? "",
    })) ?? [];

  renderCandidateEditor();
  renderCodeList(codes ?? []);
  renderResults(results ?? [], ballotCount ?? 0);
}

async function refreshAdminState() {
  if (!hasSupabaseConfig) {
    setupError.classList.remove("hidden");
    return;
  }

  const supabase = ensureSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  setAdminUiState(session);

  if (!session) {
    isAdmin = false;
    bootstrapPanel.classList.add("hidden");
    adminPanel.classList.add("hidden");
    showAdminMessage("관리자 기능을 사용하려면 로그인해 주세요.");
    return;
  }

  const [{ data: adminValue, error: adminError }, { data: hasAdminUsers, error: hasAdminError }] =
    await Promise.all([supabase.rpc("is_admin"), supabase.rpc("has_admin_users")]);

  if (adminError || hasAdminError) {
    throw adminError ?? hasAdminError;
  }

  isAdmin = Boolean(adminValue);
  bootstrapPanel.classList.toggle("hidden", isAdmin || Boolean(hasAdminUsers));
  adminPanel.classList.toggle("hidden", !isAdmin);

  if (isAdmin) {
    showAdminMessage("관리자 권한으로 로그인되어 있습니다.");
    await loadAdminData();
  } else if (hasAdminUsers) {
    showAdminMessage("이 계정은 관리자 권한이 없습니다.", "error");
  } else {
    showAdminMessage("첫 관리자 등록을 진행해 주세요.");
  }
}

async function handleLogin(event) {
  event.preventDefault();
  showAdminMessage("로그인 중입니다.");

  try {
    const supabase = ensureSupabase();
    const { error } = await supabase.auth.signInWithPassword({
      email: authEmail.value.trim(),
      password: authPassword.value,
    });

    if (error) {
      throw error;
    }

    authPassword.value = "";
    await refreshAdminState();
  } catch (error) {
    showAdminMessage(error.message || "로그인에 실패했습니다.", "error");
  }
}

async function handleSignup() {
  showAdminMessage("회원가입을 요청하고 있습니다.");

  try {
    const supabase = ensureSupabase();
    const { error } = await supabase.auth.signUp({
      email: authEmail.value.trim(),
      password: authPassword.value,
    });

    if (error) {
      throw error;
    }

    showAdminMessage("회원가입 요청이 완료되었습니다. 이메일 인증이 필요할 수 있습니다.", "success");
  } catch (error) {
    showAdminMessage(error.message || "회원가입에 실패했습니다.", "error");
  }
}

async function handleLogout() {
  try {
    const supabase = ensureSupabase();
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw error;
    }

    await refreshAdminState();
  } catch (error) {
    showAdminMessage(error.message || "로그아웃에 실패했습니다.", "error");
  }
}

async function handleBootstrapAdmin() {
  bootstrapButton.disabled = true;

  try {
    const supabase = ensureSupabase();
    const { error } = await supabase.rpc("bootstrap_admin");

    if (error) {
      throw error;
    }

    showAdminMessage("첫 관리자 등록이 완료되었습니다.", "success");
    await refreshAdminState();
  } catch (error) {
    showAdminMessage(error.message || "관리자 등록에 실패했습니다.", "error");
  } finally {
    bootstrapButton.disabled = false;
  }
}

async function saveConfig(event) {
  event.preventDefault();

  if (!configStartsAt.value) {
    showAdminMessage("공개 시작 시각을 입력해 주세요.", "error");
    return;
  }

  try {
    const supabase = ensureSupabase();
    const { error } = await supabase.from("app_config").upsert({
      id: true,
      title: configTitle.value.trim(),
      starts_at: new Date(configStartsAt.value).toISOString(),
      max_votes_per_voter: Number(configMaxVotes.value),
    });

    if (error) {
      throw error;
    }

    showAdminMessage("기본 설정이 저장되었습니다.", "success");
    await loadAdminData();
  } catch (error) {
    showAdminMessage(error.message || "기본 설정 저장에 실패했습니다.", "error");
  }
}

async function saveCandidates(event) {
  event.preventDefault();

  const candidates = sanitizeCandidates();

  if (!candidates.length) {
    showAdminMessage("최소 1명의 후보를 입력해 주세요.", "error");
    return;
  }

  try {
    const supabase = ensureSupabase();
    const { data: existingCandidates, error: existingError } = await supabase
      .from("candidates")
      .select("id");

    if (existingError) {
      throw existingError;
    }

    const nextIds = new Set(
      candidates.filter((candidate) => candidate.id).map((candidate) => candidate.id),
    );
    const deleteIds = (existingCandidates ?? [])
      .map((candidate) => candidate.id)
      .filter((id) => !nextIds.has(id));

    if (deleteIds.length) {
      const { error: deleteError } = await supabase.from("candidates").delete().in("id", deleteIds);

      if (deleteError) {
        throw deleteError;
      }
    }

    const payload = candidates.map((candidate) => ({
      ...(candidate.id ? { id: candidate.id } : {}),
      name: candidate.name,
      description: candidate.description,
      display_order: candidate.display_order,
    }));

    const { error: upsertError } = await supabase.from("candidates").upsert(payload);

    if (upsertError) {
      throw upsertError;
    }

    showAdminMessage("후보 목록이 저장되었습니다.", "success");
    await loadAdminData();
  } catch (error) {
    showAdminMessage(error.message || "후보 저장에 실패했습니다.", "error");
  }
}

async function generateCodes(event) {
  event.preventDefault();

  const count = Number(codeCount.value);
  const prefix = codePrefix.value.trim();

  if (!count || count < 1) {
    showAdminMessage("생성할 개수를 1 이상 입력해 주세요.", "error");
    return;
  }

  const uniqueCodes = new Set();

  while (uniqueCodes.size < count) {
    uniqueCodes.add(randomCode(prefix));
  }

  const payload = Array.from(uniqueCodes, (code) => ({ code }));

  try {
    const supabase = ensureSupabase();
    const { error } = await supabase.from("voter_codes").insert(payload);

    if (error) {
      throw error;
    }

    generatedCodes.value = payload.map((item) => item.code).join("\n");
    showAdminMessage(`${count}개의 참여코드를 생성했습니다.`, "success");
    await loadAdminData();
  } catch (error) {
    showAdminMessage(error.message || "참여코드 생성에 실패했습니다.", "error");
  }
}

addCandidateButton.addEventListener("click", () => {
  candidateDrafts.push({ id: null, name: "", description: "" });
  renderCandidateEditor();
});

authForm.addEventListener("submit", handleLogin);
signupButton.addEventListener("click", handleSignup);
logoutButton.addEventListener("click", handleLogout);
bootstrapButton.addEventListener("click", handleBootstrapAdmin);
configForm.addEventListener("submit", saveConfig);
candidateForm.addEventListener("submit", saveCandidates);
codeForm.addEventListener("submit", generateCodes);

if (hasSupabaseConfig) {
  const supabase = ensureSupabase();

  supabase.auth.onAuthStateChange(() => {
    refreshAdminState().catch((error) => {
      console.error(error);
      showAdminMessage(error.message || "관리자 상태를 새로고침하지 못했습니다.", "error");
    });
  });
}

refreshAdminState().catch((error) => {
  console.error(error);
  showAdminMessage(error.message || "관리자 페이지를 불러오지 못했습니다.", "error");
});
