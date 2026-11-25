// Generates the profile README images into ./dist:
//   github-snake.svg / github-snake-dark.svg  - snake that eats the contribution
//                                               grid in order, week by week
//   github-stats.svg                           - GitHub stats card
// Needs GITHUB_TOKEN (the workflow's built-in token is enough) and GITHUB_USER.
import { mkdirSync, writeFileSync } from "node:fs";

const USER = process.env.GITHUB_USER || "akashsaladi";
const TOKEN = process.env.GITHUB_TOKEN;
const OUT = process.env.OUT_DIR || "dist";
if (!TOKEN) throw new Error("GITHUB_TOKEN is not set");

const QUERY = `query($login: String!) {
  user(login: $login) {
    name login
    followers { totalCount }
    pullRequests { totalCount }
    issues { totalCount }
    repositoriesContributedTo(first: 1, contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, REPOSITORY]) { totalCount }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) {
      totalCount nodes { stargazerCount }
    }
    contributionsCollection {
      totalCommitContributions
      restrictedContributionsCount
      contributionCalendar {
        totalContributions
        weeks { contributionDays { contributionLevel weekday date contributionCount } }
      }
    }
  }
}`;

async function fetchUser() {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json", "User-Agent": "profile-assets" },
      body: JSON.stringify({ query: QUERY, variables: { login: USER } }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.data?.user) return json.data.user;
    if (attempt >= 3) throw new Error(`GitHub API error ${res.status}: ${JSON.stringify(json.errors || json)}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const r2 = (n) => Math.round(n * 100) / 100;
const pct = (n) => `${Math.round(n * 10000) / 10000}%`;

// ---------------------------------------------------------------- snake ----
const LEVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };

const THEMES = {
  light: {
    cells: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
    head: "#0969da", tail: "#8250df", belly: "#ffffff", eye: "#ffffff", pupil: "#1f2328", tongue: "#e5534b",
  },
  dark: {
    cells: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"],
    head: "#00d9ff", tail: "#7b61ff", belly: "#0d1117", eye: "#ffffff", pupil: "#0d1117", tongue: "#ff4d6d",
  },
};

function mix(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

function snakeSvg(weeks, theme) {
  const T = THEMES[theme];
  const CELL = 11, GAP = 3, PITCH = CELL + GAP, PAD = 12;
  const COLS = weeks.length, ROWS = 7;
  const LEN = 7;            // body length in cells
  const STEP = 0.09;        // seconds per cell
  const HOLD = 1.5;         // pause on the eaten grid before it resets
  const W = PAD * 2 + COLS * PITCH - GAP, H = PAD * 2 + ROWS * PITCH - GAP;
  const cx = (c) => PAD + c * PITCH + CELL / 2;
  const cy = (r) => PAD + r * PITCH + CELL / 2;

  // Path: slide in from the left on row 0, sweep every week top->bottom then
  // bottom->top (a zig-zag, so the cells are eaten in order), then slide out right.
  const path = [];
  for (let c = -(LEN + 2); c < 0; c++) path.push([c, 0]);
  for (let c = 0; c < COLS; c++)
    for (let i = 0; i < ROWS; i++) path.push([c, c % 2 === 0 ? i : ROWS - 1 - i]);
  const lastRow = path[path.length - 1][1];
  for (let c = COLS; c < COLS + LEN + 3; c++) path.push([c, lastRow]);

  const N = path.length;
  const D = (N - 1) * STEP + HOLD;
  const angleOf = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
  const angles = path.map((p, k) => (k < N - 1 ? angleOf(p, path[k + 1]) : angleOf(path[k - 1], p)));
  // Unwrap so the head always turns the short way.
  for (let k = 1; k < N; k++) {
    while (angles[k] - angles[k - 1] > 180) angles[k] -= 360;
    while (angles[k] - angles[k - 1] < -180) angles[k] += 360;
  }

  let move = "@keyframes m{";
  path.forEach(([c, r], k) => {
    move += `${pct((k * STEP / D) * 100)}{transform:translate(${r2(cx(c))}px,${r2(cy(r))}px) rotate(${r2(angles[k])}deg)}`;
  });
  move += `100%{transform:translate(${r2(cx(path[N - 1][0]))}px,${r2(cy(path[N - 1][1]))}px) rotate(${r2(angles[N - 1])}deg)}}`;

  // Cells: each green cell disappears the moment the head reaches it.
  const order = new Map(path.map(([c, r], k) => [`${c},${r}`, k]));
  let cells = "", cellCss = "", n = 0;
  weeks.forEach((w, c) => {
    for (const d of w.contributionDays) {
      const lvl = LEVEL[d.contributionLevel] ?? 0;
      const x = PAD + c * PITCH, y = PAD + d.weekday * PITCH;
      if (lvl === 0) {
        cells += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${T.cells[0]}"/>`;
        continue;
      }
      const t = (order.get(`${c},${d.weekday}`) * STEP / D) * 100;
      cellCss += `@keyframes c${n}{0%,${pct(t)}{fill:${T.cells[lvl]}}${pct(t + 0.01)},100%{fill:${T.cells[0]}}}.c${n}{animation:c${n} ${r2(D)}s linear infinite}`;
      cells += `<rect class="c${n}" x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${T.cells[lvl]}"/>`;
      n++;
    }
  });

  // Body: overlapping circles every half cell, tapering towards the tail.
  const SEGS = LEN * 2;
  const segDelay = (i) => -(D - i * STEP / 2);
  let body = "";
  for (let i = SEGS; i >= 1; i--) {
    const t = i / SEGS;
    const rad = r2(6.2 - 3.2 * t);
    const col = mix(T.head, T.tail, t);
    body += `<g class="s" style="animation-delay:${r2(segDelay(i))}s"><circle r="${rad}" fill="${col}"/>` +
      (i % 2 === 0 ? `<circle r="${r2(rad * 0.35)}" fill="${T.belly}" opacity=".25"/>` : "") + `</g>`;
  }
  const head =
    `<g class="s" style="animation-delay:${r2(segDelay(0))}s">` +
    `<g><path d="M6 0H10.5M10.5 0L12.5 -1.6M10.5 0L12.5 1.6" stroke="${T.tongue}" stroke-width="1.1" stroke-linecap="round" fill="none">` +
    `<animateTransform attributeName="transform" type="scale" values="0 1;0 1;1 1;1 1;0 1" keyTimes="0;.55;.65;.85;1" dur="1.3s" repeatCount="indefinite"/></path></g>` +
    `<path d="M-6.5 -6.2H1.5Q8 -6.2 8 0Q8 6.2 1.5 6.2H-6.5Z" fill="${T.head}"/>` +
    `<circle cx="2.2" cy="-3.1" r="2.3" fill="${T.eye}"/><circle cx="2.2" cy="3.1" r="2.3" fill="${T.eye}"/>` +
    `<circle cx="3" cy="-3.1" r="1.2" fill="${T.pupil}"/><circle cx="3" cy="3.1" r="1.2" fill="${T.pupil}"/>` +
    `<circle cx="3.4" cy="-3.6" r=".45" fill="${T.eye}"/><circle cx="3.4" cy="2.6" r=".45" fill="${T.eye}"/>` +
    `</g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<style>${move}.s{animation:m ${r2(D)}s linear infinite}${cellCss}</style>` +
    cells + body + head + `</svg>`;
}

