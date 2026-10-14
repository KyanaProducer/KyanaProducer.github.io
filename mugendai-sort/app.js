(() => {
  "use strict";

  const songs = Array.from(new Set((window.MUGENDAI_SONGS || []).map((song) => song.trim()).filter(Boolean)));
  const STORAGE_KEY = "mugendai-song-sort-state-v1";
  const signature = songs.join("\u241f");
  let state = null;
  let history = [];

  const $ = (id) => document.getElementById(id);
  const views = {
    start: $("start-view"),
    sort: $("sort-view"),
    result: $("result-view")
  };

  function shuffle(values) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function insertionBudget(groupCount) {
    return Math.ceil(Math.log2(groupCount + 1));
  }

  function initialEstimate(count) {
    let total = 0;
    for (let groups = 1; groups < count; groups += 1) total += insertionBudget(groups);
    return total;
  }

  function cloneCore() {
    return JSON.parse(JSON.stringify(state));
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ signature, state, history }));
  }

  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || saved.signature !== signature || !saved.state) return false;
      state = saved.state;
      history = Array.isArray(saved.history) ? saved.history : [];
      return state.phase === "sorting" || state.phase === "result";
    } catch {
      return false;
    }
  }

  function showView(name) {
    Object.entries(views).forEach(([key, element]) => element.classList.toggle("hidden", key !== name));
  }

  function start() {
    if (songs.length < 2) {
      alert("ソートには2曲以上必要です。songs.jsに楽曲を追加してください。");
      return;
    }
    const order = shuffle(songs);
    state = {
      phase: "sorting",
      order,
      groups: [[order[0]]],
      nextIndex: 1,
      search: null,
      decisions: 0,
      resolvedBudget: 0
    };
    history = [];
    beginInsertion();
  }

  function beginInsertion() {
    if (state.nextIndex >= state.order.length) {
      finish();
      return;
    }
    const groupCount = state.groups.length;
    state.search = {
      song: state.order[state.nextIndex],
      low: 0,
      high: groupCount - 1,
      mid: Math.floor((groupCount - 1) / 2),
      budget: insertionBudget(groupCount),
      used: 0,
      flip: Math.random() < 0.5
    };
    persist();
    renderSort();
  }

  function saveHistory() {
    history.push(cloneCore());
    if (history.length > 50) history.shift();
  }

  function choose(result) {
    if (!state || state.phase !== "sorting") return;
    saveHistory();
    const search = state.search;
    const newSongIsLeft = !search.flip;
    state.decisions += 1;
    search.used += 1;

    if (result === "tie") {
      state.groups[search.mid].push(search.song);
      completeInsertion();
      return;
    }

    const choseNewSong = (result === "left" && newSongIsLeft) || (result === "right" && !newSongIsLeft);
    if (choseNewSong) search.high = search.mid - 1;
    else search.low = search.mid + 1;

    if (search.low > search.high) {
      state.groups.splice(search.low, 0, [search.song]);
      completeInsertion();
      return;
    }

    search.mid = Math.floor((search.low + search.high) / 2);
    search.flip = Math.random() < 0.5;
    persist();
    renderSort();
  }

  function completeInsertion() {
    state.resolvedBudget += state.search.budget;
    state.nextIndex += 1;
    state.search = null;
    beginInsertion();
  }

  function remainingUpperBound() {
    if (!state.search) return 0;
    let remaining = state.search.budget - state.search.used;
    let possibleGroups = state.groups.length + 1;
    const songsAfterCurrent = state.order.length - state.nextIndex - 1;
    for (let i = 0; i < songsAfterCurrent; i += 1) {
      remaining += insertionBudget(possibleGroups);
      possibleGroups += 1;
    }
    return remaining;
  }

  function currentPair() {
    const search = state.search;
    const existing = state.groups[search.mid][0];
    return search.flip
      ? { left: existing, right: search.song }
      : { left: search.song, right: existing };
  }

  function renderSort() {
    showView("sort");
    const pair = currentPair();
    $("left-title").textContent = pair.left;
    $("right-title").textContent = pair.right;

    const remaining = remainingUpperBound();
    const done = state.resolvedBudget + state.search.used;
    const percent = Math.min(99, Math.round((done / (done + remaining)) * 100));
    $("progress-percent").textContent = `${percent}%`;
    $("progress-bar").style.width = `${percent}%`;
    $("decision-count").textContent = state.decisions;
    $("remaining-count").textContent = `最大あと ${remaining} 回`;
    $("placed-copy").textContent = `${state.nextIndex} / ${state.order.length} 曲の位置を決定済み`;
    $("undo-button").disabled = history.length === 0;
  }

  function finish() {
    state.phase = "result";
    state.search = null;
    persist();
    renderResults();
  }

  function rankingRows() {
    let rank = 1;
    return state.groups.map((group) => {
      const row = { rank, songs: group };
      rank += group.length;
      return row;
    });
  }

  function appendRanking(target, rows, topOnly) {
    target.replaceChildren();
    rows.forEach((row) => {
      if (topOnly && row.rank > 5) return;
      const li = document.createElement("li");
      const rank = document.createElement("span");
      rank.className = "rank-no";
      rank.textContent = `${row.rank}位`;
      const title = document.createElement("span");
      title.className = "rank-title";
      title.textContent = row.songs.join(" ／ ");
      li.append(rank, title);
      target.append(li);
    });
  }

  function renderResults() {
    showView("result");
    const rows = rankingRows();
    appendRanking($("top-five"), rows, true);
    appendRanking($("all-ranking"), rows, false);
    window.scrollTo({ top: views.result.closest(".sorter").offsetTop - 20, behavior: "smooth" });
  }

  function undo() {
    const previous = history.pop();
    if (!previous) return;
    state = previous;
    persist();
    renderSort();
  }

  function reset() {
    localStorage.removeItem(STORAGE_KEY);
    start();
  }

  $("song-count").textContent = `${songs.length}曲`;
  $("comparison-estimate").textContent = `最大約${initialEstimate(songs.length)}回`;
  $("start-button").addEventListener("click", start);
  $("resume-button").addEventListener("click", () => state.phase === "result" ? renderResults() : renderSort());
  $("left-choice").addEventListener("click", () => choose("left"));
  $("right-choice").addEventListener("click", () => choose("right"));
  $("tie-choice").addEventListener("click", () => choose("tie"));
  $("undo-button").addEventListener("click", undo);
  $("restart-button").addEventListener("click", reset);
  $("result-restart-button").addEventListener("click", reset);

  if (restore()) $("resume-button").classList.remove("hidden");
})();

