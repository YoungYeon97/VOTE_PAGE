import {
  ensureSupabase,
  formatDateTime,
  hasSupabaseConfig,
  setText,
} from "./supabase.js";

const setupError = document.querySelector("#setup-error");
const statusPanel = document.querySelector("#status-panel");
const votePanel = document.querySelector("#vote-panel");
const messagePanel = document.querySelector("#message-panel");
const messageText = document.querySelector("#message-text");
const voteTitle = document.querySelector("#vote-title");
const voteSubtitle = document.querySelector("#vote-subtitle");
const voteStatus = document.querySelector("#vote-status");
const startsAt = document.querySelector("#starts-at");
const maxVotes = document.querySelector("#max-votes");
const statusMessage = document.querySelector("#status-message");
const selectionCount = document.querySelector("#selection-count");
const candidateList = document.querySelector("#candidate-list");
const voteForm = document.querySelector("#vote-form");
const voterCodeInput = document.querySelector("#voter-code");
const submitButton = document.querySelector("#submit-button");

let currentConfig = null;
let countdownTimer = null;

function showMessage(message, tone = "normal") {
  messagePanel.classList.remove("hidden");
  messageText.textContent = message;
  messageText.style.color =
    tone === "error" ? "var(--danger)" : tone === "success" ? "var(--success)" : "var(--muted)";
}

function clearMessage() {
  messagePanel.classList.add("hidden");
  messageText.textContent = "";
}

function updateSelectionCount() {
  const checkedCount = candidateList.querySelectorAll("input[type='checkbox']:checked").length;
  setText(selectionCount, `${checkedCount}개 선택`);

  candidateList.querySelectorAll(".candidate-option").forEach((option) => {
    const input = option.querySelector("input[type='checkbox']");
    option.classList.toggle("selected", Boolean(input?.checked));
  });
}

function enforceSelectionLimit(event) {
  const checkedCount = candidateList.querySelectorAll("input[type='checkbox']:checked").length;

  if (checkedCount > currentConfig.max_votes_per_voter) {
    event.target.checked = false;
    showMessage(`최대 ${currentConfig.max_votes_per_voter}명까지 선택할 수 있습니다.`, "error");
  } else {
    clearMessage();
  }

  updateSelectionCount();
}

function renderCandidates(candidates) {
  candidateList.innerHTML = "";

  if (!candidates.length) {
    candidateList.innerHTML = "<p>후보가 아직 등록되지 않았습니다.</p>";
    return;
  }

  const fragment = document.createDocumentFragment();

  candidates.forEach((candidate) => {
    const label = document.createElement("label");
    label.className = "candidate-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = String(candidate.id);
    checkbox.addEventListener("change", enforceSelectionLimit);

    const content = document.createElement("div");

    const name = document.createElement("h3");
    name.className = "candidate-name";
    name.textContent = candidate.name;

    const description = document.createElement("p");
    description.className = "candidate-description";
    description.textContent = candidate.description || "설명 없음";

    content.append(name, description);
    label.append(checkbox, content);
    fragment.appendChild(label);
  });

  candidateList.appendChild(fragment);
  updateSelectionCount();
}

function updateStatus(opened) {
  if (!currentConfig) {
    return;
  }

  const now = new Date();
  const openAt = new Date(currentConfig.starts_at);

  if (opened) {
    setText(voteStatus, "공개됨");
    setText(statusMessage, "참여코드와 후보를 확인한 뒤 투표를 제출해 주세요.");
    votePanel.classList.remove("hidden");
    voteSubtitle.textContent = "후보를 선택하고 참여코드로 투표할 수 있습니다.";
    return;
  }

  const diffMs = openAt.getTime() - now.getTime();
  const totalMinutes = Math.max(0, Math.floor(diffMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  setText(voteStatus, "대기 중");
  setText(statusMessage, `공개까지 ${hours}시간 ${minutes}분 남았습니다.`);
  votePanel.classList.add("hidden");
  voteSubtitle.textContent = "정해진 공개 시간이 되면 자동으로 투표가 열립니다.";
}

function startCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
  }

  countdownTimer = window.setInterval(() => {
    if (!currentConfig) {
      return;
    }

    const opened = new Date(currentConfig.starts_at) <= new Date();
    updateStatus(opened);

    if (opened) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }, 1000);
}

async function loadVotePage() {
  if (!hasSupabaseConfig) {
    setupError.classList.remove("hidden");
    return;
  }

  const supabase = ensureSupabase();
  statusPanel.classList.remove("hidden");

  const [{ data: config, error: configError }, { data: candidates, error: candidateError }] =
    await Promise.all([
      supabase.from("app_config").select("*").eq("id", true).maybeSingle(),
      supabase
        .from("candidates")
        .select("id, name, description, display_order")
        .order("display_order", { ascending: true })
        .order("id", { ascending: true }),
    ]);

  if (configError || candidateError) {
    showMessage("투표 정보를 불러오지 못했습니다. Supabase 설정을 확인해 주세요.", "error");
    throw configError ?? candidateError;
  }

  if (!config) {
    setText(voteTitle, "아직 투표가 설정되지 않았습니다");
    setText(voteSubtitle, "관리자 페이지에서 제목, 공개 시간, 후보를 먼저 등록해 주세요.");
    setText(voteStatus, "미설정");
    setText(startsAt, "-");
    setText(maxVotes, "-");
    setText(statusMessage, "설정이 완료되면 이 페이지에서 투표를 받을 수 있습니다.");
    return;
  }

  currentConfig = config;

  setText(voteTitle, currentConfig.title);
  setText(startsAt, formatDateTime(currentConfig.starts_at));
  setText(maxVotes, `${currentConfig.max_votes_per_voter}명`);
  renderCandidates(candidates ?? []);

  const opened = new Date(currentConfig.starts_at) <= new Date();
  updateStatus(opened);

  if (!opened) {
    startCountdown();
  }
}

async function submitVote(event) {
  event.preventDefault();
  clearMessage();

  if (!currentConfig) {
    showMessage("투표가 아직 설정되지 않았습니다.", "error");
    return;
  }

  const selectedCandidateIds = Array.from(
    candidateList.querySelectorAll("input[type='checkbox']:checked"),
  ).map((input) => Number(input.value));

  if (!selectedCandidateIds.length) {
    showMessage("최소 1명의 후보를 선택해 주세요.", "error");
    return;
  }

  submitButton.disabled = true;

  try {
    const supabase = ensureSupabase();
    const { error } = await supabase.rpc("submit_vote", {
      code_input: voterCodeInput.value.trim(),
      candidate_ids_input: selectedCandidateIds,
    });

    if (error) {
      throw error;
    }

    voteForm.reset();
    updateSelectionCount();
    showMessage("투표가 정상적으로 제출되었습니다.", "success");
  } catch (error) {
    showMessage(error?.message || "투표 제출 중 오류가 발생했습니다.", "error");
  } finally {
    submitButton.disabled = false;
  }
}

voteForm.addEventListener("submit", submitVote);

loadVotePage().catch((error) => {
  console.error(error);
});