// ---------------------------------------------------------------- stats ----
const ICONS = {
  star: `<path d="M8 .8l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L.8 6.1l5-.7z"/>`,
  commit: `<path d="M8 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zm0 1.6a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8zM0 7.2h4.4v1.6H0zm11.6 0H16v1.6h-4.4z"/>`,
  pr: `<path d="M4 1.5a2 2 0 0 1 .8 3.8v5.4a2 2 0 1 1-1.6 0V5.3A2 2 0 0 1 4 1.5zm8 9.2a2 2 0 1 1-1.6 0V6.5c0-.6-.4-1-1-1H8.2l1.4 1.4-1.1 1.1L5.3 4.8 8.5 1.6l1.1 1.1-1.4 1.2h1.2a2.6 2.6 0 0 1 2.6 2.6z"/>`,
  issue: `<path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1zm0 1.6a5.4 5.4 0 1 0 0 10.8A5.4 5.4 0 0 0 8 2.6zM8 6.3a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4z"/>`,
  repo: `<path d="M3 1h10v12H4.5a1 1 0 0 0 0 2H13v1H4.5A2.5 2.5 0 0 1 2 13.5V2a1 1 0 0 1 1-1zm1 1.6v8.5c.2 0 .3-.1.5-.1h7V2.6z"/>`,
  people: `<path d="M5.5 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM0 14c0-3 2.5-5 5.5-5s5.5 2 5.5 5zM11.5 3a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zm.5 6c2.3.3 4 2 4 5h-3.6c0-2-.2-3.6-.4-5z"/>`,
};

