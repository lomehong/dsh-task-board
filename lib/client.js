window.__ModuleLoader__.load({
	id: "@dsh-extra/dsh-task-board",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var inject = ["slots"];
var COLUMNS = [
  { id: "\u5F85\u89C4\u5212", label: "\u5F85\u89C4\u5212" },
  { id: "\u5F85\u529E", label: "\u5F85\u529E" },
  { id: "\u8FDB\u884C\u4E2D", label: "\u8FDB\u884C\u4E2D" },
  { id: "\u5DF2\u5B8C\u6210", label: "\u5DF2\u5B8C\u6210" },
  { id: "\u5DF2\u5931\u8D25", label: "\u5DF2\u5931\u8D25" }
];
var SETTLED_LIMIT = 5;
var LIST_PAGE_SIZE = 50;
var LEVEL_OPTIONS = ["L0", "L1", "L2", "L3"];
var s = {
  wrap: { padding: "14px 20px 48px" },
  head: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 },
  h: { fontSize: 18, fontWeight: 700, margin: 0, color: "var(--dsw-alias-label-primary)" },
  badge: { fontSize: 12, fontWeight: 600, padding: "2px 10px", borderRadius: 999, background: "var(--dsw-alias-state-success-tertiary)", color: "var(--dsw-alias-state-success-primary)" },
  badgeDegraded: { fontSize: 12, fontWeight: 600, padding: "2px 10px", borderRadius: 999, background: "var(--dsw-alias-state-warn-tertiary)", color: "var(--dsw-alias-state-warn-primary)" },
  sub: { fontSize: 12.5, color: "var(--dsw-alias-label-tertiary)", margin: "0 0 12px", lineHeight: 1.6 },
  actionRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "10px 14px", marginBottom: 12, background: "var(--dsw-alias-bg-layer-2)", border: "1px solid var(--dsw-alias-border-l1)", borderRadius: 12 },
  btn: { padding: "7px 18px", border: "none", borderRadius: 8, background: "var(--dsw-alias-state-business-primary)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  btn2: { padding: "6px 14px", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 8, background: "var(--dsw-alias-bg-layer-2)", color: "var(--dsw-alias-label-secondary)", fontSize: 12.5, cursor: "pointer" },
  btn2Active: { padding: "6px 14px", border: "1px solid var(--dsw-alias-state-business-primary)", borderRadius: 8, background: "var(--dsw-alias-state-business-tertiary)", color: "var(--dsw-alias-label-primary)", fontSize: 12.5, cursor: "pointer" },
  input: { padding: "6px 10px", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 8, fontSize: 12.5, background: "var(--dsw-alias-bg-layer-1)", color: "var(--dsw-alias-label-primary)", minWidth: 180, fontFamily: "inherit" },
  select: { padding: "6px 8px", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 8, fontSize: 12.5, background: "var(--dsw-alias-bg-layer-1)", color: "var(--dsw-alias-label-primary)" },
  count: { marginLeft: "auto", color: "var(--dsw-alias-label-tertiary)", fontSize: 12 },
  board: { display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8, alignItems: "flex-start" },
  col: { flex: "1 1 0", minWidth: 230, background: "var(--dsw-alias-bg-layer-2)", border: "1px solid var(--dsw-alias-border-l1)", borderRadius: 12, display: "flex", flexDirection: "column" },
  colHead: { padding: "10px 12px", borderBottom: "1px solid var(--dsw-alias-border-l1)", display: "flex", alignItems: "center", justifyContent: "space-between", fontWeight: 600, fontSize: 12.5, color: "var(--dsw-alias-label-primary)" },
  colCount: { background: "var(--dsw-alias-bg-layer-1)", borderRadius: 999, padding: "1px 8px", fontSize: 11.5, color: "var(--dsw-alias-label-secondary)" },
  colBody: { padding: 8, flex: 1, minHeight: 80 },
  card: { background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 10, padding: "10px 12px", marginBottom: 8, color: "var(--dsw-alias-label-primary)" },
  cardArchived: { opacity: 0.62 },
  cardTitleRow: { display: "flex", alignItems: "flex-start", gap: 6, cursor: "pointer" },
  caret: { color: "var(--dsw-alias-label-tertiary)", fontSize: 11, flexShrink: 0, marginTop: 2 },
  cardTitle: { fontWeight: 600, fontSize: 13.5, flex: 1 },
  cardMeta: { color: "var(--dsw-alias-label-tertiary)", fontSize: 11.5, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", margin: "4px 0 6px" },
  cardDesc: { color: "var(--dsw-alias-label-secondary)", fontSize: 12.5, lineHeight: 1.55, whiteSpace: "pre-wrap", marginBottom: 6 },
  cardDetail: { borderTop: "1px dashed var(--dsw-alias-border-l2)", marginTop: 6, paddingTop: 6 },
  cardDetailLine: { fontSize: 11.5, color: "var(--dsw-alias-label-tertiary)", marginBottom: 2 },
  cardActions: { display: "flex", gap: 6, marginTop: 8 },
  runningHint: { fontSize: 12, color: "var(--dsw-alias-state-business-primary)" },
  moreBtn: { width: "100%", padding: "6px 0", border: "1px dashed var(--dsw-alias-border-l2)", borderRadius: 8, background: "transparent", color: "var(--dsw-alias-label-secondary)", fontSize: 12, cursor: "pointer" },
  levelOk: { background: "var(--dsw-alias-bg-layer-2)", color: "var(--dsw-alias-label-secondary)", padding: "1px 6px", borderRadius: 4, fontSize: 11 },
  levelWarn: { background: "var(--dsw-alias-state-warn-tertiary)", color: "var(--dsw-alias-state-warn-label)", padding: "1px 6px", borderRadius: 4, fontSize: 11 },
  levelErr: { background: "var(--dsw-alias-state-error-tertiary)", color: "var(--dsw-alias-state-error-primary)", padding: "1px 6px", borderRadius: 4, fontSize: 11 },
  empty: { padding: "24px 16px", textAlign: "center", color: "var(--dsw-alias-label-tertiary)", fontSize: 12.5, lineHeight: 1.6 },
  section: { fontSize: 13.5, fontWeight: 700, margin: "18px 0 8px", color: "var(--dsw-alias-label-primary)" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12.5, color: "var(--dsw-alias-label-primary)" },
  th: { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--dsw-alias-border-l1)", color: "var(--dsw-alias-label-tertiary)", fontWeight: 600, fontSize: 11.5, whiteSpace: "nowrap" },
  td: { padding: "8px 10px", borderBottom: "1px solid var(--dsw-alias-border-l2)", verticalAlign: "top" },
  tdTitle: { fontWeight: 600, maxWidth: 420 },
  tdTime: { whiteSpace: "nowrap", color: "var(--dsw-alias-label-tertiary)", fontSize: 11.5 },
  pager: { display: "flex", alignItems: "center", gap: 10, marginTop: 12, color: "var(--dsw-alias-label-tertiary)", fontSize: 12 },
  modal: { position: "fixed", inset: 0, background: "rgba(20,22,26,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 },
  modalBox: { background: "var(--dsw-alias-bg-layer-1)", borderRadius: 14, padding: "20px 22px", maxWidth: 560, width: "90%", maxHeight: "90vh", overflow: "auto" },
  modalTitle: { fontSize: 16, fontWeight: 700, margin: "0 0 12px" },
  modalField: { marginBottom: 12 },
  modalFieldLabel: { display: "block", fontSize: 12, color: "var(--dsw-alias-label-secondary)", marginBottom: 4 },
  modalInput: { width: "100%", boxSizing: "border-box", padding: "6px 10px", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 6, fontSize: 13, background: "var(--dsw-alias-bg-layer-1)", color: "var(--dsw-alias-label-primary)", fontFamily: "inherit" },
  modalHint: { background: "var(--dsw-alias-bg-layer-2)", padding: "8px 10px", borderRadius: 6, fontSize: 12, color: "var(--dsw-alias-label-secondary)", marginTop: 6, lineHeight: 1.55 },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }
};
function api(path, body) {
  const opts = { credentials: "include", headers: { Accept: "application/json" } };
  if (body !== void 0) {
    opts.method = "POST";
    opts.headers = { ...opts.headers, "Content-Type": "application/json" };
    opts.body = JSON.stringify(body);
  }
  return fetch(path, opts).then((r) => r.json());
}
function levelStyle(level) {
  if (level === "L2" || level === "L3") return s.levelErr;
  if (level === "L1") return s.levelWarn;
  return s.levelOk;
}
function fmtTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function BoardPage() {
  const [state, setState] = (0, import_react.useState)(null);
  const [showCreate, setShowCreate] = (0, import_react.useState)(false);
  const [view, setView] = (0, import_react.useState)("board");
  const [query, setQuery] = (0, import_react.useState)("");
  const [levelFilter, setLevelFilter] = (0, import_react.useState)("\u5168\u90E8");
  const [showArchived, setShowArchived] = (0, import_react.useState)(false);
  const [expanded, setExpanded] = (0, import_react.useState)({});
  const [settledExpanded, setSettledExpanded] = (0, import_react.useState)({});
  const [listPage, setListPage] = (0, import_react.useState)(1);
  const [listDesc, setListDesc] = (0, import_react.useState)(true);
  const load = (0, import_react.useCallback)(async () => {
    const d = await api("/dsh-task-board/state");
    if (d.ok && d.state !== void 0) setState(d.state);
  }, []);
  (0, import_react.useEffect)(() => {
    void load();
  }, [load]);
  const action = (0, import_react.useCallback)(async (type, body) => {
    const d = await api("/dsh-task-board/action", { type, ...body });
    if (!d.ok) alert(d.error ?? "\u64CD\u4F5C\u5931\u8D25");
    await load();
    return d;
  }, [load]);
  const toggleExpand = (0, import_react.useCallback)((id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);
  if (state === null) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: s.wrap, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: s.sub, children: "\u52A0\u8F7D\u4EFB\u52A1\u770B\u677F\u4E2D\u2026" }) });
  }
  const q = query.trim().toLowerCase();
  const matches = (t) => {
    if (levelFilter !== "\u5168\u90E8" && t.actionLevel !== levelFilter) return false;
    if (q === "") return true;
    return t.id.toLowerCase().includes(q) || t.title.toLowerCase().includes(q) || t.prompt.toLowerCase().includes(q);
  };
  const active = state.tasks.filter((t) => !t.archived);
  const byCol = (col) => active.filter((t) => t.column === col && matches(t)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const archivedList = state.tasks.filter((t) => t.archived === true && matches(t)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const listRows = active.filter(matches).sort((a, b) => listDesc ? b.updatedAt.localeCompare(a.updatedAt) : a.updatedAt.localeCompare(b.updatedAt));
  const pageCount = Math.max(1, Math.ceil(listRows.length / LIST_PAGE_SIZE));
  const safePage = Math.min(listPage, pageCount);
  const pageRows = listRows.slice((safePage - 1) * LIST_PAGE_SIZE, safePage * LIST_PAGE_SIZE);
  const renderCard = (t, opts = {}) => {
    const isOpen = expanded[t.id] === true;
    const lastRun = t.runs.length > 0 ? t.runs[t.runs.length - 1] : void 0;
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { ...s.card, ...opts.archived === true ? s.cardArchived : {} }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.cardTitleRow, onClick: () => toggleExpand(t.id), children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: s.caret, children: isOpen ? "\u25BE" : "\u25B8" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: s.cardTitle, children: t.title })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.cardMeta, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: levelStyle(t.actionLevel), children: t.actionLevel }),
        t.cron !== void 0 && t.cron !== "" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          "\u23F0 ",
          t.cron
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u4E00\u6B21\u6027" }),
        t.lastStatus !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          "\xB7 ",
          t.lastStatus
        ] }) : null,
        opts.archived === true ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\xB7 \u5DF2\u5F52\u6863" }) : null
      ] }),
      isOpen && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.cardDetail, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: s.cardDesc, children: t.prompt }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.cardDetailLine, children: [
          "\u4EFB\u52A1\u53F7 ",
          t.id,
          " \xB7 \u66F4\u65B0\u4E8E ",
          fmtTime(t.updatedAt)
        ] }),
        lastRun?.summary !== void 0 && lastRun.summary !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.cardDetailLine, children: [
          "\u6700\u8FD1\u7ED3\u679C\uFF1A",
          lastRun.summary
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.cardActions, children: [
        t.column !== "\u5DF2\u5B8C\u6210" && t.column !== "\u8FDB\u884C\u4E2D" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: s.btn2, onClick: () => void action("run", { id: t.id }).then((d) => {
          const run = d.run;
          if (run && (run.status === "\u5DF2\u963B\u65AD" || run.status === "\u5F85\u5BA1\u6279")) {
            window.alert(`${run.status}\uFF1A${run.summary ?? "\u8BE5\u4EFB\u52A1\u9700\u8981\u4E3B\u4EFB\u6279\u51C6\u540E\u624D\u4F1A\u6267\u884C\uFF08\u53EF\u5728\u4ECA\u65E5\u5F85\u529E\u6279\u51C6\uFF09"}`);
          }
        }), children: "\u25B6 \u6267\u884C" }),
        t.column === "\u8FDB\u884C\u4E2D" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: s.runningHint, children: "\u6267\u884C\u4E2D\u2026" }),
        t.column !== "\u8FDB\u884C\u4E2D" && (opts.archived === true ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: s.btn2, onClick: () => void action("archive", { id: t.id, task: { archived: false } }), children: "\u6062\u590D" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: s.btn2, onClick: () => void action("archive", { id: t.id, task: { archived: true } }), children: "\u5F52\u6863" }))
      ] })
    ] }, t.id);
  };
  const renderColumn = (colId) => {
    const list = byCol(colId);
    const label = COLUMNS.find((c) => c.id === colId)?.label ?? colId;
    const settled = colId === "\u5DF2\u5B8C\u6210" || colId === "\u5DF2\u5931\u8D25";
    const visible = settled && settledExpanded[colId] !== true ? list.slice(0, SETTLED_LIMIT) : list;
    const rest = list.length - visible.length;
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.col, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.colHead, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: s.colCount, children: list.length })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: s.colBody, children: list.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: s.empty, children: "\u6682\u65E0\u4EFB\u52A1" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        visible.map((t) => renderCard(t)),
        settled && rest > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { style: s.moreBtn, onClick: () => setSettledExpanded((prev) => ({ ...prev, [colId]: true })), children: [
          "\u5C55\u5F00\u5176\u4F59 ",
          rest,
          " \u6761"
        ] })
      ] }) })
    ] }, colId);
  };
  const renderList = () => {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { style: s.table, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { style: s.th, children: "\u4EFB\u52A1\u53F7" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { style: s.th, children: "\u6807\u9898" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { style: s.th, children: "\u7EA7\u522B" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { style: s.th, children: "\u72B6\u6001" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { style: s.th, children: "\u5217" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("th", { style: { ...s.th, cursor: "pointer" }, onClick: () => setListDesc((v) => !v), children: [
            "\u66F4\u65B0\u65F6\u95F4 ",
            listDesc ? "\u2193" : "\u2191"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { style: s.th })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tbody", { children: [
          pageRows.map((t) => {
            const isOpen = expanded[`list:${t.id}`] === true;
            const lastRun = t.runs.length > 0 ? t.runs[t.runs.length - 1] : void 0;
            return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { style: s.td, children: t.id }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { style: { ...s.td, ...s.tdTitle }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { ...s.cardTitleRow }, onClick: () => setExpanded((prev) => ({ ...prev, [`list:${t.id}`]: !prev[`list:${t.id}`] })), children: t.title }) }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { style: s.td, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: levelStyle(t.actionLevel), children: t.actionLevel }) }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { style: s.td, children: t.lastStatus ?? "\u2014" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { style: s.td, children: t.column }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { style: s.tdTime, children: fmtTime(t.updatedAt) }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { style: s.td, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.cardActions, children: [
                  t.column !== "\u5DF2\u5B8C\u6210" && t.column !== "\u8FDB\u884C\u4E2D" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: s.btn2, onClick: () => void action("run", { id: t.id }), children: "\u25B6" }),
                  t.column === "\u8FDB\u884C\u4E2D" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: s.runningHint, children: "\u6267\u884C\u4E2D\u2026" }),
                  t.column !== "\u8FDB\u884C\u4E2D" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: s.btn2, onClick: () => void action("archive", { id: t.id, task: { archived: !t.archived } }), children: t.archived === true ? "\u6062\u590D" : "\u5F52\u6863" })
                ] }) })
              ] }, t.id),
              isOpen && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { style: s.td, colSpan: 7, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: s.cardDesc, children: t.prompt }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.cardDetailLine, children: [
                  "\u6700\u8FD1\u7ED3\u679C\uFF1A",
                  lastRun?.summary ?? "\uFF08\u65E0\uFF09"
                ] })
              ] }) }, `${t.id}-detail`)
            ] });
          }),
          pageRows.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tr", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { style: s.td, colSpan: 7, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: s.empty, children: "\u6CA1\u6709\u5339\u914D\u7684\u4EFB\u52A1" }) }) })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.pager, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          "\u5171 ",
          listRows.length,
          " \u6761 \xB7 \u7B2C ",
          safePage,
          "/",
          pageCount,
          " \u9875"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: s.btn2, disabled: safePage <= 1, onClick: () => setListPage((p) => Math.max(1, p - 1)), children: "\u4E0A\u4E00\u9875" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: s.btn2, disabled: safePage >= pageCount, onClick: () => setListPage((p) => Math.min(pageCount, p + 1)), children: "\u4E0B\u4E00\u9875" })
      ] })
    ] });
  };
  const missingAny = Object.values({}).some(Boolean);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.wrap, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.head, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", { style: s.h, children: "\u4EFB\u52A1\u770B\u677F" }),
      state.governance?.mode === "\u672C\u5730" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "span",
        {
          style: s.badgeDegraded,
          title: "dsh-ledger \u672A\u5B89\u88C5\uFF1AL0/L1/L2 \u4EFB\u52A1\u964D\u7EA7\u8FD0\u884C\uFF08summary \u6807\u6CE8\u300C\u65E0\u8D26\u672C\u6CBB\u7406\u300D\uFF09\uFF0CL3 \u4E0D\u53EF\u9006\u52A8\u4F5C\u4E00\u5F8B\u62D2\u7EDD\u3002\u5B89\u88C5\u8D26\u672C\u540E\u6062\u590D\u5B8C\u6574 L0-L3 \u5BA1\u6279\u6CBB\u7406\u3002",
          children: "\u26A0 \u8D26\u672C\u672A\u5B89\u88C5 \xB7 \u672C\u5730\u964D\u7EA7\u6CBB\u7406"
        }
      ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: s.badge, children: "\u2713 \u6CBB\u7406\u5C31\u7EEA" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { style: s.sub, children: "\u4EFB\u52A1\u4E2D\u5FC3\u5316\u2014\u2014\u5E03\u7F6E \u2192 \u8D26\u672C\u88C1\u51B3 \u2192 \u5206\u8EAB\u6267\u884C \u2192 \u81EA\u62A5 \u2192 \u4E3B\u4EFB\u786E\u8BA4\u3002\u5DF2\u5B8C\u6210\u6EE1 7 \u5929\u81EA\u52A8\u5F52\u6863\uFF08\u300C\u542B\u5F52\u6863\u300D\u53EF\u67E5\uFF09\u3002" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.actionRow, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: s.btn, onClick: () => setShowCreate(true), children: "+ \u65B0\u5EFA\u4EFB\u52A1" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: s.btn2, onClick: () => void load(), children: "\u5237\u65B0" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: view === "board" ? s.btn2Active : s.btn2, onClick: () => setView("board"), children: "\u770B\u677F" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: view === "list" ? s.btn2Active : s.btn2, onClick: () => {
        setView("list");
        setListPage(1);
      }, children: "\u5217\u8868" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          style: s.input,
          placeholder: "\u641C\u7D22\uFF1A\u4EFB\u52A1\u53F7 / \u6807\u9898 / \u5185\u5BB9\u2026",
          value: query,
          onChange: (e) => {
            setQuery(e.target.value);
            setListPage(1);
          }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "select",
        {
          style: s.select,
          value: levelFilter,
          onChange: (e) => {
            setLevelFilter(e.target.value);
            setListPage(1);
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "\u5168\u90E8", children: "\u5168\u90E8\u7EA7\u522B" }),
            LEVEL_OPTIONS.map((l) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: l, children: l }, l))
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: showArchived ? s.btn2Active : s.btn2, onClick: () => setShowArchived((v) => !v), children: showArchived ? "\u2713 \u542B\u5F52\u6863" : "\u542B\u5F52\u6863" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: s.count, children: [
        "\u5171 ",
        active.length,
        " \u4E2A\u4EFB\u52A1",
        q !== "" || levelFilter !== "\u5168\u90E8" ? ` \xB7 \u5339\u914D ${listRows.length}` : ""
      ] })
    ] }),
    view === "board" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: s.board, children: COLUMNS.map((col) => renderColumn(col.id)) }) : renderList(),
    showArchived && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.section, children: [
        "\u5F52\u6863\uFF08",
        archivedList.length,
        "\uFF09\u2014\u2014\u5DF2\u5B8C\u6210\u7684\u4EFB\u52A1\u6EE1 7 \u5929\u81EA\u52A8\u5F52\u6863\uFF0C\u6570\u636E\u4FDD\u7559\u53EF\u6062\u590D"
      ] }),
      archivedList.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: s.empty, children: "\u6682\u65E0\u5F52\u6863\u4EFB\u52A1" }) : archivedList.map((t) => renderCard(t, { archived: true }))
    ] }),
    showCreate && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CreateModal, { onClose: () => setShowCreate(false), onCreated: () => {
      setShowCreate(false);
      void load();
    } })
  ] });
}
function CreateModal({ onClose, onCreated }) {
  const [title, setTitle] = (0, import_react.useState)("");
  const [prompt, setPrompt] = (0, import_react.useState)("");
  const [actionType, setActionType] = (0, import_react.useState)("\u6574\u7406\u6C47\u62A5");
  const [targetScope, setTargetScope] = (0, import_react.useState)("\u672C\u673A");
  const [actionLevel, setActionLevel] = (0, import_react.useState)("L1");
  const [cron, setCron] = (0, import_react.useState)("");
  const submit = async () => {
    const d = await api("/dsh-task-board/action", {
      type: "create",
      task: { title, prompt, actionType, targetScope, actionLevel, ...cron.trim() !== "" ? { cron } : {} }
    });
    if (!d.ok) {
      alert(d.error ?? "\u521B\u5EFA\u5931\u8D25");
      return;
    }
    onClose();
    onCreated();
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: s.modal, onClick: onClose, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.modalBox, onClick: (e) => e.stopPropagation(), children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { style: s.modalTitle, children: "\u65B0\u5EFA\u4EFB\u52A1" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.modalField, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: s.modalFieldLabel, children: "\u6807\u9898\uFF08\u5FC5\u586B\uFF09" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { style: s.modalInput, value: title, onChange: (e) => setTitle(e.target.value) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.modalField, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: s.modalFieldLabel, children: "\u6267\u884C\u63D0\u793A\u8BCD\uFF08\u5FC5\u586B\u2014\u2014\u6267\u884C\u4F1A\u8BDD\u4F9D\u8D56\u5B83\u72EC\u7ACB\u5B8C\u6210\u5DE5\u4F5C\uFF09" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", { style: { ...s.modalInput, minHeight: 90 }, value: prompt, onChange: (e) => setPrompt(e.target.value) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.modalField, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: s.modalFieldLabel, children: "\u52A8\u4F5C\u7C7B\u578B\uFF08\u8D26\u672C\u5206\u7EA7\u4F9D\u636E\uFF09" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { style: s.modalInput, value: actionType, onChange: (e) => setActionType(e.target.value) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.modalField, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: s.modalFieldLabel, children: "\u76EE\u6807\u8303\u56F4\uFF08\u8D26\u672C\u5206\u7EA7\u4F9D\u636E\uFF09" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { style: s.modalInput, value: targetScope, onChange: (e) => setTargetScope(e.target.value) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.modalField, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: s.modalFieldLabel, children: "\u52A8\u4F5C\u7EA7\u522B" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", { style: s.modalInput, value: actionLevel, onChange: (e) => setActionLevel(e.target.value), children: LEVEL_OPTIONS.map((l) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: l, children: l }, l)) }),
      (actionLevel === "L2" || actionLevel === "L3") && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: s.modalHint, children: "L2/L3 \u521B\u5EFA\u65F6\u7ACB\u5373\u89E6\u53D1\u88C1\u51B3\uFF1A\u9700\u4E3B\u4EFB\u6279\u51C6\u540E\u624D\u53EF\u6267\u884C\u3002" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.modalField, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { style: s.modalFieldLabel, children: "cron\uFF08\u53EF\u9009\uFF0C\u7559\u7A7A=\u4E00\u6B21\u6027\uFF09" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { style: s.modalInput, value: cron, onChange: (e) => setCron(e.target.value), placeholder: "\u5982\uFF1A0 9 * * 1-5" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: s.modalActions, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: s.btn2, onClick: onClose, children: "\u53D6\u6D88" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: s.btn, disabled: title.trim() === "" || prompt.trim() === "", onClick: () => void submit(), children: "\u521B\u5EFA" })
    ] })
  ] }) });
}
function apply(ctx) {
  ctx.slots.inject(
    "conversation.view",
    () => ctx.slots.register(
      { name: "conversation.view", id: "task-board", order: 22, label: () => "\u4EFB\u52A1\u770B\u677F" },
      BoardPage
    )
  );
}
		return module.exports;
	}
});
//# sourceMappingURL=client.js.map
