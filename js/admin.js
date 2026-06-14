import {
  ensureSupabase,
  formatDateTime,
  formatDateTimeInput,
  hasSupabaseConfig,
  setText,
} from "./supabase.js";

const ADMIN_PASSWORD_KEY = "vote-admin-password";

const setupError = document.querySelector("#admin-setup-error");
const adminPanel = document.querySelector("#admin-panel");
const authStatus = document.querySelector("#auth-status");
const authForm = document.querySelector("#auth-form");
const authPassword = document.querySelector("#auth-password");
const lockButton = document.querySelector("#lock-button");
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

let adminPassword = sessionStorage.getItem(ADMIN_PASSWORD_KEY) ?? "";
let candidateDrafts = [];

function showAdminMessage(message, tone = "normal") {
  adminMessage.textContent = message;
  adminMessage.style.color =
    tone === "error" ? "var(--danger)" : tone === "success" ? "var(--success)" : "var(--muted)";
}

function setUnlockedState(unlocked) {
  setText(authStatus, unlocked ? "관리자 열림" : "잠금 상태");
  adminPanel.classList.toggle("hidden", !unlocked);
  lockButton.classList.toggle("hidden", !unlocked);
  authPassword.value = unlocked ? adminPassword : "";

  if (!unlocked) {
    generatedCodes.value = "";
  }
}

function rememberPassword(nextPassword) {
  adminPassword = nextPassword;

  if (nextPassword) {
    sessionStorage.setItem(ADMIN_PASSWORD_KEY, nextPassword);
  } else {
    sessionStorage.removeItem(ADMIN_PASSWORD_KEY);
  }
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
      name: candidate.name.trim(),
      description: candidate.description.trim(),
      display_order: index + 1,
    }))
    .filter((candidate) => candidate.name);
}

function renderCandidateEditor() {
  candidateEditor.innerHTML = "";

  if (!candidateDrafts.length) {
    candidateDrafts = [{ name: "", description: "" }];
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
  const { data, error } = await supabase.rpc("get_admin_dashboard", {
    admin_password: adminPassword,
  });

  if (error) {
    throw error;
  }

  const config = data?.config ?? null;
  const candidates = data?.candidates ?? [];
  const codes = data?.codes ?? [];
  const results = data?.results ?? [];
  const ballotCount = Number(data?.ballot_count ?? 0);

  configTitle.value = config?.title ?? "우리의 투표";
  configStartsAt.value = formatDateTimeInput(config?.starts_at);
  configMaxVotes.value = String(config?.max_votes_per_voter ?? 1);

  candidateDrafts = candidates.map((candidate) => ({
    name: candidate.name,
    description: candidate.description ?? "",
  }));

  renderCandidateEditor();
  renderCodeList(codes);
  renderResults(results, ballotCount);
}

async function unlockAdmin(event) {
  event.preventDefault();

  const nextPassword = authPassword.value.trim();

  if (!nextPassword) {
    showAdminMessage("관리자 비밀번호를 입력해 주세요.", "error");
    return;
  }

  showAdminMessage("관리자 확인 중입니다.");

  try {
    const supabase = ensureSupabase();
    const { data, error } = await supabase.rpc("verify_admin_password", {
      admin_password: nextPassword,
    });

    if (error) {
      throw error;
    }

    if (!data) {
      showAdminMessage("관리자 비밀번호가 올바르지 않습니다.", "error");
      return;
    }

    rememberPassword(nextPassword);
    setUnlockedState(true);
    await loadAdminData();
    showAdminMessage("관리자 화면이 열렸습니다.", "success");
  } catch (error) {
    showAdminMessage(error.message || "관리자 확인에 실패했습니다.", "error");
  }
}

function lockAdmin() {
  rememberPassword("");
  setUnlockedState(false);
  showAdminMessage("관리자 화면을 잠갔습니다.");
}

async function saveConfig(event) {
  event.preventDefault();

  if (!configStartsAt.value) {
    showAdminMessage("공개 시작 시각을 입력해 주세요.", "error");
    return;
  }

  try {
    const supabase = ensureSupabase();
    const { error } = await supabase.rpc("save_admin_config", {
      admin_password: adminPassword,
      title_input: configTitle.value.trim(),
      starts_at_input: new Date(configStartsAt.value).toISOString(),
      max_votes_input: Number(configMaxVotes.value),
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
    const { error } = await supabase.rpc("replace_candidates", {
      admin_password: adminPassword,
      candidates_input: candidates,
    });

    if (error) {
      throw error;
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

  const codes = Array.from(uniqueCodes);

  try {
    const supabase = ensureSupabase();
    const { error } = await supabase.rpc("create_voter_codes", {
      admin_password: adminPassword,
      codes_input: codes,
    });

    if (error) {
      throw error;
    }

    generatedCodes.value = codes.join("\n");
    showAdminMessage(`${count}개의 참여코드를 생성했습니다.`, "success");
    await loadAdminData();
  } catch (error) {
    showAdminMessage(error.message || "참여코드 생성에 실패했습니다.", "error");
  }
}

async function restoreAdminSession() {
  if (!hasSupabaseConfig) {
    setupError.classList.remove("hidden");
    return;
  }

  if (!adminPassword) {
    setUnlockedState(false);
    showAdminMessage("관리자 비밀번호를 입력해 주세요.");
    return;
  }

  setUnlockedState(true);

  try {
    await loadAdminData();
    showAdminMessage("이전 관리자 세션을 복원했습니다.", "success");
  } catch (error) {
    rememberPassword("");
    setUnlockedState(false);
    showAdminMessage(error.message || "관리자 세션 복원에 실패했습니다.", "error");
  }
}

addCandidateButton.addEventListener("click", () => {
  candidateDrafts.push({ name: "", description: "" });
  renderCandidateEditor();
});

authForm.addEventListener("submit", unlockAdmin);
lockButton.addEventListener("click", lockAdmin);
configForm.addEventListener("submit", saveConfig);
candidateForm.addEventListener("submit", saveCandidates);
codeForm.addEventListener("submit", generateCodes);

restoreAdminSession().catch((error) => {
  console.error(error);
  showAdminMessage(error.message || "관리자 페이지를 불러오지 못했습니다.", "error");
});