function statsSvg(u) {
  const cc = u.contributionsCollection;
  const stars = u.repositories.nodes.reduce((s, r) => s + r.stargazerCount, 0);
  const year = cc.contributionCalendar.totalContributions;
  const rows = [
    ["star", "Total Stars Earned", stars],
    ["commit", "Commits (last year)", cc.totalCommitContributions + cc.restrictedContributionsCount],
    ["pr", "Total PRs", u.pullRequests.totalCount],
    ["issue", "Total Issues", u.issues.totalCount],
    ["repo", "Public Repos", u.repositories.totalCount],
    ["people", "Contributed to", u.repositoriesContributedTo.totalCount],
  ];
  const C = { bg: "#0d1117", title: "#00d9ff", text: "#ffffff", icon: "#00d9ff", muted: "#8b949e", ring: "#1f2a37" };
  const RING_R = 42, CIRC = 2 * Math.PI * RING_R;
  const fill = Math.min(1, year / 1000); // ring fills up at 1000 contributions a year
  const name = u.name || u.login;

  const lines = rows.map(([icon, label, value], i) => {
    const y = 62 + i * 24;
    return `<g transform="translate(25 ${y})" class="row" style="animation-delay:${150 + i * 120}ms">` +
      `<g transform="translate(0 -12)" fill="${C.icon}">${ICONS[icon]}</g>` +
      `<text x="25" y="0" class="lbl">${esc(label)}:</text><text x="200" y="0" class="val">${value.toLocaleString("en-US")}</text></g>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="467" height="200" viewBox="0 0 467 200">` +
    `<style>` +
    `text{font-family:'Segoe UI',Ubuntu,'Helvetica Neue',sans-serif}` +
    `.title{font-size:18px;font-weight:600;fill:${C.title}}` +
    `.lbl{font-size:14px;font-weight:600;fill:${C.text}}.val{font-size:14px;font-weight:700;fill:${C.text}}` +
    `.row{opacity:0;animation:fade .4s ease-in-out forwards}` +
    `.big{font-size:22px;font-weight:800;fill:${C.text}}.small{font-size:11px;fill:${C.muted}}` +
    `.ring{stroke-dasharray:${r2(CIRC)};stroke-dashoffset:${r2(CIRC)};animation:ring 1.2s ease-out forwards}` +
    `@keyframes fade{to{opacity:1}}@keyframes ring{to{stroke-dashoffset:${r2(CIRC * (1 - fill))}}}` +
    `</style>` +
    `<rect width="467" height="200" rx="6" fill="${C.bg}"/>` +
    `<text x="25" y="35" class="title">${esc(name)}'s GitHub Stats</text>` +
    lines +
    `<g transform="translate(385 105)">` +
    `<circle r="${RING_R}" fill="none" stroke="${C.ring}" stroke-width="7"/>` +
    `<circle class="ring" r="${RING_R}" fill="none" stroke="${C.title}" stroke-width="7" stroke-linecap="round" transform="rotate(-90)"/>` +
    `<text y="4" text-anchor="middle" class="big">${year.toLocaleString("en-US")}</text>` +
    `<text y="22" text-anchor="middle" class="small">contributions</text>` +
    `<text y="-20" text-anchor="middle" class="small">last year</text>` +
    `</g></svg>`;
}

// ----------------------------------------------------------------- main ----
const user = await fetchUser();
const weeks = user.contributionsCollection.contributionCalendar.weeks;
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/github-snake.svg`, snakeSvg(weeks, "light"));
writeFileSync(`${OUT}/github-snake-dark.svg`, snakeSvg(weeks, "dark"));
writeFileSync(`${OUT}/github-stats.svg`, statsSvg(user));
console.log(`Wrote snake (${weeks.length} weeks) and stats card for ${user.login} to ${OUT}/`);
